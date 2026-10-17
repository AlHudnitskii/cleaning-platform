import azure.functions as func
import pytest
from sqlalchemy import select

from src.api import auth, events, tasks, users
from src.domain.models.enums import NotificationTopic
from src.infrastructure.auth.jwt_handler import decode_stream_ticket
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import PushSubscription, User
from src.infrastructure.messaging import consumer
from src.infrastructure.push.notifications import PushMessage, PushResult
from src.translations import phrases
from tests.integration.conftest import call, payload

pytestmark = pytest.mark.integration

PASSWORD = "secret123"


def refresh_cookie(response: func.HttpResponse) -> str:
    header = str(response.headers.get("Set-Cookie", ""))
    assert "HttpOnly" in header
    name_value = header.split(";", 1)[0]
    assert name_value.startswith("refresh_token=")
    return name_value


async def login(email: str, password: str = PASSWORD):
    return await call(auth.login, "POST", json_body={"email": email, "password": password})


async def test_login_sets_refresh_cookie_and_hides_token_from_body(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await login(cleaner.user.email)

    assert response.status_code == 200
    body = payload(response)
    assert "refresh_token" not in body
    assert body["user"]["email"] == cleaner.user.email
    refresh_cookie(response)


async def test_login_with_wrong_password_is_rejected(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await login(cleaner.user.email, "wrong-password")

    assert response.status_code == 401


async def test_refresh_uses_cookie_and_rotates(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    cookie = refresh_cookie(await login(cleaner.user.email))

    response = await call(auth.refresh, "POST", headers={"Cookie": cookie})

    assert response.status_code == 200
    assert payload(response)["access_token"]
    refresh_cookie(response)


async def test_refresh_without_cookie_is_rejected():
    response = await call(auth.refresh, "POST")

    assert response.status_code == 401


async def test_logout_revokes_refresh_and_access_tokens(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    logged_in = await login(cleaner.user.email)
    cookie = refresh_cookie(logged_in)
    access = {"Authorization": f"Bearer {payload(logged_in)['access_token']}"}

    logout = await call(auth.logout, "POST", headers={"Cookie": cookie})

    assert logout.status_code == 204
    assert "Max-Age=0" in logout.headers.get("Set-Cookie", "")
    assert (await call(auth.refresh, "POST", headers={"Cookie": cookie})).status_code == 401
    assert (await call(auth.me, headers=access)).status_code == 401


async def test_deactivated_user_loses_access_immediately(account):
    admin = await account("admin", None)
    cleaner = await account("cleaner", "DE")
    assert (await call(tasks.get_tasks, headers=cleaner.headers)).status_code == 200

    toggled = await call(users.toggle_active, "PATCH", headers=admin.headers, route={"user_id": str(cleaner.user.id)})

    assert toggled.status_code == 200
    assert payload(toggled)["is_active"] is False
    assert (await call(tasks.get_tasks, headers=cleaner.headers)).status_code == 401


async def test_password_change_revokes_previous_tokens(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await call(
        users.change_password,
        "PATCH",
        headers=cleaner.headers,
        json_body={"old_password": PASSWORD, "new_password": "new-secret-456"},
    )

    assert response.status_code == 200
    new_access = {"Authorization": f"Bearer {payload(response)['access_token']}"}
    assert (await call(auth.me, headers=cleaner.headers)).status_code == 401
    assert (await call(auth.me, headers=new_access)).status_code == 200
    assert (await login(cleaner.user.email, "new-secret-456")).status_code == 200


async def test_cleaner_cannot_list_users(account):
    cleaner = await account("cleaner", "DE")

    response = await call(users.get_users, headers=cleaner.headers)

    assert response.status_code == 403


async def push_subscription_count(user_id) -> int:
    async with session_scope() as session:
        return len((await session.scalars(select(PushSubscription).where(PushSubscription.user_id == user_id))).all())


async def subscribe_device(user_id, endpoint: str = "https://push.example/device-1") -> None:
    async with session_scope() as session, session.begin():
        session.add(PushSubscription(user_id=user_id, endpoint=endpoint, p256dh="key", auth="auth"))


async def test_logout_removes_push_subscriptions(account):
    cleaner = await account("cleaner", "DE", PASSWORD)
    await subscribe_device(cleaner.user.id)
    cookie = refresh_cookie(await login(cleaner.user.email))

    response = await call(auth.logout, "POST", headers={"Cookie": cookie})

    assert response.status_code == 204
    assert await push_subscription_count(cleaner.user.id) == 0


async def test_deactivation_removes_push_subscriptions(account):
    admin = await account("admin", None)
    cleaner = await account("cleaner", "DE")
    await subscribe_device(cleaner.user.id)

    response = await call(users.toggle_active, "PATCH", headers=admin.headers, route={"user_id": str(cleaner.user.id)})

    assert payload(response)["is_active"] is False
    assert await push_subscription_count(cleaner.user.id) == 0


async def test_push_is_not_sent_to_inactive_users(account, monkeypatch):
    cleaner = await account("cleaner", "DE")
    await subscribe_device(cleaner.user.id)
    async with session_scope() as session, session.begin():
        stored = await session.get(User, cleaner.user.id)
        assert stored is not None
        stored.is_active = False
    sent: list[str] = []

    async def fake_send(endpoint, *args):
        sent.append(endpoint)
        return PushResult.SENT

    monkeypatch.setattr(consumer, "send_push_notification", fake_send)

    message = PushMessage(phrases.PUSH_ASSIGNED_TITLE(), phrases.TASK())
    await consumer.notify_user(cleaner.user.id, message, NotificationTopic.ASSIGNED)

    assert sent == []


async def test_the_event_stream_ticket_belongs_to_the_caller(account):
    cleaner = await account("cleaner", "DE", PASSWORD)

    response = await call(events.stream_ticket, "POST", headers=cleaner.headers)

    assert response.status_code == 201
    body = payload(response)
    assert body["expires_in"] == 30
    assert decode_stream_ticket(body["ticket"]).user_id == cleaner.user.id
