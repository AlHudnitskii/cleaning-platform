import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.enums import TaskStatus
from src.domain.services import task_access
from src.domain.services.recurring_tasks import occurrences_between, series_anchor
from src.infrastructure.database.models import Task, TaskChecklistItem, User
from src.infrastructure.messaging import outbox
from src.infrastructure.messaging.events import TaskEvent, TaskEventType

LOOKAHEAD = timedelta(days=7)
MAX_OCCURRENCES_PER_SERIES = 31
SERIES_PAGE = 200


async def create_occurrences(session: AsyncSession, now: datetime) -> int:
    """Create the tasks that recurring series need within LOOKAHEAD of now, and return how many it created.

    A series is a task with a repeat rule and no parent. Cancelling that task stops the series. Occurrences
    that fell before now while the scheduler was down stay uncreated.
    """
    created = 0
    after: uuid.UUID | None = None
    while True:
        stmt = (
            select(Task)
            .where(Task.rrule.is_not(None), Task.parent_task_id.is_(None), Task.status != TaskStatus.CANCELLED)
            .order_by(Task.id)
            .limit(SERIES_PAGE)
        )
        if after is not None:
            stmt = stmt.where(Task.id > after)
        series = (await session.scalars(stmt)).all()
        for parent in series:
            created += await extend_series(session, parent, now)
        if len(series) < SERIES_PAGE:
            return created
        after = series[-1].id


async def extend_series(session: AsyncSession, parent: Task, now: datetime) -> int:
    if parent.rrule is None:
        return 0
    anchor = series_anchor(parent.scheduled_for, parent.created_at)
    dates = occurrences_between(parent.rrule, anchor, now, now + LOOKAHEAD, MAX_OCCURRENCES_PER_SERIES)
    if not dates:
        return 0
    existing = set(
        await session.scalars(
            select(Task.scheduled_for).where(Task.parent_task_id == parent.id, Task.scheduled_for.in_(dates))
        )
    )
    missing = [occurrence for occurrence in dates if occurrence not in existing]
    if not missing:
        return 0

    assignee = await current_assignee(session, parent)
    steps = list(
        await session.scalars(
            select(TaskChecklistItem.text)
            .where(TaskChecklistItem.task_id == parent.id)
            .order_by(TaskChecklistItem.position, TaskChecklistItem.id)
        )
    )
    for occurrence in missing:
        task = Task(
            title=parent.title,
            description=parent.description,
            status=TaskStatus.PENDING,
            country=parent.country,
            location_id=parent.location_id,
            assigned_to=assignee,
            parent_task_id=parent.id,
            scheduled_for=occurrence,
            priority=parent.priority,
            due_date=occurrence.date(),
            photo_required=parent.photo_required,
            created_at=now,
        )
        session.add(task)
        await session.flush()
        session.add_all(
            TaskChecklistItem(task_id=task.id, position=index, text=text) for index, text in enumerate(steps)
        )
        outbox.enqueue(session, TaskEvent.of(TaskEventType.CREATED, task, None, scheduled=True))
    return len(missing)


async def current_assignee(session: AsyncSession, parent: Task) -> uuid.UUID | None:
    """Return the series assignee if they may still take tasks of its country; new tasks go unassigned otherwise."""
    if parent.assigned_to is None:
        return None
    user = await session.get(User, parent.assigned_to)
    if user is None or not task_access.can_assign(parent.country, user.role, user.country, user.is_active):
        return None
    return user.id
