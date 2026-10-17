import pytest
from sqlalchemy import func, select

from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import OutboxMessage, Task, TaskChecklistItem, User
from src.scheduler import worker
from src.scheduler.recurrence import create_occurrences
from tests.integration.conftest import utc

pytestmark = pytest.mark.integration

NOW = utc(2026, 10, 12, 6)
START = utc(2026, 10, 5, 9)


async def run(now=NOW) -> int:
    async with session_scope() as session, session.begin():
        return await create_occurrences(session, now)


async def occurrences(parent_id) -> list[Task]:
    async with session_scope() as session:
        rows = await session.scalars(select(Task).where(Task.parent_task_id == parent_id).order_by(Task.scheduled_for))
        return list(rows)


async def add_steps(task_id, *texts: str) -> None:
    async with session_scope() as session, session.begin():
        session.add_all(TaskChecklistItem(task_id=task_id, position=i, text=text) for i, text in enumerate(texts))


async def test_a_daily_series_gets_a_task_for_each_day_of_the_coming_week(account, task_factory):
    cleaner = await account("cleaner", "DE")
    parent = await task_factory(
        title="Lobby check",
        rrule="FREQ=DAILY",
        is_recurring=True,
        created_at=START,
        assigned_to=cleaner.user.id,
        priority="high",
        photo_required=True,
    )
    await add_steps(parent.id, "Wipe desks", "Empty bins")

    created = await run()

    tasks = await occurrences(parent.id)
    assert created == 7
    assert [task.scheduled_for for task in tasks] == [utc(2026, 10, day, 9) for day in range(12, 19)]
    first = tasks[0]
    assert (first.title, first.status, first.country, first.priority) == ("Lobby check", "pending", "DE", "high")
    assert (first.assigned_to, first.photo_required, first.rrule) == (cleaner.user.id, True, None)
    assert first.due_date == utc(2026, 10, 12).date()
    async with session_scope() as session:
        steps = await session.scalars(
            select(TaskChecklistItem.text)
            .where(TaskChecklistItem.task_id == first.id)
            .order_by(TaskChecklistItem.position)
        )
        assert list(steps) == ["Wipe desks", "Empty bins"]


async def test_a_second_run_creates_nothing_new(task_factory):
    parent = await task_factory(rrule="FREQ=DAILY", is_recurring=True, created_at=START)

    first = await run()
    second = await run()

    assert (first, second) == (7, 0)
    assert len(await occurrences(parent.id)) == 7


async def test_a_later_run_adds_only_the_days_that_entered_the_window(task_factory):
    parent = await task_factory(rrule="FREQ=DAILY", is_recurring=True, created_at=START)
    await run()

    created = await run(utc(2026, 10, 14, 6))

    assert created == 2
    assert len(await occurrences(parent.id)) == 9


async def test_a_weekly_series_uses_its_planned_time(task_factory):
    parent = await task_factory(
        rrule="FREQ=WEEKLY;BYDAY=MO", is_recurring=True, created_at=utc(2026, 9, 1), scheduled_for=START
    )

    await run()

    assert [task.scheduled_for for task in await occurrences(parent.id)] == [utc(2026, 10, 12, 9)]


async def test_cancelled_series_and_plain_tasks_get_no_occurrences(task_factory):
    cancelled = await task_factory(rrule="FREQ=DAILY", is_recurring=True, created_at=START, status="cancelled")
    plain = await task_factory(created_at=START)

    assert await run() == 0
    assert await occurrences(cancelled.id) == []
    assert await occurrences(plain.id) == []


async def test_occurrences_of_an_occurrence_are_never_created(task_factory):
    parent = await task_factory(rrule="FREQ=DAILY", is_recurring=True, created_at=START)
    await task_factory(rrule="FREQ=DAILY", parent_task_id=parent.id, scheduled_for=utc(2026, 10, 1), created_at=START)

    assert await run() == 7


async def test_a_deactivated_assignee_is_left_off_new_tasks(account, task_factory):
    cleaner = await account("cleaner", "DE")
    parent = await task_factory(rrule="FREQ=DAILY", is_recurring=True, created_at=START, assigned_to=cleaner.user.id)
    async with session_scope() as session, session.begin():
        user = await session.get(User, cleaner.user.id)
        assert user is not None
        user.is_active = False

    await run()

    assert {task.assigned_to for task in await occurrences(parent.id)} == {None}


async def test_each_new_task_is_announced_as_scheduled(task_factory):
    await task_factory(rrule="FREQ=WEEKLY;BYDAY=MO", is_recurring=True, created_at=START)

    await run()

    async with session_scope() as session:
        messages = list(await session.scalars(select(OutboxMessage)))
    assert [(m.event_type, m.payload["changed_by"], m.payload["scheduled"]) for m in messages] == [
        ("task_created", None, True)
    ]


async def test_a_run_is_skipped_while_another_replica_holds_the_lock(task_factory):
    parent = await task_factory(rrule="FREQ=DAILY", is_recurring=True, created_at=START)
    async with session_scope() as holder, holder.begin():
        await holder.execute(select(func.pg_advisory_xact_lock(worker.ADVISORY_LOCK_KEY)))

        assert await worker.run_once(NOW) is False

    assert await occurrences(parent.id) == []
