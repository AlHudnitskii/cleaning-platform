from typing import Any

import pytest

from src.api import auth, profile, task_activity, tasks
from tests.integration.conftest import Account, call, multipart, payload

pytestmark = pytest.mark.integration

PNG_BYTES = b"\x89PNG\r\n\x1a\n" + b"0" * 64


async def edit(account: Account, body: dict[str, Any]):
    return await call(profile.update_profile, "PATCH", headers=account.headers, json_body=body)


@pytest.fixture
def blobs(monkeypatch) -> dict[str, list[str]]:
    stored: dict[str, list[str]] = {"uploaded": [], "deleted": []}

    async def fake_upload(container, name, data, content_type):
        url = f"https://blob.example/{container}/{name}"
        stored["uploaded"].append(url)
        return url

    async def fake_delete(url):
        stored["deleted"].append(url)

    monkeypatch.setattr(profile, "upload_blob", fake_upload)
    monkeypatch.setattr(profile, "delete_blob", fake_delete)
    return stored


async def upload(account: Account, data: bytes = PNG_BYTES):
    body, headers = multipart("photo", "me.png", data, "image/png")
    return await call(profile.upload_avatar, "POST", headers={**account.headers, **headers}, body=body)


async def test_a_user_sets_a_name_and_a_phone(account):
    cleaner = await account("cleaner", "DE")

    response = await edit(cleaner, {"full_name": "  Anna Berg ", "phone": "+49 (30) 123-45-67"})
    me = payload(await call(auth.me, headers=cleaner.headers))

    assert response.status_code == 200
    assert (me["full_name"], me["phone"]) == ("Anna Berg", "+49 (30) 123-45-67")


async def test_blank_values_clear_the_fields(account):
    cleaner = await account("cleaner", "DE")
    await edit(cleaner, {"full_name": "Anna", "phone": "+491234567"})

    body = payload(await edit(cleaner, {"full_name": " ", "phone": ""}))

    assert (body["full_name"], body["phone"]) == (None, None)


@pytest.mark.parametrize("phone", ["call me", "12", "+49 30 <script>", "1" * 40])
async def test_an_invalid_phone_is_rejected(account, phone):
    cleaner = await account("cleaner", "DE")

    response = await edit(cleaner, {"phone": phone})

    assert response.status_code == 400


async def test_an_empty_change_is_rejected(account):
    cleaner = await account("cleaner", "DE")

    assert (await edit(cleaner, {})).status_code == 400


async def test_the_profile_needs_a_session():
    response = await call(profile.update_profile, "PATCH", json_body={"full_name": "Eve"})

    assert response.status_code == 401


async def test_a_new_profile_photo_replaces_and_deletes_the_old_one(account, blobs):
    cleaner = await account("cleaner", "DE")

    first = payload(await upload(cleaner))
    second = payload(await upload(cleaner))

    assert len(blobs["uploaded"]) == 2
    assert blobs["deleted"] == [blobs["uploaded"][0]]
    assert f"/avatars/{cleaner.user.id}/" in second["avatar_url"]
    assert first["avatar_url"].split("?")[0] != second["avatar_url"].split("?")[0]


async def test_a_profile_photo_must_be_an_image(account, blobs):
    cleaner = await account("cleaner", "DE")

    response = await upload(cleaner, b"<svg onload=alert(1)>")

    assert response.status_code == 415
    assert blobs["uploaded"] == []


async def test_removing_the_profile_photo_deletes_it(account, blobs):
    cleaner = await account("cleaner", "DE")
    await upload(cleaner)

    body = payload(await call(profile.delete_avatar, "DELETE", headers=cleaner.headers))

    assert body["avatar_url"] is None
    assert blobs["deleted"] == blobs["uploaded"]


async def test_tasks_and_comments_name_people(account, task_factory):
    manager, cleaner = await account("manager", "DE"), await account("cleaner", "DE")
    await edit(cleaner, {"full_name": "Anna Berg"})
    await edit(manager, {"full_name": "Max Vogel"})
    task = await task_factory(assigned_to=cleaner.user.id)
    route = {"task_id": str(task.id)}

    listed = payload(await call(tasks.get_tasks, headers=manager.headers))["data"]
    detail = payload(await call(tasks.get_task, headers=manager.headers, route=route))
    comment = payload(
        await call(task_activity.add_comment, "POST", headers=manager.headers, route=route, json_body={"text": "Hi"})
    )

    assert listed[0]["assigned_to_name"] == "Anna Berg"
    assert detail["assigned_to_name"] == "Anna Berg"
    assert comment["user_name"] == "Max Vogel"
