import uuid
from datetime import UTC, datetime, timedelta

import jwt
import pytest

from src.infrastructure.auth.jwt_handler import (
    ExpiredTokenError,
    InvalidTokenError,
    create_access_token,
    create_stream_ticket,
    decode_access_token,
    decode_stream_ticket,
)
from src.settings import get_settings
from sse_server import TICKET_MEMORY_SECONDS, claim_ticket, used_tickets


@pytest.fixture(autouse=True)
def forget_tickets():
    used_tickets.clear()
    yield
    used_tickets.clear()


def test_a_ticket_identifies_the_user_and_session_version():
    user_id = uuid.uuid4()

    claims = decode_stream_ticket(create_stream_ticket(user_id, 3))

    assert (claims.user_id, claims.version) == (user_id, 3)
    assert claims.token_id


def test_an_access_token_cannot_open_the_stream_and_a_ticket_cannot_call_the_api():
    user_id = uuid.uuid4()

    with pytest.raises(InvalidTokenError):
        decode_stream_ticket(create_access_token(user_id, 0))
    with pytest.raises(InvalidTokenError):
        decode_access_token(create_stream_ticket(user_id, 0))


def test_a_ticket_expires_within_seconds():
    stale = jwt.encode(
        {"sub": str(uuid.uuid4()), "type": "stream_ticket", "ver": 0, "exp": datetime.now(UTC) - timedelta(seconds=1)},
        get_settings().jwt_secret,
        algorithm="HS256",
    )

    with pytest.raises(ExpiredTokenError):
        decode_stream_ticket(stale)


def test_a_ticket_opens_the_stream_only_once():
    assert claim_ticket("ticket-1", now=100.0)
    assert not claim_ticket("ticket-1", now=101.0)
    assert claim_ticket("ticket-2", now=101.0)


def test_used_tickets_are_forgotten_long_after_they_expire():
    claim_ticket("ticket-1", now=0.0)

    claim_ticket("ticket-2", now=TICKET_MEMORY_SECONDS + 1)

    assert "ticket-1" not in used_tickets


def test_a_ticket_without_an_id_is_refused():
    assert not claim_ticket("", now=0.0)
