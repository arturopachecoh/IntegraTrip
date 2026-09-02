import logging
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import oauth
from app.crud import upsert_mcp_connection
from app.models import MCPConnection

logger = logging.getLogger(__name__)

# Margen amplio a propósito: `token_expires_at` se calcula con el reloj de este
# servidor (`utcnow() + expires_in`), así que cualquier desfase con el AS acorta
# la vida real del token. 60s dejaba una ventana en la que la DB creía que el
# token seguía vivo y el MCP ya lo rechazaba.
REFRESH_MARGIN_SECONDS = 300


class MCPConnectionNotFoundError(Exception):
    pass


class TokenRefreshError(Exception):
    pass


async def get_valid_access_token(
    db: AsyncSession, *, user_id: uuid.UUID, oauth_client_id: uuid.UUID, force_refresh: bool = False
) -> str:
    """Returns a live access_token for this user+provider, refreshing it first if it's
    expired or about to expire. Raises TokenRefreshError if the refresh itself fails
    (e.g. refresh_token revoked) — callers should treat that as "user must reconnect".

    `force_refresh` ignores the stored expiry and refreshes anyway: for when the MCP
    server rejected the token even though we still considered it valid."""
    stmt = (
        select(MCPConnection)
        .options(joinedload(MCPConnection.oauth_client))
        .where(MCPConnection.user_id == user_id, MCPConnection.oauth_client_id == oauth_client_id)
    )
    connection = (await db.execute(stmt)).scalar_one_or_none()
    if connection is None:
        raise MCPConnectionNotFoundError(f"no mcp connection for user={user_id} oauth_client={oauth_client_id}")

    expires_soon = connection.token_expires_at is None or connection.token_expires_at <= datetime.utcnow() + timedelta(
        seconds=REFRESH_MARGIN_SECONDS
    )
    if not expires_soon and not force_refresh:
        return connection.access_token

    if not connection.refresh_token:
        raise TokenRefreshError("access token expired and no refresh_token is stored; user must reconnect")

    oauth_client = connection.oauth_client
    try:
        token_resp = await oauth.refresh_access_token(
            token_endpoint=oauth_client.token_endpoint,
            refresh_token=connection.refresh_token,
            client_id=oauth_client.client_id,
            client_secret=oauth_client.client_secret,
        )
    except oauth.OAuthTokenError as exc:
        logger.warning("token refresh failed provider=%s", oauth_client.provider)
        raise TokenRefreshError(f"refresh failed for provider={oauth_client.provider}; user must reconnect") from exc

    new_expires_at = datetime.utcnow() + timedelta(seconds=token_resp.expires_in)
    updated = await upsert_mcp_connection(
        db,
        user_id=user_id,
        oauth_client_id=oauth_client_id,
        access_token=token_resp.access_token,
        refresh_token=token_resp.refresh_token or connection.refresh_token,
        token_expires_at=new_expires_at,
    )
    await db.commit()
    logger.info("token refreshed provider=%s user_id=%s", oauth_client.provider, user_id)
    return updated.access_token
