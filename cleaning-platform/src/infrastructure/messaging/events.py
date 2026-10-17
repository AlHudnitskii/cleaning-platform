import uuid
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from src.domain.models.enums import TaskStatus
from src.infrastructure.database.models import Task


class TaskEventType(StrEnum):
    CREATED = "task_created"
    STATUS_CHANGED = "task_status_changed"
    UPDATED = "task_updated"
    DELETED = "task_deleted"


def _uuid(value: object) -> uuid.UUID | None:
    if not value:
        return None
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def _status(value: object) -> TaskStatus | None:
    try:
        return TaskStatus(str(value)) if value else None
    except ValueError:
        return None


def _text(value: uuid.UUID | None) -> str | None:
    return str(value) if value else None


@dataclass(frozen=True)
class TaskEvent:
    type: TaskEventType
    task_id: uuid.UUID
    title: str
    country: str
    assigned_to: uuid.UUID | None
    changed_by: uuid.UUID | None
    previous_assigned_to: uuid.UUID | None = None
    old_status: TaskStatus | None = None
    new_status: TaskStatus | None = None
    fields: tuple[str, ...] = ()

    @classmethod
    def of(
        cls,
        type: TaskEventType,
        task: Task,
        changed_by: uuid.UUID,
        previous_assigned_to: uuid.UUID | None = None,
        old_status: TaskStatus | None = None,
        fields: Iterable[str] = (),
    ) -> "TaskEvent":
        return cls(
            type=type,
            task_id=task.id,
            title=task.title,
            country=task.country,
            assigned_to=task.assigned_to,
            changed_by=changed_by,
            previous_assigned_to=previous_assigned_to,
            old_status=old_status,
            new_status=TaskStatus(task.status) if old_status else None,
            fields=tuple(sorted(fields)),
        )

    def payload(self) -> dict[str, Any]:
        data: dict[str, Any] = {
            "task_id": str(self.task_id),
            "title": self.title,
            "country": self.country,
            "assigned_to": _text(self.assigned_to),
            "changed_by": _text(self.changed_by),
        }
        if self.previous_assigned_to:
            data["previous_assigned_to"] = str(self.previous_assigned_to)
        if self.old_status and self.new_status:
            data["old_status"] = self.old_status.value
            data["new_status"] = self.new_status.value
        if self.fields:
            data["fields"] = list(self.fields)
        return data

    @classmethod
    def from_message(cls, data: Mapping[str, Any]) -> "TaskEvent | None":
        try:
            event_type = TaskEventType(str(data.get("type")))
        except ValueError:
            return None
        task_id = _uuid(data.get("task_id"))
        if task_id is None:
            return None
        fields = data.get("fields")
        return cls(
            type=event_type,
            task_id=task_id,
            title=str(data.get("title") or ""),
            country=str(data.get("country") or ""),
            assigned_to=_uuid(data.get("assigned_to")),
            changed_by=_uuid(data.get("changed_by")),
            previous_assigned_to=_uuid(data.get("previous_assigned_to")),
            old_status=_status(data.get("old_status")),
            new_status=_status(data.get("new_status")),
            fields=tuple(str(field) for field in fields) if isinstance(fields, list) else (),
        )
