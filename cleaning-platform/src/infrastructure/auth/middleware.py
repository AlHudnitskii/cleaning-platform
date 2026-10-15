import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.enums import Country, UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.auth.jwt_handler import ExpiredTokenError, InvalidTokenError, decode_access_token
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import User


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 401):
        super().__init__(message)
        self.message = message
        self.status_code = status_code


def bearer_token(authorization: str | None) -> str:
    if not authorization:
        raise AuthError("Authorization header missing")
    scheme, _, token = authorization.partition(" ")
    if scheme != "Bearer" or not token.strip():
        raise AuthError("Invalid authorization format. Use: Bearer <token>")
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
        raise AuthError("Session is no longer valid")
    return to_current_user(user)


async def authenticate_token(token: str) -> CurrentUser:
    try:
        claims = decode_access_token(token)
    except ExpiredTokenError as e:
        raise AuthError("Token has expired") from e
    except InvalidTokenError as e:
        raise AuthError("Invalid token") from e
    async with session_scope() as session:
        return await load_active_user(session, claims.user_id, claims.version)


async def authenticate(authorization: str | None) -> CurrentUser:
    return await authenticate_token(bearer_token(authorization))
