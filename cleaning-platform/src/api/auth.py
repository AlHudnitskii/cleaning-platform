import logging
from datetime import datetime

import azure.functions as func
from sqlalchemy import delete, select

from src.api.http import (
    ApiError,
    authenticated,
    cookie_header,
    json_response,
    public,
    read_cookie,
    read_model,
)
from src.domain.models.user import CurrentUser, TokenResponse, UserLogin, UserResponse
from src.domain.services.login_throttle import retry_after, throttle_key, window_start
from src.infrastructure.auth.jwt_handler import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    verify_password,
)
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import LoginFailure, PushSubscription, User, utcnow
from src.settings import get_settings
from src.translations import phrases

bp = func.Blueprint()
logger = logging.getLogger(__name__)

REFRESH_COOKIE = "refresh_token"
REFRESH_COOKIE_PATH = "/api/auth"


def refresh_cookie(token: str) -> str:
    settings = get_settings()
    max_age = settings.refresh_token_days * 24 * 3600
    return cookie_header(REFRESH_COOKIE, token, max_age, REFRESH_COOKIE_PATH, settings.secure_cookies)


def cleared_refresh_cookie() -> str:
    return cookie_header(REFRESH_COOKIE, "", 0, REFRESH_COOKIE_PATH, get_settings().secure_cookies)


def session_response(user: User, status_code: int = 200) -> func.HttpResponse:
    body = TokenResponse(
        access_token=create_access_token(user.id, user.token_version),
        user=UserResponse.model_validate(user),
    )
    refresh = create_refresh_token(user.id, user.token_version)
    return json_response(body, status_code, headers={"Set-Cookie": refresh_cookie(refresh)})


async def user_from_refresh_token(token: str | None) -> User:
    if not token:
        raise ApiError(401, phrases.REFRESH_MISSING())
    try:
        claims = decode_refresh_token(token)
    except InvalidTokenError as e:
        raise ApiError(401, phrases.REFRESH_INVALID()) from e

    async with session_scope() as session:
        user = await session.get(User, claims.user_id)
    if user is None or not user.is_active or user.token_version != claims.version:
        raise ApiError(401, phrases.SESSION_INVALID())
    return user


async def recent_failures(key: str) -> list[datetime]:
    async with session_scope() as session, session.begin():
        await session.execute(
            delete(LoginFailure).where(LoginFailure.email == key, LoginFailure.failed_at <= window_start(utcnow()))
        )
        return list(await session.scalars(select(LoginFailure.failed_at).where(LoginFailure.email == key)))


async def record_failure(key: str) -> None:
    async with session_scope() as session, session.begin():
        session.add(LoginFailure(email=key, failed_at=utcnow()))


async def clear_failures(key: str) -> None:
    async with session_scope() as session, session.begin():
        await session.execute(delete(LoginFailure).where(LoginFailure.email == key))


@bp.route(route="auth/login", methods=["POST"])
@public
async def login(req: func.HttpRequest) -> func.HttpResponse:
    data = read_model(req, UserLogin)
    key = throttle_key(data.email)

    wait = retry_after(await recent_failures(key), utcnow())
    if wait is not None:
        logger.warning("Sign-in throttled", extra={"retry_after": wait})
        raise ApiError(429, phrases.TOO_MANY_SIGN_INS(), retry_after=wait)

    async with session_scope() as session:
        user = await session.scalar(select(User).where(User.email == data.email))

    if user is None or not verify_password(data.password, user.hashed_password):
        await record_failure(key)
        logger.info("Sign-in failed")
        raise ApiError(401, phrases.WRONG_CREDENTIALS())
    await clear_failures(key)
    if not user.is_active:
        raise ApiError(403, phrases.USER_DISABLED())

    return session_response(user)


@bp.route(route="auth/refresh", methods=["POST"])
@public
async def refresh(req: func.HttpRequest) -> func.HttpResponse:
    user = await user_from_refresh_token(read_cookie(req, REFRESH_COOKIE))
    return session_response(user)


@bp.route(route="auth/logout", methods=["POST"])
@public
async def logout(req: func.HttpRequest) -> func.HttpResponse:
    token = read_cookie(req, REFRESH_COOKIE)
    if token:
        try:
            claims = decode_refresh_token(token)
        except InvalidTokenError:
            claims = None
        if claims is not None:
            async with session_scope() as session, session.begin():
                user = await session.get(User, claims.user_id, with_for_update=True)
                if user is not None and user.token_version == claims.version:
                    user.token_version += 1
                    await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user.id))

    return func.HttpResponse(status_code=204, headers={"Set-Cookie": cleared_refresh_cookie()})


@bp.route(route="auth/me", methods=["GET"])
@authenticated()
async def me(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    async with session_scope() as session:
        record = await session.get(User, user.id)
    return json_response(UserResponse.model_validate(record))
