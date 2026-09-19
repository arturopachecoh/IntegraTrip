import json
import logging
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app import llm_pb2, mcp_client
from app.models import MCPConnection
from app.tokens import TokenRefreshError, get_valid_access_token

logger = logging.getLogger(__name__)


async def obtener_tools_llm(db: AsyncSession, user_id: uuid.UUID) -> tuple[list[llm_pb2.Tool], dict]:
    """Arma el catálogo de tools (formato proto) para todas las conexiones MCP del
    usuario, prefijando cada nombre por auth_type (pre/dcr/cimd) para evitar choques
    entre proveedores. `conexiones` mapea el nombre prefijado -> conexión + nombre
    original, para cuando el loop tenga que ejecutar la tool que el modelo pidió."""
    stmt = (
        select(MCPConnection)
        .options(joinedload(MCPConnection.oauth_client))
        .where(MCPConnection.user_id == user_id)
    )
    connections = (await db.execute(stmt)).scalars().all()

    tools: list[llm_pb2.Tool] = []
    conexiones: dict[str, dict] = {}

    for connection in connections:
        prefix = connection.oauth_client.auth_type  # pre | dcr | cimd
        try:
            access_token = await get_valid_access_token(
                db, user_id=user_id, oauth_client_id=connection.oauth_client_id
            )
            mcp_tools = await mcp_client.list_tools(connection.oauth_client.mcp_url, access_token)
        except (TokenRefreshError, mcp_client.MCPTransportError, mcp_client.MCPError) as exc:
            logger.warning("skipping provider=%s in tool catalog: %s", connection.oauth_client.provider, exc)
            continue

        for t in mcp_tools:
            prefixed_name = f"{prefix}_{t['name']}"
            tools.append(
                llm_pb2.Tool(
                    name=prefixed_name,
                    description=t.get("description", ""),
                    input_schema_json=json.dumps(t.get("inputSchema", {})),
                )
            )
            conexiones[prefixed_name] = {
                "connection": connection,
                "original_name": t["name"],
            }

    return tools, conexiones
