import uuid

from src.domain.models.enums import TaskStatus
from src.infrastructure.database.models import Task
from src.infrastructure.messaging.events import TaskEvent, TaskEventType


def make_task(**fields: object) -> Task:
    return Task(
        id=uuid.uuid4(),
        title="Clean lobby",
        country="DE",
        status=TaskStatus.ON_REVIEW,
        assigned_to=uuid.uuid4(),
        **fields,
    )


def test_an_event_survives_the_trip_through_the_outbox_and_the_queue():
    task = make_task()
    author, previous = uuid.uuid4(), uuid.uuid4()
    event = TaskEvent.of(
        TaskEventType.STATUS_CHANGED, task, author, previous_assigned_to=previous, old_status=TaskStatus.IN_PROGRESS
    )

    received = TaskEvent.from_message({"type": event.type.value, **event.payload()})

    assert received == event
    assert received.new_status == TaskStatus.ON_REVIEW


def test_events_written_by_the_previous_version_are_still_read():
    task_id, assignee = uuid.uuid4(), uuid.uuid4()
    legacy = {
        "type": "task_status_changed",
        "task_id": str(task_id),
        "title": "Clean lobby",
        "country": "DE",
        "assigned_to": str(assignee),
        "old_status": "pending",
        "new_status": "in_progress",
        "changed_by": None,
        "changed_by_email": "manager@example.com",
        "location_id": None,
    }

    event = TaskEvent.from_message(legacy)

    assert event is not None
    assert (event.task_id, event.assigned_to, event.new_status) == (task_id, assignee, TaskStatus.IN_PROGRESS)


def test_the_payload_keeps_the_keys_the_browser_reads():
    payload = TaskEvent.of(TaskEventType.CREATED, make_task(), uuid.uuid4()).payload()

    assert {"task_id", "title", "country", "assigned_to", "changed_by"} <= payload.keys()
