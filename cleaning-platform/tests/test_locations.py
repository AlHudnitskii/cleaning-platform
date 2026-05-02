import pytest
from httpx import AsyncClient

BASE_URL = "http://localhost:7071"


@pytest.mark.asyncio
async def test_create_location_as_admin(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Test Country", "country": "DE", "level": "country"}
        )
    assert response.status_code == 201
    data = response.json()
    assert data["name"] == "Test Country"
    assert data["level"] == "country"
    assert data["country"] == "DE"


@pytest.mark.asyncio
async def test_create_location_as_manager(manager_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {manager_token}"},
            json={"name": "Test City", "country": "DE", "level": "city"}
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_location_as_cleaner(cleaner_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {cleaner_token}"},
            json={"name": "Test Room", "country": "DE", "level": "room"}
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_create_location_short_name(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "X", "country": "DE", "level": "country"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_create_location_hierarchy(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        country = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Test Land", "country": "DE", "level": "country"}
        )
        assert country.status_code == 201
        country_id = country.json()["id"]

        city = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Test Stadt", "country": "DE", "level": "city", "parent_id": country_id}
        )
        assert city.status_code == 201
        city_data = city.json()
        assert country_id in city_data["path"] or "Test_Land" in city_data["path"]


@pytest.mark.asyncio
async def test_create_location_invalid_parent(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": "Orphan City",
                "country": "DE",
                "level": "city",
                "parent_id": "00000000-0000-0000-0000-000000000000"
            }
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_get_locations(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    assert isinstance(response.json(), list)


@pytest.mark.asyncio
async def test_get_location_children(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        country = await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Parent Country", "country": "NL", "level": "country"}
        )
        country_id = country.json()["id"]

        await client.post(
            "/api/locations",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": "Child City", "country": "NL", "level": "city", "parent_id": country_id}
        )

        response = await client.get(
            f"/api/locations/{country_id}/children",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    children = response.json()
    assert len(children) >= 1
    assert any(c["name"] == "Child City" for c in children)


@pytest.mark.asyncio
async def test_get_nonexistent_location_children(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/locations/00000000-0000-0000-0000-000000000000/children",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 404
