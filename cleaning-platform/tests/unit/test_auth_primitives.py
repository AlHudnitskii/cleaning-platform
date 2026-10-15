import uuid
from datetime import UTC, datetime, timedelta

import azure.functions as func
import jwt
import pytest

from src.api.http import ApiError, cookie_header, query_int, read_cookie
from src.domain.models.task import SyncStatusChange
from src.infrastructure.auth.jwt_handler import (
    ExpiredTokenError,
    InvalidTokenError,
    create_access_token,
    create_refresh_token,
    decode_access_token,
    decode_refresh_token,
)
from src.infrastructure.auth.middleware import AuthError, bearer_token
from src.settings import get_settings


def test_access_token_round_trip() -> None:
    user_id = uuid.uuid4()
    claims = decode_access_token(create_access_token(user_id, 3))
    assert claims.user_id == user_id
    assert claims.version == 3


def test_refresh_token_is_not_accepted_as_access_token() -> None:
    with pytest.raises(InvalidTokenError):
        decode_access_token(create_refresh_token(uuid.uuid4(), 0))


def test_access_token_is_not_accepted_as_refresh_token() -> None:
    with pytest.raises(InvalidTokenError):
        decode_refresh_token(create_access_token(uuid.uuid4(), 0))


def test_token_signed_with_other_secret_is_rejected() -> None:
    forged = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "ver": 0, "exp": datetime.now(UTC) + timedelta(minutes=5)},
        "your-secret-key-change-in-production",
        algorithm="HS256",
    )
    with pytest.raises(InvalidTokenError):
        decode_access_token(forged)


def test_expired_token_is_reported_as_expired() -> None:
    expired = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "access", "ver": 0, "exp": datetime.now(UTC) - timedelta(seconds=1)},
        get_settings().jwt_secret,
        algorithm="HS256",
    )
    with pytest.raises(ExpiredTokenError):
        decode_access_token(expired)


@pytest.mark.parametrize("header", [None, "", "Basic abc", "Bearer", "Bearer   "])
def test_bearer_token_rejects_malformed_headers(header: str | None) -> None:
    with pytest.raises(AuthError):
        bearer_token(header)


def test_bearer_token_extracts_token() -> None:
    assert bearer_token("Bearer abc.def") == "abc.def"


def request(params: dict[str, str] | None = None, headers: dict[str, str] | None = None) -> func.HttpRequest:
    return func.HttpRequest(method="GET", url="/api/x", params=params or {}, headers=headers or {}, body=b"")


@pytest.mark.parametrize("raw", ["0", "101", "abc", "-1"])
def test_query_int_rejects_out_of_range(raw: str) -> None:
    with pytest.raises(ApiError) as e:
        query_int(request({"limit": raw}), "limit", 10, 1, 100)
    assert e.value.status_code == 400


def test_query_int_uses_default_when_absent() -> None:
    assert query_int(request(), "limit", 10, 1, 100) == 10


def test_cookie_header_is_http_only_and_strict() -> None:
    header = cookie_header("refresh_token", "abc", 60, "/api/auth", secure=True)
    assert "HttpOnly" in header
    assert "SameSite=Strict" in header
    assert "Secure" in header
    assert "Path=/api/auth" in header


def test_read_cookie() -> None:
    req = request(headers={"Cookie": "a=1; refresh_token=xyz"})
    assert read_cookie(req, "refresh_token") == "xyz"
    assert read_cookie(request(), "refresh_token") is None


def test_sync_change_without_timezone_is_treated_as_utc() -> None:
    change = SyncStatusChange.model_validate(
        {
            "type": "status_change",
            "task_id": str(uuid.uuid4()),
            "status": "in_progress",
            "timestamp": "2026-01-01T10:00:00",
        }
    )
    assert change.timestamp == datetime(2026, 1, 1, 10, tzinfo=UTC)
