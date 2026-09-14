import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.jwt_handler import hash_password, verify_password, create_access_token
from src.domain.models.user import UserRegister, UserLogin, UserResponse, TokenResponse

bp = func.Blueprint()


@bp.route(route="auth/register", methods=["POST"])
async def register(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Registering new user")

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    try:
        user_data = UserRegister(**body)
    except ValidationError as e:
        return func.HttpResponse(
            json.dumps({"error": e.errors()}, default=str),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE email = :email"),
            {"email": user_data.email}
        )
        if result.fetchone():
            return func.HttpResponse(
                json.dumps({"error": "Email already registered"}),
                status_code=409,
                mimetype="application/json"
            )

        user_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO users (id, email, hashed_password, role, country, is_active, created_at)
                VALUES (:id, :email, :hashed_password, :role, :country, :is_active, :created_at)
            """),
            {
                "id": user_id,
                "email": user_data.email,
                "hashed_password": hash_password(user_data.password),
                "role": user_data.role,
                "country": user_data.country,
                "is_active": True,
                "created_at": datetime.utcnow()
            }
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM users WHERE id = :id"),
            {"id": user_id}
        )
        user = result.fetchone()

    token = create_access_token(
        str(user.id), user.email, user.role, user.country
    )

    response = TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            role=user.role,
            country=user.country,
            created_at=user.created_at
        )
    )

    return func.HttpResponse(
        response.model_dump_json(),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="auth/login", methods=["POST"])
async def login(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("User login")

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    try:
        login_data = UserLogin(**body)
    except ValidationError as e:
        return func.HttpResponse(
            json.dumps({"error": e.errors()}, default=str),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT * FROM users WHERE email = :email"),
            {"email": login_data.email}
        )
        user = result.fetchone()

    if not user or not verify_password(login_data.password, user.hashed_password):
        return func.HttpResponse(
            json.dumps({"error": "Invalid email or password"}),
            status_code=401,
            mimetype="application/json"
        )

    if not user.is_active:
        return func.HttpResponse(
            json.dumps({"error": "User is disabled"}),
            status_code=403,
            mimetype="application/json"
        )

    token = create_access_token(
        str(user.id), user.email, user.role, user.country
    )

    response = TokenResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            role=user.role,
            country=user.country,
            created_at=user.created_at
        )
    )

    return func.HttpResponse(
        response.model_dump_json(),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="auth/me", methods=["GET"])
async def me(req: func.HttpRequest) -> func.HttpResponse:
    """Получить текущего пользователя по токену"""
    from src.infrastructure.auth.middleware import get_current_user, AuthError

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    return func.HttpResponse(
        json.dumps(user, default=str),
        status_code=200,
        mimetype="application/json"
    )
