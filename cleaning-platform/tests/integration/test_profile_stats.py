from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from src.api import profile
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import TaskStatusHistory
from tests.integration.conftest import Account, call, payload

pytestmark = pytest.mark.integration

NOW = datetime.now(UTC)


async def stats(account: Account) -> dict[str, Any]:
    response = await call(profile.get_profile_stats, headers=account.headers)
    assert response.status_code == 200
    body: dict[str, Any] = payload(response)
    return body


async def finish(task_id, started: datetime, minutes: int) -> None:
    async with session_scope() as session, session.begin():
        session.add(
            TaskStatusHistory(task_id=task_id, old_status="pending", new_status="in_progress", changed_at=started)
        )
        session.add(
            TaskStatusHistory(
                task_id=task_id,
                old_status="in_progress",
                new_status="completed",
                changed_at=started + timedelta(minutes=minutes),
            )
        )


async def test_a_cleaner_sees_figures_for_their_own_tasks(account, task_factory):
    cleaner, other = await account("cleaner", "DE"), await account("cleaner", "DE")
    mine = {"assigned_to": cleaner.user.id}
    recent = await task_factory(status="completed", quality_score=4, quality_reviewed_at=NOW, **mine)
    await finish(recent.id, NOW - timedelta(hours=3), 30)
    older = await task_factory(
        status="completed", quality_score=1, quality_reviewed_at=NOW - timedelta(days=60), **mine
    )
    await finish(older.id, NOW - timedelta(days=60), 90)
    await task_factory(status="pending", **mine)
    await task_factory(status="on_review", due_date=(NOW - timedelta(days=2)).date(), **mine)
    await task_factory(status="completed", assigned_to=other.user.id)

    body = await stats(cleaner)

    assert body == {
        "period_days": 30,
        "completed": 1,
        "open": 2,
        "on_review": 1,
        "overdue": 1,
        "avg_quality": 4.0,
        "avg_work_seconds": 1800,
    }


async def test_a_manager_sees_their_country(account, task_factory):
    manager = await account("manager", "DE")
    await task_factory(status="on_review")
    await task_factory(status="on_review", country="NL")

    body = await stats(manager)

    assert (body["open"], body["on_review"]) == (1, 1)


async def test_a_new_user_gets_empty_figures(account):
    cleaner = await account("cleaner", "DE")

    body = await stats(cleaner)

    assert body == {
        "period_days": 30,
        "completed": 0,
        "open": 0,
        "on_review": 0,
        "overdue": 0,
        "avg_quality": None,
        "avg_work_seconds": None,
    }


async def test_figures_need_a_session():
    assert (await call(profile.get_profile_stats)).status_code == 401
