import pytest

from src.api import task_activity, tasks
from tests.integration.conftest import Account, call, multipart, payload

pytestmark = pytest.mark.integration

JPEG_BYTES = b"\xff\xd8\xff\xe0" + b"0" * 64


@pytest.fixture(autouse=True)
def stored_blobs(monkeypatch):
    async def fake_upload(container, name, data, content_type):
        return f"https://blob/{container}/{name}"

    monkeypatch.setattr(task_activity, "upload_blob", fake_upload)


async def upload(account: Account, task_id: str, kind: str | None = None):
    fields = {"kind": kind} if kind is not None else None
    body, headers = multipart("photo", "room.jpg", JPEG_BYTES, "image/jpeg", fields)
    return await call(
        task_activity.upload_task_photo,
        "POST",
        headers={**account.headers, **headers},
        body=body,
        route={"task_id": task_id},
    )


async def test_a_photo_is_a_result_photo_unless_marked_before(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(assigned_to=cleaner.user.id)

    before = await upload(cleaner, str(task.id), "before")
    after = await upload(cleaner, str(task.id))

    assert (payload(before)["kind"], payload(after)["kind"]) == ("before", "after")
    listed = payload(
        await call(task_activity.get_task_photos, headers=cleaner.headers, route={"task_id": str(task.id)})
    )
    assert sorted(photo["kind"] for photo in listed) == ["after", "before"]


async def test_an_unknown_photo_kind_is_rejected(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(assigned_to=cleaner.user.id)

    response = await upload(cleaner, str(task.id), "during")

    assert response.status_code == 400


async def test_a_before_photo_does_not_satisfy_the_photo_requirement(account, task_factory):
    cleaner = await account("cleaner", "DE")
    task = await task_factory(assigned_to=cleaner.user.id, status="in_progress", photo_required=True)
    route = {"task_id": str(task.id)}

    await upload(cleaner, str(task.id), "before")
    blocked = await call(
        tasks.update_task_status, "PATCH", headers=cleaner.headers, route=route, json_body={"status": "on_review"}
    )
    await upload(cleaner, str(task.id), "after")
    allowed = await call(
        tasks.update_task_status, "PATCH", headers=cleaner.headers, route=route, json_body={"status": "on_review"}
    )

    assert payload(blocked)["error"] == "Before sending for review, upload a photo of the result"
    assert (allowed.status_code, payload(allowed)["photo_count"]) == (200, 1)
