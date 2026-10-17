from datetime import date
from typing import Any

import pytest

from src.api import calendar
from tests.integration.conftest import Account, call, payload

pytestmark = pytest.mark.integration

OCTOBER = {"date_from": "2026-10-01", "date_to": "2026-10-31"}


async def due(account: Account, params: dict[str, str] | None = None) -> dict[str, Any]:
    response = await call(calendar.get_calendar, headers=account.headers, params=params or OCTOBER)
    assert response.status_code == 200, payload(response)
    body: dict[str, Any] = payload(response)
    return body


async def test_the_calendar_lists_tasks_due_in_the_period_in_date_order(account, task_factory):
    manager = await account("manager", "DE")
    cleaner = await account("cleaner", "DE", email="anna@example.com")
    await task_factory(title="Late", due_date=date(2026, 10, 20))
    await task_factory(title="Early", due_date=date(2026, 10, 2), assigned_to=cleaner.user.id)
    await task_factory(title="November", due_date=date(2026, 11, 1))
    await task_factory(title="No date")

    body = await due(manager)

    assert [task["title"] for task in body["data"]] == ["Early", "Late"]
    assert (body["data"][0]["due_date"], body["data"][0]["assigned_to_email"]) == ("2026-10-02", "anna@example.com")
    assert body["truncated"] is False


async def test_each_role_sees_its_own_scope(account, task_factory):
    manager, cleaner, admin = (
        await account("manager", "DE"),
        await account("cleaner", "DE"),
        await account("admin", None),
    )
    await task_factory(title="Mine", due_date=date(2026, 10, 5), assigned_to=cleaner.user.id)
    await task_factory(title="Colleague", due_date=date(2026, 10, 5))
    await task_factory(title="Dutch", country="NL", due_date=date(2026, 10, 5))

    assert [t["title"] for t in (await due(cleaner))["data"]] == ["Mine"]
    assert sorted(t["title"] for t in (await due(manager))["data"]) == ["Colleague", "Mine"]
    assert [t["title"] for t in (await due(admin, {**OCTOBER, "country": "NL"}))["data"]] == ["Dutch"]


async def test_the_calendar_filters_by_assignee(account, task_factory):
    manager, cleaner = await account("manager", "DE"), await account("cleaner", "DE")
    await task_factory(title="Hers", due_date=date(2026, 10, 5), assigned_to=cleaner.user.id)
    await task_factory(title="Nobody", due_date=date(2026, 10, 5))

    body = await due(manager, {**OCTOBER, "assigned_to": str(cleaner.user.id)})

    assert [t["title"] for t in body["data"]] == ["Hers"]


@pytest.mark.parametrize(
    "params",
    [
        {},
        {"date_from": "2026-10-01"},
        {"date_from": "2026-10-10", "date_to": "2026-10-01"},
        {"date_from": "2026-10-01", "date_to": "2026-11-12"},
        {"date_from": "yesterday", "date_to": "2026-10-01"},
    ],
    ids=["no period", "no end", "reversed", "longer than six weeks", "not a date"],
)
async def test_invalid_periods_are_rejected(account, params):
    manager = await account("manager", "DE")

    response = await call(calendar.get_calendar, headers=manager.headers, params=params)

    assert response.status_code == 400


async def test_a_full_six_weeks_is_allowed(account):
    manager = await account("manager", "DE")

    body = await due(manager, {"date_from": "2026-09-28", "date_to": "2026-11-08"})

    assert body["data"] == []


async def test_a_crowded_period_is_marked_truncated(account, task_factory, monkeypatch):
    manager = await account("manager", "DE")
    monkeypatch.setattr(calendar, "MAX_CALENDAR_TASKS", 2)
    for day in (1, 2, 3):
        await task_factory(title=f"Day {day}", due_date=date(2026, 10, day))

    body = await due(manager)

    assert ([t["title"] for t in body["data"]], body["truncated"]) == (["Day 1", "Day 2"], True)
