import json
import uuid

from src.infrastructure.messaging import consumer
from src.infrastructure.messaging.events import TaskEvent
from src.infrastructure.push.notifications import PushMessage
from src.translations import Locale, phrases


def task_event(event_type: str, **fields: object) -> TaskEvent:
    event = TaskEvent.from_message({"type": event_type, "task_id": str(uuid.uuid4()), **fields})
    assert event is not None
    return event


def test_payload_carries_the_task_to_open_in_the_device_language():
    message = PushMessage(phrases.PUSH_ASSIGNED_TITLE(), phrases.PUSH_ASSIGNED_BODY(title="Clean lobby"), "3f0c")

    english = json.loads(message.payload(Locale.EN))
    russian = json.loads(message.payload(Locale.RU))

    assert english == {"title": "New task assigned", "body": "You have been assigned: Clean lobby", "task_id": "3f0c"}
    assert russian == {"title": "Вам назначена задача", "body": "Новая задача: Clean lobby", "task_id": "3f0c"}


async def test_status_changes_name_the_statuses_instead_of_their_codes(monkeypatch):
    sent: list[PushMessage] = []

    async def fake_notify(user_id: uuid.UUID, message: PushMessage) -> None:
        sent.append(message)

    monkeypatch.setattr(consumer, "notify_user", fake_notify)
    event = task_event(
        "task_status_changed",
        title="Clean lobby",
        assigned_to=str(uuid.uuid4()),
        old_status="on_review",
        new_status="completed",
    )

    await consumer.handle_task_status_changed(event)

    assert [message.body.render(Locale.RU) for message in sent] == ["Clean lobby: На проверке → Выполнена"]
    assert [message.body.render(Locale.EN) for message in sent] == ["Clean lobby: On review → Completed"]


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
    fields = {"task_id": str(task_id), "title": "Clean lobby", "country": "DE", "assigned_to": str(cleaner)}

    await consumer.handle_task_created(task_event("task_created", **fields))
    await consumer.handle_task_status_changed(
        task_event("task_status_changed", **fields, old_status="pending", new_status="in_progress")
    )
    await consumer.handle_task_updated(task_event("task_updated", **fields, fields=["assigned_to"]))

    assert [user for user, _ in sent] == [cleaner, manager, cleaner, cleaner]
    assert {message.task_id for _, message in sent} == {str(task_id)}


def test_an_event_without_a_readable_task_or_type_is_dropped():
    assert TaskEvent.from_message({"type": "task_updated", "task_id": "", "assigned_to": str(uuid.uuid4())}) is None
    assert TaskEvent.from_message({"type": "unknown", "task_id": str(uuid.uuid4())}) is None


async def test_the_creator_is_not_notified_about_their_own_task(monkeypatch):
    manager, other = uuid.uuid4(), uuid.uuid4()
    sent: list[uuid.UUID] = []

    async def fake_notify(user_id: uuid.UUID, message: PushMessage) -> None:
        sent.append(user_id)

    async def fake_managers(country: str) -> list[uuid.UUID]:
        return [manager, other]

    monkeypatch.setattr(consumer, "notify_user", fake_notify)
    monkeypatch.setattr(consumer, "active_managers", fake_managers)

    await consumer.handle_task_created(task_event("task_created", country="DE", changed_by=str(manager)))

    assert sent == [other]


async def test_checklist_changes_do_not_look_like_a_new_assignment(monkeypatch):
    sent: list[uuid.UUID] = []

    async def fake_notify(user_id: uuid.UUID, message: PushMessage) -> None:
        sent.append(user_id)

    monkeypatch.setattr(consumer, "notify_user", fake_notify)

    await consumer.handle_task_updated(task_event("task_updated", assigned_to=str(uuid.uuid4()), fields=["checklist"]))

    assert sent == []
