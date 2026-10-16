import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Any

from sqlalchemy import Select, and_, case, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import InstrumentedAttribute
from sqlalchemy.sql.elements import ColumnElement

from src.api.http import ApiError, not_found
from src.domain.models.enums import Country, SortOrder, TaskPriority, TaskSort, TaskStatus
from src.domain.models.task import TaskResponse
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.database.models import Location, Task, TaskStatusHistory, User
from src.infrastructure.messaging import outbox

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
OPEN_STATUSES = [s.value for s in TaskStatus if s not in (TaskStatus.COMPLETED, TaskStatus.CANCELLED)]
DESCENDING_BY_DEFAULT = {TaskSort.CREATED_AT, TaskSort.PRIORITY}


def overdue_condition() -> ColumnElement[bool]:
    return and_(Task.due_date < func.current_date(), Task.status.in_(OPEN_STATUSES))


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


def to_response(
    task: Task,
    user: CurrentUser,
    assignee_email: str | None = None,
    location_name: str | None = None,
    location_path: list[str] | None = None,
) -> TaskResponse:
    status = TaskStatus(task.status)
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=status,
        country=Country(task.country),
        location_id=task.location_id,
        location_name=location_name,
        location_path=location_path or [],
        assigned_to=task.assigned_to,
        assigned_to_email=assignee_email,
        rrule=task.rrule,
        is_recurring=task.is_recurring,
        scheduled_for=task.scheduled_for,
        priority=TaskPriority(task.priority),
        due_date=task.due_date,
        quality_score=task.quality_score,
        quality_comment=task.quality_comment,
        quality_reviewed_by=task.quality_reviewed_by,
        quality_reviewed_at=task.quality_reviewed_at,
        created_at=task.created_at,
        allowed_statuses=task_access.allowed_statuses(user, status),
    )


async def detailed_response(session: AsyncSession, user: CurrentUser, task: Task) -> TaskResponse:
    assignee_email = None
    if task.assigned_to:
        assignee_email = await session.scalar(select(User.email).where(User.id == task.assigned_to))

    location_name = None
    location_path: list[str] = []
    if task.location_id:
        location = await session.get(Location, task.location_id)
        if location is not None:
            location_name = location.name
            ancestors = await session.scalars(
                select(Location.name).where(Location.path.op("@>")(location.path)).order_by(func.nlevel(Location.path))
            )
            location_path = list(ancestors)

    return to_response(task, user, assignee_email, location_name, location_path)


async def load_visible_task(
    session: AsyncSession, user: CurrentUser, task_id: uuid.UUID, for_update: bool = False
) -> Task:
    task = await session.get(Task, task_id, with_for_update=for_update)
    if task is None or not task_access.can_view(user, task.country, task.assigned_to):
        raise not_found("Task")
    return task


async def ensure_assignable(session: AsyncSession, assignee_id: uuid.UUID, country: str) -> None:
    assignee = await session.get(User, assignee_id)
    if assignee is None or not task_access.can_assign(country, assignee.role, assignee.country, assignee.is_active):
        raise ApiError(400, "Assignee must be an active cleaner from the task's country")


async def last_status_change(session: AsyncSession, task_id: uuid.UUID) -> datetime | None:
    return await session.scalar(
        select(func.max(TaskStatusHistory.changed_at)).where(TaskStatusHistory.task_id == task_id)
    )


def change_status(session: AsyncSession, user: CurrentUser, task: Task, target: TaskStatus) -> TaskStatus:
    current = TaskStatus(task.status)
    if not task_access.can_change_status(user, current, target):
        raise ApiError(409, f"Cannot change status from {current} to {target}")

    now = datetime.now(UTC)
    task.status = target
    session.add(
        TaskStatusHistory(
            task_id=task.id,
            old_status=current,
            new_status=target,
            changed_by=user.id,
            changed_at=now,
        )
    )
    outbox.enqueue(
        session,
        outbox.TASK_STATUS_CHANGED,
        {
            "task_id": str(task.id),
            "title": task.title,
            "country": task.country,
            "assigned_to": str(task.assigned_to) if task.assigned_to else None,
            "old_status": current.value,
            "new_status": target.value,
            "changed_by": str(user.id),
            "changed_by_email": user.email,
        },
    )
    return current
