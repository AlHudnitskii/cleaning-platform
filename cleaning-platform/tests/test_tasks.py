import pytest
from httpx import AsyncClient

BASE_URL = "http://localhost:7071"


@pytest.mark.asyncio
async def test_create_task_as_admin(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "title": "Test Task",
                "country": "DE"
            }
        )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Task"
    assert data["country"] == "DE"
    assert data["status"] == "pending"


@pytest.mark.asyncio
async def test_create_task_as_cleaner(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={
                "title": "Test Task",
                "country": "DE"
            }
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_task_without_token():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/tasks", json={
            "title": "Test Task",
            "country": "DE"
        })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_task_invalid_country(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "title": "Test Task",
                "country": "USA"
            }
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_task_short_title(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "title": "Hi",
                "country": "DE"
            }
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_tasks_as_admin(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_tasks_as_cleaner_sees_only_own(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/api/tasks",
            headers={"Authorization": f"Bearer {cleaner_token}"}
        )
        assert response.status_code == 200
        tasks = response.json()

        cleaner_data = await client.get("/api/auth/me",
            headers={"Authorization": f"Bearer {cleaner_token}"}
        )
        cleaner_id = cleaner_data.json()["sub"]

    for task in tasks:
        assert task["assigned_to"] == cleaner_id


@pytest.mark.asyncio
async def test_update_task_status(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create_resp = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Status Test Task", "country": "DE"}
        )
        task_id = create_resp.json()["id"]

    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.patch(f"/api/tasks/{task_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "in_progress"}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_update_task_invalid_status(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create_resp = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Invalid Status Task", "country": "DE"}
        )
        task_id = create_resp.json()["id"]

        response = await client.patch(f"/api/tasks/{task_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "unknown_status"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_get_task_by_id(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create_resp = await client.post("/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Get By ID Task", "country": "DK"}
        )
        task_id = create_resp.json()["id"]

        response = await client.get(f"/api/tasks/{task_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    assert response.json()["id"] == task_id


@pytest.mark.asyncio
async def test_get_nonexistent_task(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/tasks/00000000-0000-0000-0000-000000000000",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 404
