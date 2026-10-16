import uuid
from typing import Any

import azure.functions as func
import pytest
from sqlalchemy import select

from src.api import checklists, sync, tasks
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Task, TaskChecklistItem, TaskPhoto
from tests.integration.conftest import Account, call, payload

pytestmark = pytest.mark.integration


async def create_task(account: Account, **fields: Any) -> dict[str, Any]:
    body = {"title": "Clean lobby", "country": "DE", **fields}
    response = await call(tasks.create_task, "POST", headers=account.headers, json_body=body)
    assert response.status_code == 201, payload(response)
    result: dict[str, Any] = payload(response)
    return result


async def checklist(account: Account, task_id: str) -> list[dict[str, Any]]:
    response = await call(checklists.get_checklist, headers=account.headers, route={"task_id": task_id})
    items: list[dict[str, Any]] = payload(response)
    return items


async def tick(account: Account, task_id: str, item_id: str, done: bool = True) -> func.HttpResponse:
    return await call(
        checklists.update_checklist_item,
        "PATCH",
        headers=account.headers,
        route={"task_id": task_id, "item_id": item_id},
        json_body={"done": done},
    )


async def set_status(account: Account, task_id: str, status: str) -> func.HttpResponse:
    return await call(
        tasks.update_task_status,
        "PATCH",
        headers=account.headers,
        route={"task_id": task_id},
        json_body={"status": status},
    )


async def test_task_is_created_with_an_ordered_checklist(account):
    manager = await account("manager", "DE")

    task = await create_task(manager, checklist=["Wipe desks", "  Empty bins ", "Mop floor"])

    assert (task["checklist_done"], task["checklist_total"], task["review_blockers"]) == (0, 3, ["checklist"])
    assert [item["text"] for item in await checklist(manager, task["id"])] == ["Wipe desks", "Empty bins", "Mop floor"]


async def test_checklist_rejects_blank_items(account):
    manager = await account("manager", "DE")

    response = await call(
        tasks.create_task,
        "POST",
        headers=manager.headers,
        json_body={"title": "Clean", "country": "DE", "checklist": [" "]},
    )

    assert response.status_code == 400


async def test_assigned_cleaner_ticks_items_but_cannot_edit_the_list(account):
    manager = await account("manager", "DE")
    cleaner = await account("cleaner", "DE")
    task = await create_task(manager, assigned_to=str(cleaner.user.id), checklist=["Wipe desks"])
    item = (await checklist(manager, task["id"]))[0]

    ticked = await tick(cleaner, task["id"], item["id"])
    renamed = await call(
        checklists.update_checklist_item,
        "PATCH",
        headers=cleaner.headers,
        route={"task_id": task["id"], "item_id": item["id"]},
        json_body={"text": "Skip it"},
    )
    added = await call(
        checklists.add_checklist_item,
        "POST",
        headers=cleaner.headers,
        route={"task_id": task["id"]},
        json_body={"text": "x"},
    )

    assert ticked.status_code == 200
    assert payload(ticked)["done"] is True
    assert payload(ticked)["done_by"] == str(cleaner.user.id)
    assert (renamed.status_code, added.status_code) == (403, 403)


async def test_other_cleaners_cannot_see_or_tick_the_checklist(account):
    manager = await account("manager", "DE")
    owner = await account("cleaner", "DE")
    stranger = await account("cleaner", "DE")
    task = await create_task(manager, assigned_to=str(owner.user.id), checklist=["Wipe desks"])
    item = (await checklist(manager, task["id"]))[0]

    seen = await call(checklists.get_checklist, headers=stranger.headers, route={"task_id": task["id"]})
    ticked = await tick(stranger, task["id"], item["id"])

    assert (seen.status_code, ticked.status_code) == (404, 404)


