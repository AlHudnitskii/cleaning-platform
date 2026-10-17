from datetime import date, timedelta

from sqlalchemy import ColumnElement, literal, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from src.domain.models.enums import ReminderKind
from src.domain.services import task_access
from src.infrastructure.database.models import Task, TaskReminder
from src.infrastructure.messaging import outbox
from src.infrastructure.messaging.events import TaskEvent, TaskEventType

# A task that turned overdue while the scheduler was down still gets its reminder within this many days.
# Older overdue tasks stay quiet, so the first run after a deploy does not flood every phone.
OVERDUE_GRACE_DAYS = 3
OPEN_STATUSES = sorted(status.value for status in task_access.OPEN_STATUSES)
EVENTS = {ReminderKind.DUE_SOON: TaskEventType.DUE_SOON, ReminderKind.OVERDUE: TaskEventType.OVERDUE}


async def send_reminders(session: AsyncSession, today: date) -> int:
    """Announce open tasks due tomorrow and tasks that passed their due date, and return how many it announced.

    Dates follow UTC. Each task gets each kind of reminder once per due date, so moving the due date
    re-arms both reminders.
    """
    due_soon = await remind(
        session, ReminderKind.DUE_SOON, [Task.due_date == today + timedelta(days=1), Task.assigned_to.is_not(None)]
    )
    overdue = await remind(
        session,
        ReminderKind.OVERDUE,
        [Task.due_date < today, Task.due_date >= today - timedelta(days=OVERDUE_GRACE_DAYS)],
    )
    return due_soon + overdue


async def remind(session: AsyncSession, kind: ReminderKind, conditions: list[ColumnElement[bool]]) -> int:
    candidates = select(Task.id, literal(kind.value), Task.due_date).where(
        Task.status.in_(OPEN_STATUSES), Task.due_date.is_not(None), *conditions
    )
    recorded = (
        insert(TaskReminder)
        .from_select(["task_id", "kind", "due_date"], candidates)
        .on_conflict_do_nothing(index_elements=["task_id", "kind", "due_date"])
        .returning(TaskReminder.task_id)
    )
    task_ids = list(await session.scalars(recorded))
    if not task_ids:
        return 0
    for task in await session.scalars(select(Task).where(Task.id.in_(task_ids)).order_by(Task.id)):
        outbox.enqueue(session, TaskEvent.of(EVENTS[kind], task, None))
    return len(task_ids)
