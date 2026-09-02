import uuid
from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MCPConnection, OAuthClient, User


async def get_oauth_client_by_provider(db: AsyncSession, *, db_provider: str) -> OAuthClient | None:
    stmt = select(OAuthClient).where(OAuthClient.provider == db_provider)
    return (await db.execute(stmt)).scalar_one_or_none()


async def get_or_create_oauth_client(
    db: AsyncSession,
    *,
    db_provider: str,
    auth_type: str,
    mcp_url: str,
    authorization_endpoint: str,
    token_endpoint: str,
    client_id: str,
    client_secret: str | None,
) -> OAuthClient:
    stmt = (
        pg_insert(OAuthClient)
        .values(
            provider=db_provider,
            auth_type=auth_type,
            mcp_url=mcp_url,
            authorization_endpoint=authorization_endpoint,
            token_endpoint=token_endpoint,
            client_id=client_id,
            client_secret=client_secret,
        )
        .on_conflict_do_update(
            index_elements=[OAuthClient.provider],
            set_=dict(
                mcp_url=mcp_url,
                authorization_endpoint=authorization_endpoint,
                token_endpoint=token_endpoint,
                client_id=client_id,
                client_secret=client_secret,
            ),
        )
        .returning(OAuthClient)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


async def get_or_create_user(db: AsyncSession, *, email: str, student_id: str | None) -> User:
    insert_stmt = pg_insert(User).values(email=email, student_id=student_id)
    stmt = insert_stmt.on_conflict_do_update(
        index_elements=[User.email],
        set_=dict(student_id=func.coalesce(insert_stmt.excluded.student_id, User.student_id)),
    ).returning(User)
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()


async def upsert_mcp_connection(
    db: AsyncSession,
    *,
    user_id: uuid.UUID,
    oauth_client_id: uuid.UUID,
    access_token: str,
    refresh_token: str | None,
    token_expires_at: datetime,
) -> MCPConnection:
    stmt = (
        pg_insert(MCPConnection)
        .values(
            user_id=user_id,
            oauth_client_id=oauth_client_id,
            access_token=access_token,
            refresh_token=refresh_token,
            token_expires_at=token_expires_at,
        )
        .on_conflict_do_update(
            constraint="uq_user_oauth_client",
            set_=dict(
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=token_expires_at,
            ),
        )
        .returning(MCPConnection)
    )
    result = await db.execute(stmt)
    await db.flush()
    return result.scalar_one()
