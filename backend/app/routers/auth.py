import logging
import os
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app import crud, oauth
from app.config import ProviderConfig, ProviderNotFoundError, get_provider_config
from app.db import get_db
from app.session import (
    SESSION_COOKIE_NAME,
    SESSION_TTL_SECONDS,
    SessionTokenError,
    create_session_token,
    verify_session_token,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _frontend_url() -> str:
    return os.environ.get("FRONTEND_URL", "http://localhost:5173")


def _error_redirect(provider: str, reason: str) -> RedirectResponse:
    return RedirectResponse(f"{_frontend_url()}/connections?status=error&provider={provider}&reason={reason}")


def _has_valid_session(request: Request) -> bool:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        return False
    try:
        verify_session_token(token)
        return True
    except SessionTokenError:
        return False


async def _resolve_client_credentials(
    db: AsyncSession, doc: oauth.DiscoveryDocument, cfg: ProviderConfig
) -> tuple[str, str | None]:
    if cfg.auth_type != "dcr":
        return cfg.client_id, cfg.client_secret

    existing = await crud.get_oauth_client_by_provider(db, db_provider=cfg.db_provider)
    if existing is not None and existing.client_id:
        return existing.client_id, existing.client_secret

    registration_endpoint = doc.raw.get("registration_endpoint")
    if not registration_endpoint:
        raise oauth.OAuthRegistrationError(f"discovery document for {cfg.db_provider} has no registration_endpoint")

    registration = await oauth.register_dynamic_client(
        registration_endpoint, client_name="IntegraTrip", redirect_uri=cfg.redirect_uri
    )
    client_id = registration.get("client_id")
    if not client_id:
        raise oauth.OAuthRegistrationError(f"registration response for {cfg.db_provider} is missing client_id")
    return client_id, registration.get("client_secret")


@router.get("/{provider}/connect")
async def connect(provider: str, intent: str = "connect", db: AsyncSession = Depends(get_db)):
    if intent not in oauth.ALLOWED_INTENTS:
        raise HTTPException(status_code=400, detail="invalid intent")

    try:
        cfg = get_provider_config(provider)
    except ProviderNotFoundError:
        raise HTTPException(status_code=404, detail="unknown provider")

    try:
        doc = await oauth.discover(cfg.issuer)
    except oauth.OAuthDiscoveryError:
        logger.warning("discovery failed provider=%s", provider)
        raise HTTPException(status_code=502, detail="authorization server unavailable")

    try:
        client_id, client_secret = await _resolve_client_credentials(db, doc, cfg)
    except oauth.OAuthRegistrationError:
        logger.warning("dynamic client registration failed provider=%s", provider)
        raise HTTPException(status_code=502, detail="client registration failed")

    await crud.get_or_create_oauth_client(
        db,
        db_provider=cfg.db_provider,
        auth_type=cfg.auth_type,
        mcp_url=cfg.mcp_url,
        authorization_endpoint=doc.authorization_endpoint,
        token_endpoint=doc.token_endpoint,
        client_id=client_id,
        client_secret=client_secret,
    )
    await db.commit()

    pkce = oauth.generate_pkce_pair()
    state = oauth.sign_state(code_verifier=pkce.code_verifier, provider_slug=provider, intent=intent)
    url = oauth.build_authorize_url(
        authorization_endpoint=doc.authorization_endpoint,
        client_id=client_id,
        redirect_uri=cfg.redirect_uri,
        code_challenge=pkce.code_challenge,
        resource=cfg.mcp_url,
        scope="mcp:tools",
        state=state,
    )
    return RedirectResponse(url, status_code=302)


@router.get("/{provider}/callback")
async def callback(provider: str, request: Request, db: AsyncSession = Depends(get_db)):
    try:
        cfg = get_provider_config(provider)
    except ProviderNotFoundError:
        raise HTTPException(status_code=404, detail="unknown provider")

    if "error" in request.query_params:
        logger.info("oauth consent denied provider=%s", provider)
        return _error_redirect(provider, "denied")

    code = request.query_params.get("code")
    state = request.query_params.get("state")
    if not code or not state:
        return _error_redirect(provider, "missing_params")

    try:
        state_payload = oauth.verify_state(state, provider_slug=provider)
    except oauth.InvalidStateError:
        logger.warning("invalid state provider=%s", provider)
        return _error_redirect(provider, "invalid_state")

    code_verifier = state_payload.code_verifier
    intent = state_payload.intent

    try:
        doc = await oauth.discover(cfg.issuer)
        client_id, client_secret = await _resolve_client_credentials(db, doc, cfg)
        oauth_client = await crud.get_or_create_oauth_client(
            db,
            db_provider=cfg.db_provider,
            auth_type=cfg.auth_type,
            mcp_url=cfg.mcp_url,
            authorization_endpoint=doc.authorization_endpoint,
            token_endpoint=doc.token_endpoint,
            client_id=client_id,
            client_secret=client_secret,
        )
        token_resp = await oauth.exchange_code_for_token(
            token_endpoint=oauth_client.token_endpoint,
            code=code,
            redirect_uri=cfg.redirect_uri,
            client_id=client_id,
            client_secret=client_secret,
            code_verifier=code_verifier,
        )
    except (oauth.OAuthDiscoveryError, oauth.OAuthRegistrationError, oauth.OAuthTokenError):
        await db.rollback()
        logger.warning("token exchange failed provider=%s", provider)
        return _error_redirect(provider, "token_exchange_failed")

    try:
        jwks_uri = doc.jwks_uri or cfg.jwks_uri_fallback
        claims = oauth.verify_access_token(
            token_resp.access_token,
            jwks_uri=jwks_uri,
            audience=cfg.mcp_url,
            issuer=cfg.issuer,
        )
    except oauth.JWTValidationError:
        await db.rollback()
        logger.warning("jwt validation failed provider=%s", provider)
        return _error_redirect(provider, "invalid_token")

    user = await crud.get_or_create_user(db, email=claims.email, student_id=claims.student_id)

    if intent == "connect":
        token_expires_at = datetime.utcnow() + timedelta(seconds=token_resp.expires_in)
        await crud.upsert_mcp_connection(
            db,
            user_id=user.id,
            oauth_client_id=oauth_client.id,
            access_token=token_resp.access_token,
            refresh_token=token_resp.refresh_token,
            token_expires_at=token_expires_at,
        )

    await db.commit()

    logger.info("oauth callback succeeded provider=%s user_id=%s intent=%s", provider, user.id, intent)

    redirect = RedirectResponse(f"{_frontend_url()}/connections?status=success&provider={provider}&intent={intent}")
    if not _has_valid_session(request):
        redirect.set_cookie(
            key=SESSION_COOKIE_NAME,
            value=create_session_token(user.id),
            max_age=SESSION_TTL_SECONDS,
            httponly=True,
            samesite="lax",
            secure=request.url.scheme == "https",
            path="/",
        )
    return redirect


@router.post("/logout")
async def logout():
    response = Response(status_code=204)
    response.delete_cookie(key=SESSION_COOKIE_NAME, path="/")
    return response
