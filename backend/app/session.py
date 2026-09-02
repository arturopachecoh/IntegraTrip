import os
import time
from dataclasses import dataclass

import jwt

SESSION_COOKIE_NAME = "integratrip_session"
SESSION_TTL_SECONDS = 7 * 24 * 60 * 60


class SessionTokenError(Exception):
    pass


@dataclass(frozen=True)
class SessionClaims:
    user_id: str
    exp: int


def create_session_token(user_id) -> str:
    secret_key = os.environ["SESSION_SECRET_KEY"]
    now = int(time.time())
    payload = {"sub": str(user_id), "iat": now, "exp": now + SESSION_TTL_SECONDS}
    return jwt.encode(payload, secret_key, algorithm="HS256")


def verify_session_token(token: str) -> SessionClaims:
    secret_key = os.environ["SESSION_SECRET_KEY"]
    try:
        claims = jwt.decode(token, secret_key, algorithms=["HS256"], options={"require": ["exp", "sub"]})
    except jwt.exceptions.PyJWTError as exc:
        raise SessionTokenError(str(exc)) from exc

    sub = claims.get("sub")
    if not sub:
        raise SessionTokenError("session token missing sub claim")

    return SessionClaims(user_id=sub, exp=claims.get("exp", 0))
