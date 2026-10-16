import uuid
from datetime import date, timedelta
from typing import Any

import azure.functions as func
import pytest
from sqlalchemy import select

from src.api import stats, task_activity, tasks
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import OutboxMessage, Task, TaskComment
from src.infrastructure.messaging import consumer
from tests.integration.conftest import Account, call, payload

pytestmark = pytest.mark.integration

TODAY = date.today()


async def edit(account: Account, task_id: uuid.UUID, body: dict[str, Any]) -> func.HttpResponse:
    return await call(
        tasks.update_task, "PATCH", headers=account.headers, route={"task_id": str(task_id)}, json_body=body
    )


async def test_manager_edits_fields_and_clears_due_date(account, task_factory):
    manager = await account("manager", "DE")
    task = await task_factory(title="Clean lobby", priority="normal", due_date=TODAY)

    changed = await edit(manager, task.id, {"title": "  Deep clean lobby ", "priority": "urgent"})
    cleared = await edit(manager, task.id, {"due_date": None})

    assert changed.status_code == 200
    body = payload(changed)
    assert (body["title"], body["priority"], body["due_date"]) == ("Deep clean lobby", "urgent", TODAY.isoformat())
    assert payload(cleared)["due_date"] is None
    assert payload(cleared)["title"] == "Deep clean lobby"


async def test_edit_rejects_empty_body_and_null_title(account, task_factory):
    manager = await account("manager", "DE")
    task = await task_factory()

    assert (await edit(manager, task.id, {})).status_code == 400
    assert (await edit(manager, task.id, {"title": None})).status_code == 400
    assert (await edit(manager, task.id, {"priority": None})).status_code == 400


async def test_manager_cannot_edit_tasks_of_another_country(account, task_factory):
    manager = await account("manager", "DE")
    foreign = await task_factory(country="NL")

    response = await edit(manager, foreign.id, {"title": "Hijacked"})

    assert response.status_code == 404
    async with session_scope() as session:
        stored = await session.get(Task, foreign.id)
        assert stored is not None
        assert stored.title == "Clean lobby"


async def test_cleaner_cannot_edit_or_delete(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(assigned_to=cleaner.user.id)

    edited = await edit(cleaner, task.id, {"title": "Mine now"})
    deleted = await call(tasks.delete_task, "DELETE", headers=cleaner.headers, route={"task_id": str(task.id)})

    assert (edited.status_code, deleted.status_code) == (403, 403)


async def test_reassignment_is_validated_against_the_task_country(account, task_factory, location_factory):
    manager = await account("manager", "DE")
    cleaner_nl = await account("cleaner", "NL")
    amsterdam = await location_factory("Amsterdam", "NL", "city")
    task = await task_factory()

    wrong_assignee = await edit(manager, task.id, {"assigned_to": str(cleaner_nl.user.id)})
    wrong_location = await edit(manager, task.id, {"location_id": str(amsterdam.id)})

    assert wrong_assignee.status_code == 400
    assert wrong_location.status_code == 400


async def test_reassignment_records_previous_assignee_and_notifies_the_new_one(account, task_factory, monkeypatch):
    manager = await account("manager", "DE")
    first = await account("cleaner", "DE")
    second = await account("cleaner", "DE")
    task = await task_factory(assigned_to=first.user.id)

    response = await edit(manager, task.id, {"assigned_to": str(second.user.id)})

    assert payload(response)["assigned_to"] == str(second.user.id)
    async with session_scope() as session:
        event = await session.scalar(select(OutboxMessage).where(OutboxMessage.event_type == "task_updated"))
    assert event is not None
    assert event.payload["previous_assigned_to"] == str(first.user.id)
    assert event.payload["fields"] == ["assigned_to"]

    notified: list[tuple[object, str]] = []

    async def fake_notify(user_id, title, body):
        notified.append((user_id, title))

    monkeypatch.setattr(consumer, "notify_user", fake_notify)
    await consumer.handle_task_updated({**event.payload, "type": "task_updated"})
    await consumer.handle_task_updated({**event.payload, "previous_assigned_to": str(second.user.id)})

    assert notified == [(second.user.id, "New task assigned")]


async def test_delete_removes_task_with_comments_and_keeps_occurrences(account, task_factory, monkeypatch):
    manager = await account("manager", "DE")
    parent = await task_factory(title="Weekly clean", rrule="FREQ=WEEKLY", is_recurring=True)
    child = await task_factory(title="Weekly clean #1", parent_task_id=parent.id)
    await call(
        task_activity.add_comment,
        "POST",
        headers=manager.headers,
        route={"task_id": str(parent.id)},
        json_body={"text": "Remember the windows"},
    )
    removed: list[str] = []

    async def fake_delete_prefix(container, prefix):
        removed.append(prefix)
        return 0

    monkeypatch.setattr(tasks, "delete_prefix", fake_delete_prefix)

    response = await call(tasks.delete_task, "DELETE", headers=manager.headers, route={"task_id": str(parent.id)})

    assert response.status_code == 204
    assert removed == [f"{parent.id}/"]
    async with session_scope() as session:
        assert await session.get(Task, parent.id) is None
        assert (await session.scalars(select(TaskComment))).all() == []
        orphan = await session.get(Task, child.id)
        assert orphan is not None
        assert orphan.parent_task_id is None


async def test_delete_succeeds_when_photo_storage_is_unavailable(account, task_factory, monkeypatch):
    manager = await account("manager", "DE")
    task = await task_factory()

    async def broken_delete_prefix(container, prefix):
        from azure.core.exceptions import ServiceRequestError

        raise ServiceRequestError("storage is down")

    monkeypatch.setattr(tasks, "delete_prefix", broken_delete_prefix)

    response = await call(tasks.delete_task, "DELETE", headers=manager.headers, route={"task_id": str(task.id)})

    assert response.status_code == 204


async def test_overdue_filter_and_count_include_only_open_tasks_past_due(account, task_factory):
    manager = await account("manager", "DE")
    late = await task_factory(title="Late", due_date=TODAY - timedelta(days=1))
    await task_factory(title="Late but done", status="completed", due_date=TODAY - timedelta(days=3))
    await task_factory(title="Due today", due_date=TODAY)
    await task_factory(title="No due date")

    listed = await call(tasks.get_tasks, headers=manager.headers, params={"overdue": "true"})
    dashboard = await call(stats.get_dashboard, headers=manager.headers)

    assert [t["id"] for t in payload(listed)["data"]] == [str(late.id)]
    assert payload(dashboard)["overdue_count"] == 1


async def test_sort_by_due_date_puts_tasks_without_due_date_last(account, task_factory):
    admin = await account("admin", None)
    await task_factory(title="No date")
    await task_factory(title="Later", due_date=TODAY + timedelta(days=5))
    await task_factory(title="Sooner", due_date=TODAY + timedelta(days=1))

    response = await call(tasks.get_tasks, headers=admin.headers, params={"sort": "due_date"})

    assert [t["title"] for t in payload(response)["data"]] == ["Sooner", "Later", "No date"]


async def test_create_accepts_due_date(account):
    manager = await account("manager", "DE")
    due = (TODAY + timedelta(days=2)).isoformat()

    response = await call(
        tasks.create_task,
        "POST",
        headers=manager.headers,
        json_body={"title": "Wash windows", "country": "DE", "due_date": due},
    )

    assert payload(response)["due_date"] == due
