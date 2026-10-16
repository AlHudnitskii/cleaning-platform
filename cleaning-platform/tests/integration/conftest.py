import json
import os
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, cast

import azure.functions as func
import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text

from src.infrastructure.auth.jwt_handler import create_access_token, hash_password
from src.infrastructure.database.connection import get_engine, get_sessionmaker, session_scope
from src.infrastructure.database.models import Location, Task, User
from src.settings import get_settings

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
BACKEND_ROOT = Path(__file__).resolve().parents[2]
TABLES = [
    "outbox_messages",
    "task_comments",
    "task_status_history",
    "task_photos",
    "push_subscriptions",
    "tasks",
    "locations",
    "users",
]


def reset_caches() -> None:
    get_settings.cache_clear()
    get_engine.cache_clear()
    get_sessionmaker.cache_clear()


@pytest.fixture(scope="session")
def migrated_database() -> Iterator[None]:
    if not TEST_DATABASE_URL:
        pytest.skip("TEST_DATABASE_URL is not set")
    previous = os.environ.get("DATABASE_URL")
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL
    reset_caches()
    command.upgrade(Config(str(BACKEND_ROOT / "alembic.ini")), "head")
    yield
    if previous is not None:
        os.environ["DATABASE_URL"] = previous
    reset_caches()


@pytest.fixture(autouse=True)
async def clean_database(migrated_database: None) -> AsyncIterator[None]:
    reset_caches()
    async with session_scope() as session, session.begin():
        await session.execute(text(f"TRUNCATE {', '.join(TABLES)} CASCADE"))
    yield
    await get_engine().dispose()
    reset_caches()


@dataclass
class Account:
    user: User
    token: str

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}


async def create_account(
    role: str, country: str | None = "DE", password: str = "secret123", email: str | None = None
) -> Account:
    async with session_scope() as session, session.begin():
        user = User(
            email=email or f"{role}-{uuid.uuid4().hex[:8]}@example.com",
            hashed_password=hash_password(password),
            role=role,
            country=country,
        )
        session.add(user)
    return Account(user=user, token=create_access_token(user.id, user.token_version))


async def create_task(country: str = "DE", **fields: Any) -> Task:
    async with session_scope() as session, session.begin():
        task = Task(title=fields.pop("title", "Clean lobby"), country=country, **fields)
        session.add(task)
    return task


async def create_location(name: str, country: str, level: str, parent: Location | None = None) -> Location:
    location_id = uuid.uuid4()
    path = f"{parent.path}.{location_id.hex}" if parent else location_id.hex
    async with session_scope() as session, session.begin():
        location = Location(
            id=location_id, name=name, country=country, level=level, parent_id=parent.id if parent else None, path=path
        )
        session.add(location)
    return location


@pytest.fixture
def account() -> Callable[..., Awaitable[Account]]:
    return create_account


@pytest.fixture
def task_factory() -> Callable[..., Awaitable[Task]]:
    return create_task


@pytest.fixture
def location_factory() -> Callable[..., Awaitable[Location]]:
    return create_location


def handler_of(builder: Any) -> Callable[[func.HttpRequest], Awaitable[func.HttpResponse]]:
    return cast(Callable[[func.HttpRequest], Awaitable[func.HttpResponse]], builder._function.get_user_function())


async def call(
    builder: Any,
    method: str = "GET",
    *,
    headers: dict[str, str] | None = None,
    params: dict[str, str] | None = None,
    route: dict[str, str] | None = None,
    json_body: Any = None,
    body: bytes = b"",
) -> func.HttpResponse:
    request_headers = dict(headers or {})
    if json_body is not None:
        body = json.dumps(json_body).encode()
        request_headers.setdefault("Content-Type", "application/json")
    request = func.HttpRequest(
        method=method,
        url="http://localhost/api/test",
        headers=request_headers,
        params=params or {},
        route_params=route or {},
        body=body,
    )
    return await handler_of(builder)(request)


def payload(response: func.HttpResponse) -> Any:
    return json.loads(response.get_body())


def multipart(field: str, filename: str, data: bytes, content_type: str) -> tuple[bytes, dict[str, str]]:
    boundary = "integrationboundary"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="{field}"; filename="{filename}"\r\n'
        f"Content-Type: {content_type}\r\n\r\n"
    ).encode()
    return head + data + f"\r\n--{boundary}--\r\n".encode(), {
        "Content-Type": f"multipart/form-data; boundary={boundary}"
    }


def utc(year: int, month: int, day: int, hour: int = 0) -> datetime:
    return datetime(year, month, day, hour, tzinfo=UTC)
