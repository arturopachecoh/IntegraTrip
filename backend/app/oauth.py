import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlencode

import httpx
import jwt


def _b64url_nopad(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64url_nopad_decode(data: str) -> bytes:
    padded = data + "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(padded)


# --- Discovery ---

_DISCOVERY_CACHE: dict[str, tuple[float, "DiscoveryDocument"]] = {}
_DISCOVERY_TTL_SECONDS = 3600


class OAuthDiscoveryError(Exception):
    pass


@dataclass(frozen=True)
class DiscoveryDocument:
    authorization_endpoint: str
    token_endpoint: str
    jwks_uri: str | None
    code_challenge_methods_supported: list[str]
    grant_types_supported: list[str]
    raw: dict[str, Any]


async def discover(issuer_url: str, *, force_refresh: bool = False) -> DiscoveryDocument:
    now = time.time()
    if not force_refresh:
        cached = _DISCOVERY_CACHE.get(issuer_url)
        if cached is not None and cached[0] > now:
            return cached[1]

    url = f"{issuer_url.rstrip('/')}/.well-known/openid-configuration"
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(url)

    if response.status_code != 200:
        raise OAuthDiscoveryError(f"discovery request to {url} returned HTTP {response.status_code}")

    data = response.json()
    try:
        doc = DiscoveryDocument(
            authorization_endpoint=data["authorization_endpoint"],
            token_endpoint=data["token_endpoint"],
            jwks_uri=data.get("jwks_uri"),
            code_challenge_methods_supported=data.get("code_challenge_methods_supported", []),
            grant_types_supported=data.get("grant_types_supported", []),
            raw=data,
        )
    except KeyError as exc:
        raise OAuthDiscoveryError(f"discovery document from {url} is missing field {exc}") from exc

    _DISCOVERY_CACHE[issuer_url] = (now + _DISCOVERY_TTL_SECONDS, doc)
    return doc


# --- PKCE ---


@dataclass(frozen=True)
class PKCEPair:
    code_verifier: str
    code_challenge: str
    code_challenge_method: str = "S256"


def generate_pkce_pair() -> PKCEPair:
    code_verifier = secrets.token_urlsafe(64)
    code_challenge = _b64url_nopad(hashlib.sha256(code_verifier.encode("ascii")).digest())
    return PKCEPair(code_verifier=code_verifier, code_challenge=code_challenge)


# --- Signed, stateless state token ---


ALLOWED_INTENTS = ("login", "connect")


class InvalidStateError(Exception):
    pass


@dataclass(frozen=True)
class StatePayload:
    code_verifier: str
    intent: str


def sign_state(*, code_verifier: str, provider_slug: str, intent: str = "connect", ttl_seconds: int = 600) -> str:
    secret_key = os.environ["SECRET_KEY"]
    payload = {
        "cv": code_verifier,
        "provider": provider_slug,
        "intent": intent,
        "nonce": secrets.token_urlsafe(12),
        "exp": int(time.time()) + ttl_seconds,
    }
    payload_b64 = _b64url_nopad(json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8"))
    signature = hmac.new(secret_key.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_nopad(signature)}"


def verify_state(state: str, *, provider_slug: str) -> StatePayload:
    secret_key = os.environ["SECRET_KEY"]

    try:
        payload_b64, signature_b64 = state.rsplit(".", 1)
    except ValueError as exc:
        raise InvalidStateError("state is malformed") from exc

    expected_signature = hmac.new(secret_key.encode("utf-8"), payload_b64.encode("ascii"), hashlib.sha256).digest()
    if not hmac.compare_digest(signature_b64, _b64url_nopad(expected_signature)):
        raise InvalidStateError("state signature is invalid")

    try:
        payload = json.loads(_b64url_nopad_decode(payload_b64))
    except (ValueError, UnicodeDecodeError) as exc:
        raise InvalidStateError("state payload is malformed") from exc

    if payload.get("provider") != provider_slug:
        raise InvalidStateError("state was not issued for this provider")
    if payload.get("exp", 0) < int(time.time()):
        raise InvalidStateError("state has expired")

    intent = payload.get("intent")
    if intent not in ALLOWED_INTENTS:
        raise InvalidStateError("state has an invalid or missing intent")

    code_verifier = payload.get("cv")
    if not code_verifier:
        raise InvalidStateError("state is missing code_verifier")

    return StatePayload(code_verifier=code_verifier, intent=intent)


# --- Authorize URL ---


def build_authorize_url(
    *,
    authorization_endpoint: str,
    client_id: str,
    redirect_uri: str,
    code_challenge: str,
    resource: str,
    scope: str,
    state: str,
) -> str:
    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "scope": scope,
        "resource": resource,
        "state": state,
    }
    return f"{authorization_endpoint}?{urlencode(params)}"


# --- Token exchange / refresh ---


class OAuthTokenError(Exception):
    pass


@dataclass(frozen=True)
class TokenResponse:
    access_token: str
    refresh_token: str | None
    expires_in: int
    token_type: str
    scope: str | None
    raw: dict[str, Any]


async def _request_token(token_endpoint: str, data: dict[str, str]) -> TokenResponse:
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(token_endpoint, data=data)

    if response.status_code != 200:
        raise OAuthTokenError(f"token request to {token_endpoint} returned HTTP {response.status_code}")

    payload = response.json()
    try:
        return TokenResponse(
            access_token=payload["access_token"],
            refresh_token=payload.get("refresh_token"),
            expires_in=int(payload["expires_in"]),
            token_type=payload.get("token_type", "Bearer"),
            scope=payload.get("scope"),
            raw=payload,
        )
    except (KeyError, ValueError, TypeError) as exc:
        raise OAuthTokenError(f"malformed token response: {exc}") from exc


async def exchange_code_for_token(
    *,
    token_endpoint: str,
    code: str,
    redirect_uri: str,
    client_id: str,
    client_secret: str | None,
    code_verifier: str,
) -> TokenResponse:
    data = {
        "grant_type": "authorization_code",
        "code": code,
        "redirect_uri": redirect_uri,
        "client_id": client_id,
        "code_verifier": code_verifier,
    }
    if client_secret is not None:
        data["client_secret"] = client_secret
    return await _request_token(token_endpoint, data)


async def refresh_access_token(
    *,
    token_endpoint: str,
    refresh_token: str,
    client_id: str,
    client_secret: str | None,
) -> TokenResponse:
    data = {
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
        "client_id": client_id,
    }
    if client_secret is not None:
        data["client_secret"] = client_secret
    return await _request_token(token_endpoint, data)


# --- Dynamic Client Registration (RFC 7591) ---


class OAuthRegistrationError(Exception):
    pass


async def register_dynamic_client(registration_endpoint: str, *, client_name: str, redirect_uri: str) -> dict:
    payload = {
        "client_name": client_name,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "client_secret_post",
    }
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.post(registration_endpoint, json=payload)

    if response.status_code not in (200, 201):
        raise OAuthRegistrationError(
            f"registration request to {registration_endpoint} returned HTTP {response.status_code}"
        )

    return response.json()


# --- JWT / JWKS verification ---


class JWTValidationError(Exception):
    pass


@dataclass(frozen=True)
class VerifiedClaims:
    sub: str
    email: str
    student_id: str | None
    scope: str | None
    client_id: str
    iss: str
    aud: str
    exp: int
    raw: dict[str, Any]


def verify_access_token(access_token: str, *, jwks_uri: str, audience: str, issuer: str) -> VerifiedClaims:
    try:
        signing_key = jwt.PyJWKClient(jwks_uri).get_signing_key_from_jwt(access_token)
        alg = jwt.get_unverified_header(access_token)["alg"]
        claims = jwt.decode(
            access_token,
            signing_key.key,
            algorithms=[alg],
            audience=audience,
            issuer=issuer,
            leeway=10,
            options={"require": ["exp", "aud", "iss"]},
        )
    except jwt.exceptions.PyJWTError as exc:
        raise JWTValidationError(str(exc)) from exc

    try:
        return VerifiedClaims(
            sub=claims["sub"],
            email=claims["email"],
            student_id=claims.get("student_id"),
            scope=claims.get("scope"),
            client_id=claims.get("client_id", ""),
            iss=claims.get("iss", ""),
            aud=claims.get("aud", ""),
            exp=claims.get("exp", 0),
            raw=claims,
        )
    except KeyError as exc:
        raise JWTValidationError(f"access token is missing claim {exc}") from exc
