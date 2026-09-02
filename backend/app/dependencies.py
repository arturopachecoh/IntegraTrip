import uuid

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.models import User
from app.session import SESSION_COOKIE_NAME, SessionTokenError, verify_session_token


async def get_current_user(request: Request, db: AsyncSession = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="not authenticated")

    try:
        claims = verify_session_token(token)
    except SessionTokenError:
        raise HTTPException(status_code=401, detail="not authenticated")

    try:
        user_id = uuid.UUID(claims.user_id)
    except ValueError:
        raise HTTPException(status_code=401, detail="not authenticated")

    user = (await db.execute(select(User).where(User.id == user_id))).scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=401, detail="not authenticated")

    return user
