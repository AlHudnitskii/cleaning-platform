from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from src.api import stats, tasks
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import TaskStatusHistory, User
from tests.integration.conftest import call, payload

pytestmark = pytest.mark.integration

NOW = datetime.now(UTC).replace(microsecond=0)


async def history(task_id, *steps: tuple[str, datetime]) -> None:
    async with session_scope() as session, session.begin():
        previous = "pending"
        for status, changed_at in steps:
            session.add(
                TaskStatusHistory(task_id=task_id, old_status=previous, new_status=status, changed_at=changed_at)
            )
            previous = status


async def detail(account, task_id) -> dict[str, Any]:
    response = await call(tasks.get_task, headers=account.headers, route={"task_id": str(task_id)})
    assert response.status_code == 200
    body: dict[str, Any] = payload(response)
    return body


async def test_work_time_counts_progress_and_skips_hold_and_review(account, task_factory):
    manager = await account("manager", "DE")
    task = await task_factory(status="on_review", created_at=NOW - timedelta(days=1))
    start = NOW - timedelta(hours=5)
    await history(
        task.id,
        ("in_progress", start),
        ("on_hold", start + timedelta(minutes=30)),
        ("in_progress", start + timedelta(minutes=90)),
        ("on_review", start + timedelta(minutes=105)),
    )

    body = await detail(manager, task.id)

    assert body["work_seconds"] == 45 * 60
    assert datetime.fromisoformat(body["started_at"]) == start


async def test_work_in_progress_runs_until_now(account, task_factory):
    manager = await account("manager", "DE")
    task = await task_factory(status="in_progress")
    await history(task.id, ("in_progress", NOW - timedelta(hours=1)))

    seconds = (await detail(manager, task.id))["work_seconds"]

    assert 3600 <= seconds < 3600 + 120


async def test_a_task_nobody_started_has_no_work_time(account, task_factory):
    manager = await account("manager", "DE")
    task = await task_factory()
    await history(task.id, ("on_hold", NOW - timedelta(hours=1)))

    body = await detail(manager, task.id)

    assert (body["work_seconds"], body["started_at"]) == (None, None)


async def test_the_task_list_carries_work_time(account, task_factory):
    manager = await account("manager", "DE")
    task = await task_factory(status="completed")
    await history(task.id, ("in_progress", NOW - timedelta(hours=2)), ("completed", NOW - timedelta(hours=1)))

    listed = payload(await call(tasks.get_tasks, headers=manager.headers))["data"]

    assert [row["work_seconds"] for row in listed] == [3600]


async def test_the_report_averages_work_time_per_cleaner_and_location(account, task_factory, location_factory):
    manager = await account("manager", "DE")
    first, second = (
        await account("cleaner", "DE", email="anna@example.com"),
        await account("cleaner", "DE", email="ben@example.com"),
    )
    async with session_scope() as session, session.begin():
        stored = await session.get(User, first.user.id)
        assert stored is not None
        stored.full_name = "Anna Berg"
    germany = await location_factory("Germany", "DE", "country")
    lobby = await location_factory("Lobby", "DE", "room", germany)
    created = NOW - timedelta(days=2)
    durations = [(first, lobby.id, 30), (first, lobby.id, 90), (second, None, 60)]
    for cleaner, location_id, minutes in durations:
        task = await task_factory(
            status="completed", assigned_to=cleaner.user.id, location_id=location_id, created_at=created
        )
        start = created + timedelta(hours=1)
        await history(task.id, ("in_progress", start), ("completed", start + timedelta(minutes=minutes)))
    unfinished = await task_factory(status="in_progress", assigned_to=first.user.id, created_at=created)
    await history(unfinished.id, ("in_progress", created))

    work = payload(await call(stats.get_reports, headers=manager.headers))["work_time"]

    assert (work["avg_seconds"], work["task_count"]) == (3600, 3)
    assert work["by_cleaner"] == [
        {"email": "anna@example.com", "name": "Anna Berg", "task_count": 2, "avg_seconds": 3600},
        {"email": "ben@example.com", "name": None, "task_count": 1, "avg_seconds": 3600},
    ]
    assert work["by_location"] == [{"id": str(lobby.id), "name": "Lobby", "task_count": 2, "avg_seconds": 3600}]


async def test_a_report_without_measured_work_is_empty(account):
    manager = await account("manager", "DE")

    work = payload(await call(stats.get_reports, headers=manager.headers))["work_time"]

    assert work == {"avg_seconds": None, "task_count": 0, "by_cleaner": [], "by_location": []}