async def test_review_requires_a_finished_checklist(account):
    manager = await account("manager", "DE")
    cleaner = await account("cleaner", "DE")
    task = await create_task(manager, assigned_to=str(cleaner.user.id), checklist=["Wipe desks", "Empty bins"])
    first, second = await checklist(manager, task["id"])
    await set_status(cleaner, task["id"], "in_progress")
    await tick(cleaner, task["id"], first["id"])

    blocked = await set_status(cleaner, task["id"], "on_review")
    await tick(cleaner, task["id"], second["id"])
    allowed = await set_status(cleaner, task["id"], "on_review")

    assert blocked.status_code == 409
    assert payload(blocked)["error"] == "Before sending for review, finish the checklist (1 of 2 done)"
    assert allowed.status_code == 200
    assert payload(allowed)["status"] == "on_review"


async def test_review_requires_a_photo_when_the_task_asks_for_one(account):
    manager = await account("manager", "DE")
    cleaner = await account("cleaner", "DE")
    task = await create_task(manager, assigned_to=str(cleaner.user.id), photo_required=True)
    await set_status(cleaner, task["id"], "in_progress")

    blocked = await set_status(cleaner, task["id"], "on_review")
    async with session_scope() as session, session.begin():
        session.add(TaskPhoto(task_id=uuid.UUID(task["id"]), url="https://blob/x.jpg", filename="after.jpg"))
    allowed = await set_status(cleaner, task["id"], "on_review")

    assert payload(blocked)["error"] == "Before sending for review, upload a photo of the result"
    assert allowed.status_code == 200


async def test_offline_sync_cannot_skip_the_review_requirements(account):
    manager = await account("manager", "DE")
    cleaner = await account("cleaner", "DE")
    task = await create_task(manager, assigned_to=str(cleaner.user.id), photo_required=True)
    await set_status(cleaner, task["id"], "in_progress")

    response = await call(
        sync.batch_sync,
        "POST",
        headers=cleaner.headers,
        json_body={"changes": [{"type": "status_change", "task_id": task["id"], "status": "on_review"}]},
    )

    assert payload(response)["synced"] == 0
    assert "upload a photo" in payload(response)["errors"][0]["error"]
    async with session_scope() as session:
        assert (await session.get_one(Task, uuid.UUID(task["id"]))).status == "in_progress"


async def test_completed_tasks_lock_their_checklist(account, task_factory):
    manager = await account("manager", "DE")
    done_task = await task_factory(status="completed")
    async with session_scope() as session, session.begin():
        item = TaskChecklistItem(task_id=done_task.id, position=0, text="Wipe desks")
        session.add(item)

    ticked = await tick(manager, str(done_task.id), str(item.id))
    added = await call(
        checklists.add_checklist_item,
        "POST",
        headers=manager.headers,
        route={"task_id": str(done_task.id)},
        json_body={"text": "More"},
    )

    assert (ticked.status_code, added.status_code) == (403, 409)


async def test_manager_adds_and_removes_items_and_lists_show_progress(account):
    manager = await account("manager", "DE")
    task = await create_task(manager)

    added = await call(
        checklists.add_checklist_item,
        "POST",
        headers=manager.headers,
        route={"task_id": task["id"]},
        json_body={"text": "Restock soap"},
    )
    listed = await call(tasks.get_tasks, headers=manager.headers)
    removed = await call(
        checklists.delete_checklist_item,
        "DELETE",
        headers=manager.headers,
        route={"task_id": task["id"], "item_id": payload(added)["id"]},
    )

    assert added.status_code == 201
    assert payload(listed)["data"][0]["checklist_total"] == 1
    assert removed.status_code == 204
    async with session_scope() as session:
        assert (await session.scalars(select(TaskChecklistItem))).all() == []


async def test_items_of_another_task_are_not_reachable(account):
    manager = await account("manager", "DE")
    first = await create_task(manager, checklist=["Wipe desks"])
    second = await create_task(manager)
    item = (await checklist(manager, first["id"]))[0]

    response = await tick(manager, second["id"], item["id"])

    assert response.status_code == 404
