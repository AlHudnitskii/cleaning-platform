import pytest
from sqlalchemy import func, select

from src.api import stats, task_activity, tasks
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import OutboxMessage, Task, TaskStatusHistory
from tests.integration.conftest import call, multipart, payload

pytestmark = pytest.mark.integration

JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"0" * 64


async def test_manager_cannot_read_task_from_other_country(account, task_factory):
    manager = await account("manager", "DE")
    foreign = await task_factory(country="NL")

    response = await call(tasks.get_task, headers=manager.headers, route={"task_id": str(foreign.id)})

    assert response.status_code == 404


async def test_manager_cannot_change_status_of_foreign_task(account, task_factory):
    manager = await account("manager", "DE")
    foreign = await task_factory(country="NL")

    response = await call(
        tasks.update_task_status,
        "PATCH",
        headers=manager.headers,
        route={"task_id": str(foreign.id)},
        json_body={"status": "in_progress"},
    )

    assert response.status_code == 404
    async with session_scope() as session:
        assert (await session.get_one(Task, foreign.id)).status == "pending"


async def test_cleaner_cannot_read_comments_or_history_of_unassigned_task(account, task_factory):
    cleaner = await account("cleaner", "DE")
    other = await task_factory(country="DE")

    for builder in (task_activity.get_comments, task_activity.get_task_history, task_activity.get_task_photos):
        response = await call(builder, headers=cleaner.headers, route={"task_id": str(other.id)})
        assert response.status_code == 404, builder


async def test_manager_cannot_create_task_in_other_country(account):
    manager = await account("manager", "DE")

    response = await call(
        tasks.create_task, "POST", headers=manager.headers, json_body={"title": "Clean hall", "country": "NL"}
    )

    assert response.status_code == 403


async def test_task_list_is_scoped_to_manager_country(account, task_factory):
    manager = await account("manager", "DE")
    own = await task_factory(country="DE")
    await task_factory(country="NL")

    response = await call(tasks.get_tasks, headers=manager.headers, params={"country": "NL"})

    body = payload(response)
    assert [t["id"] for t in body["data"]] == [str(own.id)]
    assert body["pagination"]["total"] == 1


async def test_photo_upload_requires_token(task_factory):
    task = await task_factory()
    body, headers = multipart("photo", "a.jpg", JPEG_BYTES, "image/jpeg")

    response = await call(
        task_activity.upload_task_photo, "POST", headers=headers, body=body, route={"task_id": str(task.id)}
    )

    assert response.status_code == 401


async def test_photo_upload_rejects_non_images(account, task_factory, monkeypatch):
    admin = await account("admin", None)
    task = await task_factory()

    async def must_not_upload(*args, **kwargs):
        raise AssertionError("non-image must not reach blob storage")

    monkeypatch.setattr(task_activity, "upload_blob", must_not_upload)
    body, headers = multipart("photo", "evil.svg", b"<svg onload=alert(1)>", "image/jpeg")

    response = await call(
        task_activity.upload_task_photo,
        "POST",
        headers={**headers, **admin.headers},
        body=body,
        route={"task_id": str(task.id)},
    )

    assert response.status_code == 415


async def test_photo_uploads_with_same_filename_get_distinct_blobs(account, task_factory, monkeypatch):
    admin = await account("admin", None)
    task = await task_factory()
    stored: list[tuple[str, str]] = []

    async def fake_upload(container, name, data, content_type):
        stored.append((name, content_type))
        return f"https://blob/{container}/{name}"

    monkeypatch.setattr(task_activity, "upload_blob", fake_upload)
    body, headers = multipart("photo", "../../photo.jpg", JPEG_BYTES, "text/html")

    for _ in range(2):
        response = await call(
            task_activity.upload_task_photo,
            "POST",
            headers={**headers, **admin.headers},
            body=body,
            route={"task_id": str(task.id)},
        )
        assert response.status_code == 201
        assert payload(response)["filename"] == "photo.jpg"

    names = [name for name, _ in stored]
    assert len(set(names)) == 2
    assert all(name.startswith(f"{task.id}/") and name.endswith(".jpg") for name in names)
    assert {content_type for _, content_type in stored} == {"image/jpeg"}


async def test_reports_reject_injected_country(account):
    admin = await account("admin", None)

    response = await call(stats.get_reports, headers=admin.headers, params={"country": "DE' OR '1'='1"})

    assert response.status_code == 400


async def test_dashboard_for_manager_counts_only_own_country(account, task_factory):
    manager = await account("manager", "DE")
    await task_factory(country="DE")
    await task_factory(country="NL")
    await task_factory(country="NL")

    response = await call(stats.get_dashboard, headers=manager.headers)

    body = payload(response)
    assert body["total_tasks"] == 1
    assert body["country_stats"] == [{"country": "DE", "count": 1}]
    assert body["status_stats"]["on_review"] == 0


async def test_cleaner_cannot_open_dashboard(account):
    cleaner = await account("cleaner", "DE")

    response = await call(stats.get_dashboard, headers=cleaner.headers)

    assert response.status_code == 403


async def test_status_change_writes_history_and_outbox_together(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(assigned_to=cleaner.user.id)

    response = await call(
        tasks.update_task_status,
        "PATCH",
        headers=cleaner.headers,
        route={"task_id": str(task.id)},
        json_body={"status": "in_progress"},
    )

    assert response.status_code == 200
    assert payload(response)["allowed_statuses"] == ["on_review", "on_hold"]
    async with session_scope() as session:
        history = (await session.scalars(select(TaskStatusHistory))).all()
        events = (await session.scalars(select(OutboxMessage))).all()
    assert [(h.old_status, h.new_status, h.changed_by) for h in history] == [
        ("pending", "in_progress", cleaner.user.id)
    ]
    assert [e.event_type for e in events] == ["task_status_changed"]
    assert events[0].payload["changed_by"] == str(cleaner.user.id)


async def test_cleaner_cannot_complete_task(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(assigned_to=cleaner.user.id, status="in_progress")

    response = await call(
        tasks.update_task_status,
        "PATCH",
        headers=cleaner.headers,
        route={"task_id": str(task.id)},
        json_body={"status": "completed"},
    )

    assert response.status_code == 409
    async with session_scope() as session:
        assert await session.scalar(select(func.count()).select_from(OutboxMessage)) == 0
