import pytest
from httpx import AsyncClient

BASE_URL = "http://localhost:7071"


@pytest.mark.asyncio
async def test_create_task_as_admin(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Test Task", "country": "DE"}
        )
    assert response.status_code == 201
    data = response.json()
    assert data["title"] == "Test Task"
    assert data["country"] == "DE"
    assert data["status"] == "pending"
    assert data["priority"] == "normal"


@pytest.mark.asyncio
async def test_create_task_as_manager(manager_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"title": "Manager Task", "country": "DE"}
        )
    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_task_as_cleaner(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"title": "Test Task", "country": "DE"}
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_task_without_token():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            json={"title": "Test Task", "country": "DE"}
        )
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_create_task_invalid_country(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Test Task", "country": "USA"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_task_short_title(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Hi", "country": "DE"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_task_with_priority(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Urgent Task", "country": "DE", "priority": "urgent"}
        )
    assert response.status_code == 201
    assert response.json()["priority"] == "urgent"


@pytest.mark.asyncio
async def test_create_recurring_task(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Recurring Task", "country": "DE", "rrule": "FREQ=DAILY"}
        )
    assert response.status_code == 201
    data = response.json()
    assert data["is_recurring"] is True
    assert data["rrule"] == "FREQ=DAILY"


@pytest.mark.asyncio
async def test_get_tasks_as_admin(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    data = response.json()
    assert "data" in data
    assert "pagination" in data


@pytest.mark.asyncio
async def test_get_tasks_pagination(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/tasks?page=1&limit=5",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data["data"]) <= 5
    assert data["pagination"]["limit"] == 5


@pytest.mark.asyncio
async def test_get_tasks_filter_by_status(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/tasks?status=pending",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    for task in response.json()["data"]:
        assert task["status"] == "pending"


@pytest.mark.asyncio
async def test_get_tasks_filter_by_priority(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/tasks?priority=urgent",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    for task in response.json()["data"]:
        assert task["priority"] == "urgent"


@pytest.mark.asyncio
async def test_get_tasks_cleaner_sees_only_own(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        me = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {cleaner_token}"}
        )
        cleaner_id = me.json()["sub"]

        response = await client.get(
            "/api/tasks",
            headers={"Authorization": f"Bearer {cleaner_token}"}
        )
    assert response.status_code == 200
    for task in response.json()["data"]:
        assert task["assigned_to"] == cleaner_id


@pytest.mark.asyncio
async def test_get_task_by_id(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Get By ID Task", "country": "DK"}
        )
        task_id = create.json()["id"]

        response = await client.get(
            f"/api/tasks/{task_id}",
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


@pytest.mark.asyncio
async def test_update_task_status(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Status Test Task", "country": "DE"}
        )
        task_id = create.json()["id"]

        response = await client.patch(
            f"/api/tasks/{task_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "in_progress"}
        )
    assert response.status_code == 200
    assert response.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_update_task_invalid_status(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Invalid Status Task", "country": "DE"}
        )
        task_id = create.json()["id"]

        response = await client.patch(
            f"/api/tasks/{task_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "flying"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_task_status_history(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "History Task", "country": "DE"}
        )
        task_id = create.json()["id"]

        await client.patch(
            f"/api/tasks/{task_id}/status",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"status": "in_progress"}
        )

        response = await client.get(
            f"/api/tasks/{task_id}/history",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    history = response.json()
    assert len(history) >= 1
    statuses = [h["new_status"] for h in history]
    assert "in_progress" in statuses


@pytest.mark.asyncio
async def test_add_comment(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Comment Task", "country": "DE"}
        )
        task_id = create.json()["id"]

        response = await client.post(
            f"/api/tasks/{task_id}/comments",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"text": "Test comment"}
        )
    assert response.status_code == 201
    assert response.json()["text"] == "Test comment"


@pytest.mark.asyncio
async def test_get_task_occurrences(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        create = await client.post(
            "/api/tasks",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"title": "Recurring Task", "country": "DE", "rrule": "FREQ=WEEKLY;BYDAY=MO"}
        )
        task_id = create.json()["id"]

        response = await client.get(
            f"/api/tasks/{task_id}/occurrences",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    data = response.json()
    assert "next_occurrences" in data
    assert len(data["next_occurrences"]) > 0
