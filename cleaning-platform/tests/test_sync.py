import pytest
from httpx import AsyncClient

BASE_URL = "http://localhost:7071"


@pytest.mark.asyncio
async def test_batch_sync_empty(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/sync/batch",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"changes": []}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["synced"] == 0
    assert data["errors"] == []


@pytest.mark.asyncio
async def test_batch_sync_status_change(admin_token, cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        me = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {cleaner_token}"}
        )
        cleaner_id = me.json()["sub"]

        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Sync Test Task", "country": "DE", "assigned_to": cleaner_id}
        )
        task_id = create.json()["id"]

        response = await client.post(
            "/api/sync/batch",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"changes": [
                {"type": "status_change", "task_id": task_id, "status": "in_progress"}
            ]}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["synced"] == 1
    assert data["errors"] == []


@pytest.mark.asyncio
async def test_batch_sync_invalid_task(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/sync/batch",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"changes": [
                {
                    "type": "status_change",
                    "task_id": "00000000-0000-0000-0000-000000000000",
                    "status": "in_progress"
                }
            ]}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["synced"] == 0
    assert len(data["errors"]) > 0


@pytest.mark.asyncio
async def test_batch_sync_access_denied(admin_token, cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Not Assigned Task", "country": "DE"}
        )
        task_id = create.json()["id"]

        response = await client.post(
            "/api/sync/batch",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"changes": [
                {"type": "status_change", "task_id": task_id, "status": "completed"}
            ]}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["synced"] == 0
    assert len(data["errors"]) > 0


@pytest.mark.asyncio
async def test_batch_sync_multiple_changes(admin_token, cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        me = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {cleaner_token}"}
        )
        cleaner_id = me.json()["sub"]

        task1 = (await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Sync Task 1", "country": "DE", "assigned_to": cleaner_id}
        )).json()["id"]

        task2 = (await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Sync Task 2", "country": "DE", "assigned_to": cleaner_id}
        )).json()["id"]

        response = await client.post(
            "/api/sync/batch",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"changes": [
                {"type": "status_change", "task_id": task1, "status": "in_progress"},
                {"type": "status_change", "task_id": task2, "status": "completed"},
            ]}
        )
    assert response.status_code == 200
    data = response.json()
    assert data["synced"] == 2
    assert data["errors"] == []


@pytest.mark.asyncio
async def test_batch_sync_without_auth():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/sync/batch",
            json={"changes": []}
        )
    assert response.status_code == 401
