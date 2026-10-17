from datetime import UTC, date, datetime, timedelta

import pytest

from src.api import stats
from tests.integration.conftest import call, payload

pytestmark = pytest.mark.integration

NOW = datetime.now(UTC)
TODAY = NOW.date()


def at(days_ago: int) -> datetime:
    return NOW - timedelta(days=days_ago)


@pytest.fixture
async def office(account, location_factory, task_factory):
    manager = await account("manager", "DE")
    admin = await account("admin", None)
    first = await account("cleaner", "DE")
    second = await account("cleaner", "DE")
    await account("cleaner", "NL")
    germany = await location_factory("Germany", "DE", "country")
    lobby = await location_factory("Lobby", "DE", "room", germany)
    await task_factory(
        title="Lobby done",
        location_id=lobby.id,
        assigned_to=first.user.id,
        status="completed",
        priority="high",
        quality_score=4,
        quality_reviewed_at=at(1),
        created_at=at(2),
    )
    await task_factory(
        title="Lobby again",
        location_id=lobby.id,
        assigned_to=first.user.id,
        status="in_progress",
        due_date=TODAY - timedelta(days=1),
        created_at=at(1),
    )
    await task_factory(
        title="Weekly",
        assigned_to=second.user.id,
        status="completed",
        quality_score=2,
        quality_reviewed_at=at(40),
        rrule="FREQ=WEEKLY",
        is_recurring=True,
        created_at=at(40),
    )
    await task_factory(country="NL", title="Dutch", priority="urgent", created_at=at(3))
    return {"manager": manager, "admin": admin, "first": first, "second": second}


async def test_the_dashboard_summarises_the_managers_country(office):
    body = payload(await call(stats.get_dashboard, headers=office["manager"].headers))

    assert body["total_tasks"] == 3
    assert body["status_stats"] | {"completed": 2, "in_progress": 1, "pending": 0} == body["status_stats"]
    assert body["priority_stats"]["high"] == 1
    assert body["priority_stats"]["urgent"] == 0
    assert body["country_stats"] == [{"country": "DE", "count": 3}]
    assert [day["count"] for day in body["daily_stats"]] == [1, 1]
    assert body["top_locations"][0] | {"name": "Lobby", "count": 2} == body["top_locations"][0]
    assert (body["avg_quality"], body["reviewed_count"]) == (3.0, 2)
    assert (body["recurring_count"], body["overdue_count"]) == (1, 1)
    assert body["total_users"] == 3


async def test_the_dashboard_of_an_admin_covers_every_country(office):
    body = payload(await call(stats.get_dashboard, headers=office["admin"].headers))

    assert body["total_tasks"] == 4
    assert body["country_stats"] == [{"country": "DE", "count": 3}, {"country": "NL", "count": 1}]
    assert body["total_users"] == 5


async def test_a_report_counts_only_its_period(office):
    params = {"date_from": (TODAY - timedelta(days=7)).isoformat(), "date_to": TODAY.isoformat()}

    body = payload(await call(stats.get_reports, headers=office["manager"].headers, params=params))

    assert body["period"] == {"date_from": params["date_from"], "date_to": params["date_to"]}
    assert body["total_tasks"] == 2
    assert sum(week["count"] for week in body["weekly_stats"]) == 2
    assert body["quality_stats"] == {"avg": 4.0, "min": 4, "max": 4, "reviewed_count": 1}
    cleaners = {row["email"]: row for row in body["top_cleaners"]}
    assert (
        cleaners[office["first"].user.email] | {"task_count": 2, "completed_count": 1, "completion_rate": 50}
        == (cleaners[office["first"].user.email])
    )
    assert cleaners[office["second"].user.email]["task_count"] == 0
    assert all(row["country"] == "DE" for row in body["top_cleaners"])


async def test_an_admin_report_can_focus_on_one_country(office):
    params = {"date_from": (TODAY - timedelta(days=7)).isoformat(), "country": "NL"}

    body = payload(await call(stats.get_reports, headers=office["admin"].headers, params=params))

    assert body["total_tasks"] == 1
    assert body["priority_stats"]["urgent"] == 1
    assert [row["country"] for row in body["top_cleaners"]] == ["NL"]


async def test_the_default_report_covers_the_last_thirty_days(office):
    body = payload(await call(stats.get_reports, headers=office["manager"].headers))

    assert body["period"]["date_to"] == TODAY.isoformat()
    assert date.fromisoformat(body["period"]["date_from"]) == TODAY - timedelta(days=30)
    assert body["total_tasks"] == 2
