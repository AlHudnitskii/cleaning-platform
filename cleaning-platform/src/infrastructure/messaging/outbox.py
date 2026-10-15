from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models import OutboxMessage

TASK_CREATED = "task_created"
TASK_STATUS_CHANGED = "task_status_changed"


def enqueue(session: AsyncSession, event_type: str, payload: dict[str, Any]) -> None:
    session.add(OutboxMessage(event_type=event_type, payload=payload))
