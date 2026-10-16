import asyncio
import logging
import uuid
from typing import Any

from aio_pika.abc import AbstractIncomingMessage
from sqlalchemy import delete, select

from src.domain.models.enums import UserRole
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import PushSubscription, User
from src.infrastructure.messaging.outbox import TASK_CREATED, TASK_DELETED, TASK_STATUS_CHANGED, TASK_UPDATED
from src.infrastructure.messaging.rabbitmq import connect, declare_push_queue, decode_event
from src.infrastructure.push.notifications import PushMessage, PushResult, send_push_notification
from src.settings import get_settings

logger = logging.getLogger(__name__)

RETRY_SECONDS = 5.0


async def notify_user(user_id: uuid.UUID, message: PushMessage) -> None:
    async with session_scope() as session:
        subscriptions = (
            await session.scalars(
                select(PushSubscription)
                .join(User, User.id == PushSubscription.user_id)
                .where(PushSubscription.user_id == user_id, User.is_active.is_(True))
            )
        ).all()

    gone: list[uuid.UUID] = []
    for sub in subscriptions:
        result = await send_push_notification(sub.endpoint, sub.p256dh, sub.auth, message)
        if result == PushResult.GONE:
            gone.append(sub.id)

    if gone:
        async with session_scope() as session, session.begin():
            await session.execute(delete(PushSubscription).where(PushSubscription.id.in_(gone)))
        logger.info("Removed expired push subscriptions", extra={"user_id": str(user_id), "count": len(gone)})


async def active_managers(country: str) -> list[uuid.UUID]:
    async with session_scope() as session:
        rows = await session.scalars(
            select(User.id).where(User.role == UserRole.MANAGER, User.country == country, User.is_active.is_(True))
        )
        return list(rows)


def _optional_uuid(value: Any) -> uuid.UUID | None:
    return uuid.UUID(str(value)) if value else None


def _task_id(event: dict[str, Any]) -> str | None:
    task_id = _optional_uuid(event.get("task_id"))
    return str(task_id) if task_id else None


async def handle_task_created(event: dict[str, Any]) -> None:
    title = str(event.get("title") or "New task")
    country = event.get("country")
    assignee = _optional_uuid(event.get("assigned_to"))

    task_id = _task_id(event)

    if assignee:
        await notify_user(assignee, PushMessage("New task assigned", f"You have been assigned: {title}", task_id))
    if country:
        for manager_id in await active_managers(str(country)):
            await notify_user(manager_id, PushMessage("New task created", f"{title} ({country})", task_id))


async def handle_task_status_changed(event: dict[str, Any]) -> None:
    assignee = _optional_uuid(event.get("assigned_to"))
    if assignee is None or assignee == _optional_uuid(event.get("changed_by")):
        return
    title = str(event.get("title") or "Task")
    body = f"{title}: {event.get('old_status')} -> {event.get('new_status')}"
    await notify_user(assignee, PushMessage("Task status updated", body, _task_id(event)))


async def handle_task_updated(event: dict[str, Any]) -> None:
    assignee = _optional_uuid(event.get("assigned_to"))
    if assignee is None or assignee == _optional_uuid(event.get("previous_assigned_to")):
        return
    if assignee == _optional_uuid(event.get("changed_by")):
        return
    title = str(event.get("title") or "Task")
    await notify_user(assignee, PushMessage("New task assigned", f"You have been assigned: {title}", _task_id(event)))


async def ignore_event(event: dict[str, Any]) -> None:
    return None


HANDLERS = {
    TASK_CREATED: handle_task_created,
    TASK_STATUS_CHANGED: handle_task_status_changed,
    TASK_UPDATED: handle_task_updated,
    TASK_DELETED: ignore_event,
}


async def process_message(message: AbstractIncomingMessage) -> None:
    async with message.process(requeue=False):
        event = decode_event(message.body)
        handler = HANDLERS.get(str(event.get("type")))
        if handler is None:
            logger.warning("Unknown event type", extra={"type": event.get("type")})
            return
        await handler(event)


async def run_consumer() -> None:
    settings = get_settings()
    while True:
        try:
            connection = await connect(settings.rabbitmq_url)
            async with connection:
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=10)
                queue = await declare_push_queue(channel)
                await queue.consume(process_message)
                logger.info("Push consumer started")
                await asyncio.Future()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Push consumer failed, retrying in %s seconds", RETRY_SECONDS)
            await asyncio.sleep(RETRY_SECONDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_consumer())
