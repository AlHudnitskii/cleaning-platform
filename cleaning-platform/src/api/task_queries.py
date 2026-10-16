import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Select, and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from src.api.http import not_found
from src.domain.models.enums import SortOrder, TaskPriority, TaskSort, TaskStatus
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.database.models import Location, Task, TaskChecklistItem, TaskPhoto, TaskStatusHistory, User
from src.translations import phrases

PRIORITY_RANK = case(
    {p.value: rank for rank, p in enumerate(TaskPriority)},
    value=Task.priority,
)
STATUS_RANK = case({s.value: rank for rank, s in enumerate(TaskStatus)}, value=Task.status)

SORT_COLUMNS: dict[TaskSort, ColumnElement[Any] | InstrumentedAttribute[Any]] = {
    TaskSort.CREATED_AT: Task.created_at,
    TaskSort.PRIORITY: PRIORITY_RANK,
    TaskSort.STATUS: STATUS_RANK,
    TaskSort.TITLE: func.lower(Task.title),
    TaskSort.COUNTRY: Task.country,
    TaskSort.LOCATION: func.lower(Location.name),
    TaskSort.ASSIGNEE: func.lower(User.email),
    TaskSort.DUE_DATE: Task.due_date,
}
OPEN_STATUS_VALUES = sorted(status.value for status in task_access.OPEN_STATUSES)
DESCENDING_BY_DEFAULT = {TaskSort.CREATED_AT, TaskSort.PRIORITY}


def overdue_condition() -> ColumnElement[bool]:
    return and_(Task.due_date < func.current_date(), Task.status.in_(OPEN_STATUS_VALUES))


def day_start(value: date) -> datetime:
    return datetime.combine(value, time.min, tzinfo=UTC)


def day_end_exclusive(value: date) -> datetime:
    return day_start(value) + timedelta(days=1)


def scope_conditions(user: CurrentUser) -> list[ColumnElement[bool]]:
    scope = task_access.task_scope(user)
    conditions: list[ColumnElement[bool]] = []
    if scope.assigned_to is not None:
        conditions.append(Task.assigned_to == scope.assigned_to)
    if scope.country is not None:
        conditions.append(Task.country == scope.country)
    return conditions


def location_subtree(location_id: uuid.UUID) -> ColumnElement[bool]:
    root_path = select(Location.path).where(Location.id == location_id).scalar_subquery()
    subtree = select(Location.id).where(Location.path.op("<@")(root_path))
    return Task.location_id.in_(subtree)


def task_rows() -> Select[Task, str, str]:
    return (
        select(Task, User.email, Location.name)
        .outerjoin(User, Task.assigned_to == User.id)
        .outerjoin(Location, Task.location_id == Location.id)
    )


def ordering(sort: TaskSort, order: SortOrder | None = None) -> list[ColumnElement[Any]]:
    descending = order == SortOrder.DESC if order else sort in DESCENDING_BY_DEFAULT
    column = SORT_COLUMNS[sort]
    primary = (column.desc() if descending else column.asc()).nulls_last()
    if sort == TaskSort.CREATED_AT:
        return [primary, Task.id.desc() if descending else Task.id.asc()]
    return [primary, Task.created_at.desc(), Task.id.desc()]


async def task_progress(session: AsyncSession, task_ids: list[uuid.UUID]) -> dict[uuid.UUID, task_access.TaskProgress]:
    if not task_ids:
        return {}
    checklist = (
        await session.execute(
            select(
                TaskChecklistItem.task_id,
                func.count().filter(TaskChecklistItem.done.is_(True)),
                func.count(),
            )
            .where(TaskChecklistItem.task_id.in_(task_ids))
            .group_by(TaskChecklistItem.task_id)
        )
    ).all()
    photo_counts = (
        select(TaskPhoto.task_id, func.count()).where(TaskPhoto.task_id.in_(task_ids)).group_by(TaskPhoto.task_id)
    )
    photos = {task_id: count for task_id, count in (await session.execute(photo_counts)).all()}
    counts = {task_id: (done, total) for task_id, done, total in checklist}
    return {
        task_id: task_access.TaskProgress(
            checklist_done=counts.get(task_id, (0, 0))[0],
            checklist_total=counts.get(task_id, (0, 0))[1],
            photo_count=photos.get(task_id, 0),
        )
        for task_id in task_ids
    }


async def load_visible_task(
    session: AsyncSession, user: CurrentUser, task_id: uuid.UUID, for_update: bool = False
) -> Task:
    task = await session.get(Task, task_id, with_for_update=for_update)
    if task is None or not task_access.can_view(user, task.country, task.assigned_to):
        raise not_found(phrases.TASK)
    return task


async def last_status_change(session: AsyncSession, task_id: uuid.UUID) -> datetime | None:
    return await session.scalar(
        select(func.max(TaskStatusHistory.changed_at)).where(TaskStatusHistory.task_id == task_id)
    )
