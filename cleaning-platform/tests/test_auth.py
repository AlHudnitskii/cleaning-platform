import pytest
from httpx import AsyncClient

BASE_URL = "http://localhost:7071"


@pytest.mark.asyncio
async def test_login_success(admin_token):
    assert admin_token is not None
    assert len(admin_token) > 10


@pytest.mark.asyncio
async def test_login_wrong_password():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/auth/login", json={
            "email": "admin@cleaning.com",
            "password": "wrongpassword"
        })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_unknown_email():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/auth/login", json={
            "email": "nobody@cleaning.com",
            "password": "password123"
        })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_login_invalid_json():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post(
            "/api/auth/login",
            content="not json",
            headers={"Content-Type": "application/json"}
        )
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_register_and_login():
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@cleaning.com"
    async with AsyncClient(base_url=BASE_URL) as client:
        reg = await client.post("/api/auth/register", json={
            "email": email,
            "password": "testpass123",
            "role": "cleaner",
            "country": "DE"
        })
        assert reg.status_code == 201
        data = reg.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == email

        login = await client.post("/api/auth/login", json={
            "email": email,
            "password": "testpass123"
        })
        assert login.status_code == 200


@pytest.mark.asyncio
async def test_register_duplicate_email():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/auth/register", json={
            "email": "admin@cleaning.com",
            "password": "password123",
            "role": "admin"
        })
    assert response.status_code == 409


@pytest.mark.asyncio
async def test_register_short_password():
    import uuid
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/auth/register", json={
            "email": f"test_{uuid.uuid4().hex[:8]}@cleaning.com",
            "password": "123",
            "role": "cleaner",
            "country": "DE"
        })
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_register_manager_without_country():
    import uuid
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/auth/register", json={
            "email": f"test_{uuid.uuid4().hex[:8]}@cleaning.com",
            "password": "password123",
            "role": "manager"
        })
    assert response.status_code == 400


@pytest.mark.asyncio
async def test_refresh_token(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        login = await client.post("/api/auth/login", json={
            "email": "admin@cleaning.com",
            "password": "admin123"
        })
        refresh_token = login.json()["refresh_token"]

        response = await client.post("/api/auth/refresh", json={
            "refresh_token": refresh_token
        })
    assert response.status_code == 200
    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data


@pytest.mark.asyncio
async def test_refresh_invalid_token():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.post("/api/auth/refresh", json={
            "refresh_token": "invalid.token.here"
        })
    assert response.status_code == 401


@pytest.mark.asyncio
async def test_me_endpoint(admin_token):
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get(
            "/api/auth/me",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
    assert response.status_code == 200
    data = response.json()
    assert "email" in data
    assert "role" in data


@pytest.mark.asyncio
async def test_me_without_token():
    async with AsyncClient(base_url=BASE_URL) as client:
        response = await client.get("/api/auth/me")
    assert response.status_code == 401
