import os
from dataclasses import dataclass


class ProviderNotFoundError(Exception):
    pass


@dataclass(frozen=True)
class ProviderConfig:
    url_slug: str
    db_provider: str
    auth_type: str
    client_id: str | None
    client_secret: str | None
    redirect_uri: str
    mcp_url: str
    issuer: str
    jwks_uri_fallback: str


def _andes_air_config() -> ProviderConfig:
    return ProviderConfig(
        url_slug="andes-air",
        db_provider="andes_air",
        auth_type="pre",
        client_id=os.environ["ANDES_AIR_CLIENT_ID"],
        client_secret=os.environ.get("ANDES_AIR_CLIENT_SECRET"),
        redirect_uri=os.environ["ANDES_AIR_REDIRECT_URI"],
        mcp_url=os.environ["ANDES_AIR_MCP_URL"],
        issuer=os.environ["ANDES_AIR_ISSUER"],
        jwks_uri_fallback=os.environ["ANDES_AIR_JWKS_URI"],
    )


def _staywell_config() -> ProviderConfig:
    return ProviderConfig(
        url_slug="staywell",
        db_provider="staywell",
        auth_type="dcr",
        client_id=None,
        client_secret=None,
        redirect_uri=os.environ["STAYWELL_REDIRECT_URI"],
        mcp_url=os.environ["STAYWELL_MCP_URL"],
        issuer=os.environ["STAYWELL_ISSUER"],
        jwks_uri_fallback=os.environ["STAYWELL_JWKS_URI"],
    )


def _cielo_sur_config() -> ProviderConfig:
    base_url = os.environ["PUBLIC_BASE_URL"].rstrip("/")
    return ProviderConfig(
        url_slug="cielo-sur",
        db_provider="cielo_sur",
        auth_type="cimd",
        client_id=f"{base_url}/.well-known/oauth-client-metadata.json",
        client_secret=None,
        redirect_uri=f"{base_url}/api/auth/cielo-sur/callback",
        mcp_url=os.environ["CIELO_SUR_MCP_URL"],
        issuer=os.environ["CIELO_SUR_ISSUER"],
        jwks_uri_fallback=os.environ["CIELO_SUR_JWKS_URI"],
    )


_PROVIDER_BUILDERS = {
    "andes-air": _andes_air_config,
    "staywell": _staywell_config,
    "cielo-sur": _cielo_sur_config,
}


def get_provider_config(slug: str) -> ProviderConfig:
    builder = _PROVIDER_BUILDERS.get(slug)
    if builder is None:
        raise ProviderNotFoundError(slug)
    return builder()
