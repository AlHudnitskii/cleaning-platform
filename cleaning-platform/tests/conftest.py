import pytest
import pytest_asyncio
import asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from src.infrastructure.database.connection import Base

TEST_DATABASE_URL = "postgresql+asyncpg://cleaning_user:cleaning_pass@127.0.0.1:5433/cleaning_db"

test_engine = create_async_engine(TEST_DATABASE_URL)
TestSessionLocal = sessionmaker(test_engine, class_=AsyncSession, expire_on_commit=False)


@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def admin_token():
    async with AsyncClient(base_url="http://localhost:7071") as client:
        response = await client.post("/api/auth/login", json={
            "email": "admin@cleaning.com",
            "password": "admin123"
        })
        return response.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def manager_token():
    async with AsyncClient(base_url="http://localhost:7071") as client:
        response = await client.post("/api/auth/login", json={
            "email": "manager.de@cleaning.com",
            "password": "manager123"
        })
        return response.json()["access_token"]


@pytest_asyncio.fixture(scope="session")
async def cleaner_token():
    async with AsyncClient(base_url="http://localhost:7071") as client:
        response = await client.post("/api/auth/login", json={
            "email": "cleaner1@cleaning.com",
            "password": "cleaner123"
        })
        return response.json()["access_token"]


@pytest.fixture
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
