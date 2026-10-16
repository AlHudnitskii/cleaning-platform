import uuid
from datetime import UTC, datetime

import azure.functions as func
from sqlalchemy import func as sql
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.http import ApiError, authenticated, forbidden, json_response, not_found, read_model, route_uuid
from src.api.task_store import load_visible_task, task_event
from src.domain.models.enums import TaskStatus, UserRole
from src.domain.models.task import (
    MAX_CHECKLIST_ITEMS,
    ChecklistItemCreate,
    ChecklistItemResponse,
    ChecklistItemUpdate,
)
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Task, TaskChecklistItem
from src.infrastructure.messaging import outbox

bp = func.Blueprint()


def announce(session: AsyncSession, task: Task, user: CurrentUser) -> None:
    outbox.enqueue(
        session,
        outbox.TASK_UPDATED,
        task_event(
            task,
            previous_assigned_to=str(task.assigned_to) if task.assigned_to else None,
            changed_by=str(user.id),
            fields=["checklist"],
        ),
    )


async def load_item(session: AsyncSession, task_id: uuid.UUID, item_id: uuid.UUID) -> TaskChecklistItem:
    item = await session.get(TaskChecklistItem, item_id, with_for_update=True)
    if item is None or item.task_id != task_id:
        raise not_found("Checklist item")
    return item


def ensure_editable(user: CurrentUser, task: Task) -> None:
    if not task_access.can_manage_country(user, task.country):
        raise forbidden("Only managers of this country can change the checklist")
    if TaskStatus(task.status) in task_access.LOCKED_STATUSES:
        raise ApiError(409, "The checklist of a completed or cancelled task cannot be changed")


@bp.route(route="tasks/{task_id}/checklist", methods=["GET"])
@authenticated()
async def get_checklist(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    async with session_scope() as session:
        await load_visible_task(session, user, task_id)
        items = await session.scalars(
            select(TaskChecklistItem)
            .where(TaskChecklistItem.task_id == task_id)
            .order_by(TaskChecklistItem.position, TaskChecklistItem.id)
        )
        response = [ChecklistItemResponse.model_validate(item) for item in items]
    return json_response(response)


@bp.route(route="tasks/{task_id}/checklist", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def add_checklist_item(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    data = read_model(req, ChecklistItemCreate)

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        ensure_editable(user, task)
        count, last = (
            await session.execute(
                select(sql.count(), sql.max(TaskChecklistItem.position)).where(TaskChecklistItem.task_id == task_id)
            )
        ).one()
        if count >= MAX_CHECKLIST_ITEMS:
            raise ApiError(400, f"A checklist can have at most {MAX_CHECKLIST_ITEMS} items")
        item = TaskChecklistItem(task_id=task_id, position=(last if last is not None else -1) + 1, text=data.text)
        session.add(item)
        await session.flush()
        announce(session, task, user)
        response = ChecklistItemResponse.model_validate(item)

    return json_response(response, 201)


@bp.route(route="tasks/{task_id}/checklist/{item_id}", methods=["PATCH"])
@authenticated()
async def update_checklist_item(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    item_id = route_uuid(req, "item_id", "checklist item ID")
    data = read_model(req, ChecklistItemUpdate)
    changes = data.model_fields_set
    if not changes:
        raise ApiError(400, "Nothing to update")

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        item = await load_item(session, task_id, item_id)
        if "text" in changes and data.text is not None:
            ensure_editable(user, task)
            item.text = data.text
        if "done" in changes and data.done is not None:
            if not task_access.can_tick_checklist(user, task.country, task.assigned_to, TaskStatus(task.status)):
                raise forbidden("You cannot tick items of this task")
            item.done = data.done
            item.done_by = user.id if data.done else None
            item.done_at = datetime.now(UTC) if data.done else None
        announce(session, task, user)
        response = ChecklistItemResponse.model_validate(item)

    return json_response(response)


@bp.route(route="tasks/{task_id}/checklist/{item_id}", methods=["DELETE"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def delete_checklist_item(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    task_id = route_uuid(req, "task_id", "task ID")
    item_id = route_uuid(req, "item_id", "checklist item ID")

    async with session_scope() as session, session.begin():
        task = await load_visible_task(session, user, task_id, for_update=True)
        ensure_editable(user, task)
        item = await load_item(session, task_id, item_id)
        await session.delete(item)
        announce(session, task, user)

    return func.HttpResponse(status_code=204)
