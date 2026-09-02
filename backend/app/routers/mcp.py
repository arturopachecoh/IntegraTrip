import logging
import uuid

from fastapi import APIRouter, Body, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import mcp_client
from app.db import get_db
from app.dependencies import get_current_user
from app.models import MCPConnection, User
from app.schemas import MCPConnectionOut
from app.tokens import TokenRefreshError, get_valid_access_token

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["mcp"])


async def _get_owned_connection(db: AsyncSession, *, connection_id: uuid.UUID, user_id: uuid.UUID) -> MCPConnection:
    stmt = (
        select(MCPConnection)
        .options(joinedload(MCPConnection.oauth_client))
        .where(MCPConnection.id == connection_id, MCPConnection.user_id == user_id)
    )
    connection = (await db.execute(stmt)).scalar_one_or_none()
    if connection is None:
        raise HTTPException(status_code=404, detail="connection not found")
    return connection


@router.get("/connections", response_model=list[MCPConnectionOut])
async def list_connections(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> list[MCPConnectionOut]:
    stmt = (
        select(MCPConnection)
        .options(joinedload(MCPConnection.oauth_client))
        .where(MCPConnection.user_id == user.id)
    )
    connections = (await db.execute(stmt)).scalars().all()
    return [
        MCPConnectionOut(
            id=c.id,
            provider=c.oauth_client.provider,
            auth_type=c.oauth_client.auth_type,
            connected_at=c.created_at,
        )
        for c in connections
    ]


@router.get("/mcp/{connection_id}/tools")
async def get_tools(
    connection_id: uuid.UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await _get_owned_connection(db, connection_id=connection_id, user_id=user.id)

    try:
        access_token = await get_valid_access_token(
            db, user_id=user.id, oauth_client_id=connection.oauth_client_id
        )
    except TokenRefreshError as exc:
        logger.warning("token refresh failed connection_id=%s", connection_id)
        raise HTTPException(status_code=502, detail=f"provider connection needs reconnecting: {exc}")

    try:
        return await mcp_client.list_tools(connection.oauth_client.mcp_url, access_token)
    except mcp_client.MCPTransportError as exc:
        logger.warning("mcp transport error connection_id=%s: %s", connection_id, exc)
        raise HTTPException(status_code=502, detail=f"MCP server unreachable: {exc}")
    except mcp_client.MCPError as exc:
        logger.warning("mcp rpc error connection_id=%s: %s", connection_id, exc)
        raise HTTPException(status_code=502, detail=f"MCP error {exc.code}: {exc.message}")


@router.post("/mcp/{connection_id}/tools/{tool_name}/call")
async def call_tool(
    connection_id: uuid.UUID,
    tool_name: str,
    arguments: dict = Body(default_factory=dict),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    connection = await _get_owned_connection(db, connection_id=connection_id, user_id=user.id)

    try:
        access_token = await get_valid_access_token(
            db, user_id=user.id, oauth_client_id=connection.oauth_client_id
        )
    except TokenRefreshError as exc:
        logger.warning("token refresh failed connection_id=%s", connection_id)
        raise HTTPException(status_code=502, detail=f"provider connection needs reconnecting: {exc}")

    try:
        return await mcp_client.call_tool(connection.oauth_client.mcp_url, access_token, tool_name, arguments)
    except mcp_client.MCPTransportError as exc:
        logger.warning("mcp transport error connection_id=%s tool=%s: %s", connection_id, tool_name, exc)
        raise HTTPException(status_code=502, detail=f"MCP server unreachable: {exc}")
    except mcp_client.MCPError as exc:
        logger.warning("mcp rpc error connection_id=%s tool=%s: %s", connection_id, tool_name, exc)
        raise HTTPException(status_code=502, detail=f"MCP error {exc.code}: {exc.message}")
