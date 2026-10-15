from datetime import UTC, datetime

import azure.functions as func
from sqlalchemy import func as sql
from sqlalchemy import select

from src.api.http import (
    ApiError,
    authenticated,
    forbidden,
    json_response,
    not_found,
    optional_date,
    optional_uuid,
    query_choice,
    query_int,
    read_model,
    route_uuid,
)
from src.api.task_store import (
    change_status,
    day_end_exclusive,
    day_start,
    detailed_response,
    ensure_assignable,
    load_visible_task,
    location_subtree,
    ordering,
    scope_conditions,
    task_rows,
    to_response,
)
from src.domain.models.enums import Country, TaskPriority, TaskSort, TaskStatus, UserRole
from src.domain.models.task import QualityReview, TaskCreate, TaskStatusUpdate
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.domain.services.recurring_tasks import get_next_occurrences
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location, Task
from src.infrastructure.messaging import outbox

bp = func.Blueprint()

MAX_PAGE = 10_000
MAX_LIMIT = 100
OCCURRENCES_COUNT = 10


@bp.route(route="tasks", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def create_task(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, TaskCreate)

    async with session_scope() as session, session.begin():
        country: str = data.country
        if data.location_id:
            location = await session.get(Location, data.location_id)
            if location is None:
                raise not_found("Location")
            country = location.country

        if not task_access.can_manage_country(user, country):
            raise forbidden("You can only create tasks in your country")
        if data.assigned_to:
            await ensure_assignable(session, data.assigned_to, country)

        task = Task(
            title=data.title,
            description=data.description,
            status=TaskStatus.PENDING,
            country=country,
            location_id=data.location_id,
            assigned_to=data.assigned_to,
            rrule=data.rrule,
            is_recurring=bool(data.rrule),
            scheduled_for=data.scheduled_for,
            priority=data.priority,
            created_at=datetime.now(UTC),
        )
        session.add(task)
        await session.flush()
        outbox.enqueue(
            session,
            outbox.TASK_CREATED,
            {
                "task_id": str(task.id),
                "title": task.title,
                "country": task.country,
                "assigned_to": str(task.assigned_to) if task.assigned_to else None,
                "location_id": str(task.location_id) if task.location_id else None,
            },
        )
        response = await detailed_response(session, user, task)

    return json_response(response, 201)


@bp.route(route="tasks", methods=["GET"])
@authenticated()
async def get_tasks(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    page = query_int(req, "page", 1, 1, MAX_PAGE)
    limit = query_int(req, "limit", 10, 1, MAX_LIMIT)
    sort = query_choice(req, "sort", TaskSort) or TaskSort.CREATED_AT
    status = query_choice(req, "status", TaskStatus)
    priority = query_choice(req, "priority", TaskPriority)
    country = query_choice(req, "country", Country)
    location_id = optional_uuid(req, "location_id")
    date_from = optional_date(req, "date_from")
    date_to = optional_date(req, "date_to")

    conditions = scope_conditions(user)
    if country and user.is_admin:
        conditions.append(Task.country == country)
    if status:
        conditions.append(Task.status == status)
    if priority:
        conditions.append(Task.priority == priority)
    if location_id:
        conditions.append(location_subtree(location_id))
    if date_from:
        conditions.append(Task.created_at >= day_start(date_from))
    if date_to:
        conditions.append(Task.created_at < day_end_exclusive(date_to))

    async with session_scope() as session:
        total = await session.scalar(select(sql.count()).select_from(Task).where(*conditions)) or 0
        rows = (
            await session.execute(
                task_rows().where(*conditions).order_by(*ordering(sort)).limit(limit).offset((page - 1) * limit)
            )
        ).all()

    return json_response(
        {
            "data": [to_response(task, user, email, location_name) for task, email, location_name in rows],
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": max((total + limit - 1) // limit, 1),
            },
        }
    )


@bp.route(route="tasks/{task_id}", methods=["GET"])
@authenticated()
async def get_task(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    async with session_scope() as session:
        task = await load_visible_task(session, user, task_id)
        response = await detailed_response(session, user, task)
    return json_response(response)


@bp.route(route="tasks/{task_id}/status", methods=["PATCH"])
@authenticated()
async def update_task_status(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    data = read_model(req, TaskStatusUpdate)

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        change_status(session, user, task, data.status)
        await session.flush()
        response = await detailed_response(session, user, task)

    return json_response(response)


@bp.route(route="tasks/{task_id}/occurrences", methods=["GET"])
@authenticated()
async def get_task_occurrences(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    async with session_scope() as session:
        task = await load_visible_task(session, user, task_id)

    if not task.rrule:
        raise ApiError(400, "Task is not recurring")

    occurrences = get_next_occurrences(task.rrule, count=OCCURRENCES_COUNT)
    return json_response(
        {
            "task_id": task.id,
            "rrule": task.rrule,
            "next_occurrences": occurrences,
        }
    )


@bp.route(route="tasks/{task_id}/quality", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def review_quality(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    review = read_model(req, QualityReview)

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        if not task_access.can_review_quality(user, TaskStatus(task.status)):
            raise ApiError(409, "Can only review completed tasks")

        task.quality_score = review.score
        task.quality_comment = review.comment
        task.quality_reviewed_by = user.id
        task.quality_reviewed_at = datetime.now(UTC)
        await session.flush()
        response = await detailed_response(session, user, task)

    return json_response(response)


@bp.route(route="locations/{location_id}/tasks", methods=["GET"])
@authenticated()
async def get_tasks_by_location(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    location_id = route_uuid(req, "location_id", "location ID")
    limit = query_int(req, "limit", 50, 1, MAX_LIMIT)

    async with session_scope() as session:
        if await session.get(Location, location_id) is None:
            raise not_found("Location")
        rows = (
            await session.execute(
                task_rows()
                .where(*scope_conditions(user), location_subtree(location_id))
                .order_by(*ordering(TaskSort.CREATED_AT))
                .limit(limit)
            )
        ).all()

    return json_response([to_response(task, user, email, location_name) for task, email, location_name in rows])
