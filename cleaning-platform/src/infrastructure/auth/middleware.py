import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.enums import Country, UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.auth.jwt_handler import (
    ExpiredTokenError,
    InvalidTokenError,
    TokenClaims,
    decode_access_token,
    decode_stream_ticket,
)
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import User
from src.translations import Text, phrases


class AuthError(Exception):
    def __init__(self, message: Text, status_code: int = 401):
        super().__init__(str(message))
        self.message = message
        self.status_code = status_code


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthError(phrases.AUTH_HEADER_MISSING())
    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token.strip():
        raise AuthError(phrases.AUTH_HEADER_INVALID())
    return token.strip()


def to_current_user(user: User) -> CurrentUser:
    return CurrentUser(
        id=user.id,
        email=user.email,
        role=UserRole(user.role),
        country=Country(user.country) if user.country else None,
    )


async def load_active_user(session: AsyncSession, user_id: uuid.UUID, version: int) -> CurrentUser:
    user = await session.scalar(select(User).where(User.id == user_id))
    if user is None or not user.is_active or user.token_version != version:
        raise AuthError(phrases.SESSION_INVALID())
    return to_current_user(user)


async def authenticate_token(token: str) -> CurrentUser:
    try:
        claims = decode_access_token(token)
    except ExpiredTokenError as e:
        raise AuthError(phrases.TOKEN_EXPIRED()) from e
    except InvalidTokenError as e:
        raise AuthError(phrases.TOKEN_INVALID()) from e
    async with session_scope() as session:
        return await load_active_user(session, claims.user_id, claims.version)


async def authenticate_ticket(ticket: str) -> tuple[CurrentUser, TokenClaims]:
    try:
        claims = decode_stream_ticket(ticket)
    except ExpiredTokenError as e:
        raise AuthError(phrases.TOKEN_EXPIRED()) from e
    except InvalidTokenError as e:
        raise AuthError(phrases.TOKEN_INVALID()) from e
    async with session_scope() as session:
        return await load_active_user(session, claims.user_id, claims.version), claims


async def authenticate(authorization: str | None) -> CurrentUser:
    return await authenticate_token(bearer_token(authorization))
