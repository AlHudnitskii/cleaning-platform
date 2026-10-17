from typing import Any

import pytest

from src.api import profile
from src.domain.models.enums import NotificationTopic
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import PushSubscription
from src.infrastructure.messaging import consumer
from src.infrastructure.push.notifications import PushMessage, PushResult
from src.translations import phrases
from tests.integration.conftest import Account, call, payload

pytestmark = pytest.mark.integration

ALL_ON = {"assigned": True, "task_created": True, "status_changed": True, "due_soon": True, "overdue": True}


async def settings(account: Account) -> dict[str, Any]:
    body: dict[str, Any] = payload(await call(profile.get_notification_settings, headers=account.headers))
    return body


async def change(account: Account, body: dict[str, Any]):
    return await call(profile.update_notification_settings, "PATCH", headers=account.headers, json_body=body)


async def test_every_topic_is_on_until_the_user_turns_it_off(account):
    cleaner = await account("cleaner", "DE")

    assert await settings(cleaner) == ALL_ON


async def test_a_user_turns_topics_off_and_on_again(account):
    cleaner = await account("cleaner", "DE")

    off = payload(await change(cleaner, {"due_soon": False, "status_changed": False}))
    again = payload(await change(cleaner, {"due_soon": False}))
    on = payload(await change(cleaner, {"due_soon": True}))

    assert off == again == {**ALL_ON, "due_soon": False, "status_changed": False}
    assert on == {**ALL_ON, "status_changed": False}
    assert await settings(cleaner) == on


@pytest.mark.parametrize("body", [{}, {"overdue": None}, {"overdue": "maybe"}])
async def test_invalid_changes_are_rejected(account, body):
    cleaner = await account("cleaner", "DE")

    assert (await change(cleaner, body)).status_code == 400


async def test_settings_belong_to_their_owner(account):
    first, second = await account("cleaner", "DE"), await account("cleaner", "DE")

    await change(first, {"assigned": False})

    assert await settings(second) == ALL_ON


async def test_a_muted_topic_never_reaches_the_device(account, monkeypatch):
    cleaner = await account("cleaner", "DE")
    async with session_scope() as session, session.begin():
        session.add(PushSubscription(user_id=cleaner.user.id, endpoint="https://push.example/1", p256dh="k", auth="a"))
    sent: list[str] = []

    async def fake_send(endpoint, p256dh, auth, payload):
        sent.append(payload)
        return PushResult.SENT

    monkeypatch.setattr(consumer, "send_push_notification", fake_send)
    await change(cleaner, {"due_soon": False})
    message = PushMessage(phrases.PUSH_DUE_SOON_TITLE(), phrases.TASK())

    await consumer.notify_user(cleaner.user.id, message, NotificationTopic.DUE_SOON)
    await consumer.notify_user(cleaner.user.id, message, NotificationTopic.OVERDUE)

    assert len(sent) == 1
