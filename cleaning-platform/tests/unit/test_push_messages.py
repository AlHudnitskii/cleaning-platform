import json
import uuid

from src.infrastructure.messaging import consumer
from src.infrastructure.push.notifications import PushMessage


def test_payload_carries_the_task_to_open():
    payload = json.loads(PushMessage("New task assigned", "Clean lobby", "3f0c").payload())

    assert payload == {"title": "New task assigned", "body": "Clean lobby", "task_id": "3f0c"}


async def test_every_notification_about_a_task_links_to_it(monkeypatch):
    task_id = uuid.uuid4()
    cleaner, manager = uuid.uuid4(), uuid.uuid4()
    sent: list[tuple[uuid.UUID, PushMessage]] = []

    async def fake_notify(user_id: uuid.UUID, message: PushMessage) -> None:
        sent.append((user_id, message))

    async def fake_managers(country: str) -> list[uuid.UUID]:
        return [manager]

    monkeypatch.setattr(consumer, "notify_user", fake_notify)
    monkeypatch.setattr(consumer, "active_managers", fake_managers)
    event = {"task_id": str(task_id), "title": "Clean lobby", "country": "DE", "assigned_to": str(cleaner)}

    await consumer.handle_task_created(event)
    await consumer.handle_task_status_changed({**event, "old_status": "pending", "new_status": "in_progress"})
    await consumer.handle_task_updated({**event, "previous_assigned_to": None})

    assert [user for user, _ in sent] == [cleaner, manager, cleaner, cleaner]
    assert {message.task_id for _, message in sent} == {str(task_id)}


async def test_a_malformed_task_id_is_dropped_instead_of_sent(monkeypatch):
    sent: list[PushMessage] = []

    async def fake_notify(user_id: uuid.UUID, message: PushMessage) -> None:
        sent.append(message)

    monkeypatch.setattr(consumer, "notify_user", fake_notify)

    await consumer.handle_task_updated({"task_id": "", "title": "Clean", "assigned_to": str(uuid.uuid4())})

    assert [message.task_id for message in sent] == [None]
