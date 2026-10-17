from datetime import date

import pytest
from sqlalchemy import select

from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import OutboxMessage, Task
from src.scheduler.reminders import send_reminders

pytestmark = pytest.mark.integration

TODAY = date(2026, 10, 12)


async def run(today: date = TODAY) -> int:
    async with session_scope() as session, session.begin():
        return await send_reminders(session, today)


async def announced() -> list[tuple[str, str]]:
    async with session_scope() as session:
        messages = await session.scalars(select(OutboxMessage).order_by(OutboxMessage.created_at, OutboxMessage.id))
        return [(m.event_type, str(m.payload["title"])) for m in messages]


async def test_an_assigned_task_due_tomorrow_is_announced_once(account, task_factory):
    cleaner = await account("cleaner", "DE")
    await task_factory(title="Lobby", due_date=date(2026, 10, 13), assigned_to=cleaner.user.id)

    first = await run()
    second = await run()

    assert (first, second) == (1, 0)
    assert await announced() == [("task_due_soon", "Lobby")]


async def test_unassigned_closed_and_later_tasks_get_no_due_soon_reminder(account, task_factory):
    cleaner = await account("cleaner", "DE")
    await task_factory(title="Nobody", due_date=date(2026, 10, 13))
    await task_factory(title="Done", due_date=date(2026, 10, 13), assigned_to=cleaner.user.id, status="completed")
    await task_factory(title="Later", due_date=date(2026, 10, 14), assigned_to=cleaner.user.id)

    assert await run() == 0


async def test_a_task_that_passed_its_due_date_is_announced_once(task_factory):
    await task_factory(title="Yesterday", due_date=date(2026, 10, 11))

    assert (await run(), await run()) == (1, 0)
    assert await announced() == [("task_overdue", "Yesterday")]


async def test_long_overdue_and_closed_tasks_stay_quiet(task_factory):
    await task_factory(title="Last month", due_date=date(2026, 9, 12))
    await task_factory(title="Cancelled", due_date=date(2026, 10, 11), status="cancelled")
    await task_factory(title="On review", due_date=date(2026, 10, 11), status="on_review")

    assert await run() == 1
    assert await announced() == [("task_overdue", "On review")]


async def test_moving_the_due_date_arms_the_reminder_again(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(title="Lobby", due_date=date(2026, 10, 13), assigned_to=cleaner.user.id)
    await run()
    async with session_scope() as session, session.begin():
        stored = await session.get(Task, task.id)
        assert stored is not None
        stored.due_date = date(2026, 10, 14)

    assert await run(date(2026, 10, 13)) == 1
    assert await announced() == [("task_due_soon", "Lobby"), ("task_due_soon", "Lobby")]
