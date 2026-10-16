from sqlalchemy.ext.asyncio import AsyncSession

from src.infrastructure.database.models import OutboxMessage
from src.infrastructure.messaging.events import TaskEvent


def enqueue(session: AsyncSession, event: TaskEvent) -> None:
    session.add(OutboxMessage(event_type=event.type.value, payload=event.payload()))
