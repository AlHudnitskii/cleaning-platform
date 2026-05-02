import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.auth.jwt_handler import hash_password
from src.domain.models.enums import UserRole
from src.domain.models.user import UserRegister, UserResponse

bp = func.Blueprint()


@bp.route(route="users", methods=["GET"])
async def get_users(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    if user["role"] != UserRole.ADMIN:
        return func.HttpResponse(
            json.dumps({"error": "Only admins can view users"}),
            status_code=403,
            mimetype="application/json"
        )

    role_filter = req.params.get("role")
    country_filter = req.params.get("country")

    conditions = []
    params = {}

    if role_filter:
        conditions.append("role = :role")
        params["role"] = role_filter

    if country_filter:
        conditions.append("country = :country")
        params["country"] = country_filter

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text(f"SELECT * FROM users {where} ORDER BY created_at DESC"),
            params
        )
        users = result.fetchall()

    users_list = [
        {
            "id": str(row.id),
            "email": row.email,
            "role": row.role,
            "country": row.country,
            "is_active": row.is_active,
            "created_at": row.created_at.isoformat()
        }
        for row in users
    ]

    return func.HttpResponse(
        json.dumps(users_list),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="users", methods=["POST"])
async def create_user(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    if user["role"] != UserRole.ADMIN:
        return func.HttpResponse(
            json.dumps({"error": "Only admins can create users"}),
            status_code=403,
            mimetype="application/json"
        )

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
                VALUES (:id, :email, :pw, :role, :country, true, :now)
            """),
            {
                "id": user_id,
                "email": user_data.email,
                "pw": hash_password(user_data.password),
                "role": user_data.role,
                "country": user_data.country,
                "now": datetime.utcnow()
            }
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM users WHERE id = :id"),
            {"id": user_id}
        )
        new_user = result.fetchone()

    return func.HttpResponse(
        json.dumps({
            "id": str(new_user.id),
            "email": new_user.email,
            "role": new_user.role,
            "country": new_user.country,
            "is_active": new_user.is_active,
            "created_at": new_user.created_at.isoformat()
        }),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="users/{user_id}/toggle-active", methods=["PATCH"])
async def toggle_active(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    if user["role"] != UserRole.ADMIN:
        return func.HttpResponse(
            json.dumps({"error": "Only admins can deactivate users"}),
            status_code=403,
            mimetype="application/json"
        )

    target_id = req.route_params.get("user_id")

    if target_id == user["sub"]:
        return func.HttpResponse(
            json.dumps({"error": "Cannot deactivate yourself"}),
            status_code=400,
            mimetype="application/json"
        )

    try:
        target_uuid = uuid.UUID(target_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid user ID"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT * FROM users WHERE id = :id"),
            {"id": target_uuid}
        )
        target = result.fetchone()

        if not target:
            return func.HttpResponse(
                json.dumps({"error": "User not found"}),
                status_code=404,
                mimetype="application/json"
            )

        await session.execute(
            text("UPDATE users SET is_active = :active WHERE id = :id"),
            {"active": not target.is_active, "id": target_uuid}
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM users WHERE id = :id"),
            {"id": target_uuid}
        )
        updated = result.fetchone()

    return func.HttpResponse(
        json.dumps({
            "id": str(updated.id),
            "email": updated.email,
            "role": updated.role,
            "country": updated.country,
            "is_active": updated.is_active,
            "created_at": updated.created_at.isoformat()
        }),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="users/me/password", methods=["PATCH"])
async def change_password(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    old_password = body.get("old_password")
    new_password = body.get("new_password")

    if not old_password or not new_password:
        return func.HttpResponse(
            json.dumps({"error": "old_password and new_password are required"}),
            status_code=400,
            mimetype="application/json"
        )

    if len(new_password) < 6:
        return func.HttpResponse(
            json.dumps({"error": "New password must be at least 6 characters"}),
            status_code=400,
            mimetype="application/json"
        )

    from src.infrastructure.auth.jwt_handler import verify_password

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT * FROM users WHERE id = :id"),
            {"id": uuid.UUID(user["sub"])}
        )
        current_user = result.fetchone()

        if not verify_password(old_password, current_user.hashed_password):
            return func.HttpResponse(
                json.dumps({"error": "Old password is incorrect"}),
                status_code=400,
                mimetype="application/json"
            )

        await session.execute(
            text("UPDATE users SET hashed_password = :pw WHERE id = :id"),
            {"pw": hash_password(new_password), "id": uuid.UUID(user["sub"])}
        )
        await session.commit()

    return func.HttpResponse(
        json.dumps({"message": "Password changed successfully"}),
        status_code=200,
        mimetype="application/json"
    )
