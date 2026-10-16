import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import bcrypt
import jwt

from src.settings import get_settings

ALGORITHM = "HS256"
ACCESS = "access"
REFRESH = "refresh"
STREAM_TICKET = "stream_ticket"
STREAM_TICKET_LIFETIME = timedelta(seconds=30)


class InvalidTokenError(Exception):
    pass


class ExpiredTokenError(InvalidTokenError):
    pass


@dataclass(frozen=True)
class TokenClaims:
    user_id: uuid.UUID
    version: int
    token_id: str = ""


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def _encode(user_id: uuid.UUID, version: int, token_type: str, lifetime: timedelta, secret: str) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": str(user_id),
        "ver": version,
        "type": token_type,
        "iat": now,
        "exp": now + lifetime,
        "jti": uuid.uuid4().hex,
    }
    return jwt.encode(payload, secret, algorithm=ALGORITHM)


def _decode(token: str, token_type: str, secret: str) -> TokenClaims:
    try:
        payload = jwt.decode(token, secret, algorithms=[ALGORITHM], options={"require": ["sub", "exp", "type"]})
    except jwt.ExpiredSignatureError as e:
        raise ExpiredTokenError("token has expired") from e
    except jwt.InvalidTokenError as e:
        raise InvalidTokenError("invalid token") from e
    if payload.get("type") != token_type:
        raise InvalidTokenError("invalid token type")
    try:
        return TokenClaims(
            user_id=uuid.UUID(payload["sub"]), version=int(payload.get("ver", 0)), token_id=str(payload.get("jti", ""))
        )
    except (ValueError, TypeError) as e:
        raise InvalidTokenError("invalid token subject") from e


def create_access_token(user_id: uuid.UUID, version: int) -> str:
    settings = get_settings()
    lifetime = timedelta(minutes=settings.access_token_minutes)
    return _encode(user_id, version, ACCESS, lifetime, settings.jwt_secret)


def create_refresh_token(user_id: uuid.UUID, version: int) -> str:
    settings = get_settings()
    lifetime = timedelta(days=settings.refresh_token_days)
    return _encode(user_id, version, REFRESH, lifetime, settings.jwt_refresh_secret)


def create_stream_ticket(user_id: uuid.UUID, version: int) -> str:
    return _encode(user_id, version, STREAM_TICKET, STREAM_TICKET_LIFETIME, get_settings().jwt_secret)


def decode_stream_ticket(token: str) -> TokenClaims:
    return _decode(token, STREAM_TICKET, get_settings().jwt_secret)


def decode_access_token(token: str) -> TokenClaims:
    return _decode(token, ACCESS, get_settings().jwt_secret)


def decode_refresh_token(token: str) -> TokenClaims:
    return _decode(token, REFRESH, get_settings().jwt_refresh_secret)
