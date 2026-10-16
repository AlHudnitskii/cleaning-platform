import uuid

import azure.functions as func
from sqlalchemy import delete, select
from sqlalchemy import func as sql
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.auth import session_response
from src.api.http import (
    ApiError,
    authenticated,
    forbidden,
    json_response,
    not_found,
    query_choice,
    read_model,
    route_uuid,
)
from src.api.task_store import OPEN_STATUSES
from src.domain.models.enums import Country, UserRole
from src.domain.models.user import (
    AssigneeResponse,
    CurrentUser,
    PasswordChange,
    PasswordReset,
    UserRegister,
    UserResponse,
    UserUpdate,
)
from src.infrastructure.auth.jwt_handler import hash_password, verify_password
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import PushSubscription, Task, User
from src.translations import phrases

bp = func.Blueprint()


@bp.route(route="users", methods=["GET"])
@authenticated(UserRole.ADMIN)
async def get_users(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    role = query_choice(req, "role", UserRole)
    country = query_choice(req, "country", Country)

    stmt = select(User).order_by(User.created_at.desc(), User.id.desc())
    if role:
        stmt = stmt.where(User.role == role)
    if country:
        stmt = stmt.where(User.country == country)

    async with session_scope() as session:
        users = (await session.scalars(stmt)).all()
    return json_response([UserResponse.model_validate(u) for u in users])


@bp.route(route="users/assignees", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def get_assignees(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    country = user.country if user.is_manager else query_choice(req, "country", Country)

    stmt = select(User).where(User.role == UserRole.CLEANER, User.is_active.is_(True)).order_by(User.email)
    if country:
        stmt = stmt.where(User.country == country)

    async with session_scope() as session:
        cleaners = (await session.scalars(stmt)).all()
    return json_response([AssigneeResponse.model_validate(c) for c in cleaners])


@bp.route(route="users", methods=["POST"])
@authenticated(UserRole.ADMIN)
async def create_user(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, UserRegister)

    async with session_scope() as session, session.begin():
        if await session.scalar(select(User.id).where(User.email == data.email)):
            raise ApiError(409, phrases.EMAIL_TAKEN())
        new_user = User(
            email=data.email,
            hashed_password=hash_password(data.password),
            role=data.role,
            country=data.country,
            is_active=True,
        )
        session.add(new_user)
        await session.flush()
        await session.refresh(new_user)

    return json_response(UserResponse.model_validate(new_user), 201)


def end_sessions(target: User) -> None:
    target.token_version += 1


async def forget_devices(session: AsyncSession, user_id: uuid.UUID) -> None:
    await session.execute(delete(PushSubscription).where(PushSubscription.user_id == user_id))


async def open_assigned_tasks(session: AsyncSession, user_id: uuid.UUID) -> int:
    stmt = select(sql.count()).where(Task.assigned_to == user_id, Task.status.in_(OPEN_STATUSES))
    return await session.scalar(stmt) or 0


@bp.route(route="users/{user_id}", methods=["PATCH"])
@authenticated(UserRole.ADMIN)
async def update_user(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    target_id = route_uuid(req, "user_id", "user ID")
    data = read_model(req, UserUpdate)

    async with session_scope() as session, session.begin():
        target = await session.get(User, target_id, with_for_update=True)
        if target is None:
            raise not_found(phrases.USER)
        access_changed = data.role != target.role or data.country != target.country
        if access_changed and target_id == user.id:
            raise ApiError(400, phrases.OWN_ACCESS_LOCKED())
        if data.email != target.email and await session.scalar(select(User.id).where(User.email == data.email)):
            raise ApiError(409, phrases.EMAIL_TAKEN())
        if access_changed and target.role == UserRole.CLEANER:
            open_tasks = await open_assigned_tasks(session, target.id)
            if open_tasks:
                raise ApiError(409, phrases.REASSIGN_FIRST(count=open_tasks))

        target.email = data.email
        target.role = data.role
        target.country = data.country
        if access_changed:
            end_sessions(target)

    return json_response(UserResponse.model_validate(target))


@bp.route(route="users/{user_id}/password", methods=["POST"])
@authenticated(UserRole.ADMIN)
async def reset_password(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    target_id = route_uuid(req, "user_id", "user ID")
    if target_id == user.id:
        raise ApiError(400, phrases.OWN_PASSWORD_IN_PROFILE())
    data = read_model(req, PasswordReset)

    async with session_scope() as session, session.begin():
        target = await session.get(User, target_id, with_for_update=True)
        if target is None:
            raise not_found(phrases.USER)
        target.hashed_password = hash_password(data.new_password)
        end_sessions(target)
        await forget_devices(session, target.id)

    return func.HttpResponse(status_code=204)


@bp.route(route="users/{user_id}/toggle-active", methods=["PATCH"])
@authenticated(UserRole.ADMIN)
async def toggle_active(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    target_id = route_uuid(req, "user_id", "user ID")
    if target_id == user.id:
        raise ApiError(400, phrases.CANNOT_DEACTIVATE_SELF())

    async with session_scope() as session, session.begin():
        target = await session.get(User, target_id, with_for_update=True)
        if target is None:
            raise not_found(phrases.USER)
        target.is_active = not target.is_active
        if not target.is_active:
            end_sessions(target)
            await forget_devices(session, target.id)

    return json_response(UserResponse.model_validate(target))


@bp.route(route="users/me/password", methods=["PATCH"])
@authenticated()
async def change_password(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, PasswordChange)

    async with session_scope() as session, session.begin():
        record = await session.get(User, user.id, with_for_update=True)
        if record is None:
            raise forbidden()
        if not verify_password(data.old_password, record.hashed_password):
            raise ApiError(400, phrases.OLD_PASSWORD_WRONG())
        record.hashed_password = hash_password(data.new_password)
        record.token_version += 1

    return session_response(record)
