from contextlib import asynccontextmanager

from mcp import ClientSession
from mcp import MCPError as _MCPError
from mcp.client.streamable_http import create_mcp_http_client, streamable_http_client


class MCPTransportError(Exception):
    """Connection/network/protocol failure not recognized as an explicit MCP error."""


class MCPError(Exception):
    """Explicit MCP protocol error (JSON-RPC error) surfaced by the SDK."""

    def __init__(self, code, message, data=None):
        self.code = code
        self.message = message
        self.data = data
        super().__init__(f"MCP error {code}: {message}")


def _find_mcp_error(exc: BaseException) -> _MCPError | None:
    """The SDK's anyio TaskGroup wraps errors raised inside session.initialize()/
    list_tools()/call_tool() in a BaseExceptionGroup instead of raising them
    directly, so a plain `except _MCPError` never fires — walk the group to find
    the underlying MCPError, if any."""
    if isinstance(exc, _MCPError):
        return exc
    if isinstance(exc, BaseExceptionGroup):
        for sub in exc.exceptions:
            found = _find_mcp_error(sub)
            if found is not None:
                return found
    return None


@asynccontextmanager
async def _session(mcp_url: str, access_token: str):
    headers = {"Authorization": f"Bearer {access_token}"}
    async with create_mcp_http_client(headers=headers) as http_client:
        async with streamable_http_client(mcp_url, http_client=http_client) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                yield session


async def list_tools(mcp_url: str, access_token: str) -> list[dict]:
    try:
        async with _session(mcp_url, access_token) as session:
            result = await session.list_tools()
    except Exception as exc:
        mcp_error = _find_mcp_error(exc)
        if mcp_error is not None:
            raise MCPError(code=mcp_error.code, message=mcp_error.message, data=mcp_error.data) from exc
        raise MCPTransportError(f"list_tools failed for {mcp_url}: {exc}") from exc

    return [tool.model_dump(mode="json", by_alias=True, exclude_none=True) for tool in result.tools]


async def call_tool(mcp_url: str, access_token: str, tool_name: str, arguments: dict) -> dict:
    try:
        async with _session(mcp_url, access_token) as session:
            result = await session.call_tool(tool_name, arguments)
    except Exception as exc:
        mcp_error = _find_mcp_error(exc)
        if mcp_error is not None:
            raise MCPError(code=mcp_error.code, message=mcp_error.message, data=mcp_error.data) from exc
        raise MCPTransportError(f"call_tool({tool_name}) failed for {mcp_url}: {exc}") from exc

    return result.model_dump(mode="json", by_alias=True, exclude_none=True)
