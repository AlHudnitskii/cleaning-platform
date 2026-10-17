import logging
from datetime import UTC, datetime

import azure.functions as func
from azure.core.exceptions import AzureError
from sqlalchemy import func as sql
from sqlalchemy import select

from src.api.http import (
    ApiError,
    authenticated,
    forbidden,
    json_response,
    like_pattern,
    not_found,
    optional_date,
    optional_uuid,
    query_choice,
    query_int,
    query_text,
    read_model,
    route_uuid,
)
from src.api.schemas.task import QualityReview, TaskCreate, TaskStatusUpdate, TaskUpdate
from src.api.task_queries import (
    day_end_exclusive,
    day_start,
    load_visible_task,
    location_subtree,
    ordering,
    overdue_condition,
    scope_conditions,
    task_progress,
    task_rows,
)
from src.api.task_responses import detailed_response, to_response
from src.api.task_workflow import change_status, ensure_assignable, load_location
from src.domain.models.enums import Country, SortOrder, TaskPriority, TaskSort, TaskStatus, UserRole
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.domain.services.recurring_tasks import series_anchor, upcoming_occurrences
from src.infrastructure.blob.storage import PHOTOS_CONTAINER, delete_prefix
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location, Task, TaskChecklistItem
from src.infrastructure.messaging import outbox
from src.infrastructure.messaging.events import TaskEvent, TaskEventType
from src.translations import phrases

bp = func.Blueprint()
logger = logging.getLogger(__name__)

MAX_PAGE = 10_000
MAX_LIMIT = 100
MAX_SEARCH = 200
OCCURRENCES_COUNT = 10


@bp.route(route="tasks", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def create_task(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    data = read_model(req, TaskCreate)

    async with session_scope() as session, session.begin():
        country: str = data.country
        if data.location_id:
            country = (await load_location(session, data.location_id)).country

        if not task_access.can_manage_country(user, country):
            raise forbidden(phrases.CREATE_IN_OWN_COUNTRY())
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
            due_date=data.due_date,
            photo_required=data.photo_required,
            created_at=datetime.now(UTC),
        )
        session.add(task)
        await session.flush()
        session.add_all(
            TaskChecklistItem(task_id=task.id, position=index, text=text) for index, text in enumerate(data.checklist)
        )
        outbox.enqueue(session, TaskEvent.of(TaskEventType.CREATED, task, user.id))
        response = await detailed_response(session, user, task)

    return json_response(response, 201)


EDITABLE_FIELDS = ("title", "description", "location_id", "assigned_to", "priority", "due_date", "photo_required")


@bp.route(route="tasks/{task_id}", methods=["PATCH"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def update_task(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    data = read_model(req, TaskUpdate)
    changes = data.model_fields_set
    if not changes:
        raise ApiError(400, phrases.NOTHING_TO_UPDATE())

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        if not task_access.can_manage_country(user, task.country):
            raise forbidden(phrases.EDIT_IN_OWN_COUNTRY())

        if "location_id" in changes and data.location_id:
            location = await load_location(session, data.location_id)
            if location.country != task.country:
                raise ApiError(400, phrases.LOCATION_OTHER_COUNTRY())
        if "assigned_to" in changes and data.assigned_to and data.assigned_to != task.assigned_to:
            await ensure_assignable(session, data.assigned_to, task.country)

        previous_assignee = task.assigned_to
        for field in EDITABLE_FIELDS:
            if field in changes:
                setattr(task, field, getattr(data, field))
        if "description" in changes:
            task.description = (data.description or "").strip() or None
        if "rrule" in changes:
            task.rrule = data.rrule
            task.is_recurring = bool(data.rrule)

        event = TaskEvent.of(
            TaskEventType.UPDATED, task, user.id, previous_assigned_to=previous_assignee, fields=changes
        )
        outbox.enqueue(session, event)
        response = await detailed_response(session, user, task)

    return json_response(response)


@bp.route(route="tasks/{task_id}", methods=["DELETE"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def delete_task(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        if not task_access.can_manage_country(user, task.country):
            raise forbidden(phrases.DELETE_IN_OWN_COUNTRY())
        outbox.enqueue(session, TaskEvent.of(TaskEventType.DELETED, task, user.id))
        await session.delete(task)

    try:
        await delete_prefix(PHOTOS_CONTAINER, f"{task_id}/")
    except AzureError:
        logger.exception("Failed to delete photos of a deleted task", extra={"task_id": str(task_id)})

    return func.HttpResponse(status_code=204)


@bp.route(route="tasks", methods=["GET"])
@authenticated()
async def get_tasks(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    page = query_int(req, "page", 1, 1, MAX_PAGE)
    limit = query_int(req, "limit", 10, 1, MAX_LIMIT)
    sort = query_choice(req, "sort", TaskSort) or TaskSort.CREATED_AT
    order = query_choice(req, "order", SortOrder)
    status = query_choice(req, "status", TaskStatus)
    priority = query_choice(req, "priority", TaskPriority)
    country = query_choice(req, "country", Country)
    location_id = optional_uuid(req, "location_id")
    date_from = optional_date(req, "date_from")
    date_to = optional_date(req, "date_to")
    search = query_text(req, "search", MAX_SEARCH)
    overdue = req.params.get("overdue") == "true"

    conditions = scope_conditions(user)
    if search:
        conditions.append(Task.title.ilike(like_pattern(search), escape="\\"))
    if overdue:
        conditions.append(overdue_condition())
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
                task_rows().where(*conditions).order_by(*ordering(sort, order)).limit(limit).offset((page - 1) * limit)
            )
        ).all()
        progress = await task_progress(session, [task.id for task, _, _ in rows])

    return json_response(
        {
            "data": [
                to_response(task, user, progress[task.id], email, location_name) for task, email, location_name in rows
            ],
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
        await change_status(session, user, task, data.status)
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
        raise ApiError(400, phrases.NOT_RECURRING())

    anchor = series_anchor(task.scheduled_for, task.created_at)
    occurrences = upcoming_occurrences(task.rrule, anchor, datetime.now(UTC), OCCURRENCES_COUNT)
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
            raise ApiError(409, phrases.REVIEW_ONLY_COMPLETED())

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
            raise not_found(phrases.LOCATION)
        rows = (
            await session.execute(
                task_rows()
                .where(*scope_conditions(user), location_subtree(location_id))
                .order_by(*ordering(TaskSort.CREATED_AT))
                .limit(limit)
            )
        ).all()
        progress = await task_progress(session, [task.id for task, _, _ in rows])

    return json_response(
        [to_response(task, user, progress[task.id], email, location_name) for task, email, location_name in rows]
    )
