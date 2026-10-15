import azure.functions as func
from sqlalchemy import select

from src.api.http import (
    ApiError,
    authenticated,
    cookie_header,
    json_response,
    public,
    read_cookie,
    read_model,
)
from src.domain.models.user import CurrentUser, TokenResponse, UserLogin, UserRegister, UserResponse
from src.infrastructure.auth.jwt_handler import (
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_refresh_token,
    hash_password,
    verify_password,
)
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import User
from src.settings import get_settings

bp = func.Blueprint()

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
        raise ApiError(401, "Refresh token is missing")
    try:
        claims = decode_refresh_token(token)
    except InvalidTokenError as e:
        raise ApiError(401, "Invalid or expired refresh token") from e

    async with session_scope() as session:
        user = await session.get(User, claims.user_id)
    if user is None or not user.is_active or user.token_version != claims.version:
        raise ApiError(401, "Session is no longer valid")
    return user


@bp.route(route="auth/register", methods=["POST"])
@public
async def register(req: func.HttpRequest) -> func.HttpResponse:
    data = read_model(req, UserRegister)

    async with session_scope() as session, session.begin():
        if await session.scalar(select(User.id).where(User.email == data.email)):
            raise ApiError(409, "Email already registered")
        user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            role=data.role,
            country=data.country,
            is_active=True,
        )
        session.add(user)
        await session.flush()
        await session.refresh(user)

    return session_response(user, 201)


@bp.route(route="auth/login", methods=["POST"])
@public
async def login(req: func.HttpRequest) -> func.HttpResponse:
    data = read_model(req, UserLogin)

    async with session_scope() as session:
        user = await session.scalar(select(User).where(User.email == data.email))

    if user is None or not verify_password(data.password, user.hashed_password):
        raise ApiError(401, "Invalid email or password")
    if not user.is_active:
        raise ApiError(403, "User is disabled")

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

    return func.HttpResponse(status_code=204, headers={"Set-Cookie": cleared_refresh_cookie()})


@bp.route(route="auth/me", methods=["GET"])
@authenticated()
async def me(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    async with session_scope() as session:
        record = await session.get(User, user.id)
    return json_response(UserResponse.model_validate(record))
