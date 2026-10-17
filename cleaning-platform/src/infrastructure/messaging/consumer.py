import asyncio
import logging
import uuid
from collections.abc import Awaitable, Callable

from aio_pika.abc import AbstractIncomingMessage
from sqlalchemy import delete, select

from src.domain.models.enums import UserRole
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import PushSubscription, User
from src.infrastructure.messaging.events import TaskEvent, TaskEventType
from src.infrastructure.messaging.rabbitmq import connect, declare_push_queue, decode_event
from src.infrastructure.push.notifications import PushMessage, PushResult, send_push_notification
from src.settings import get_settings
from src.translations import parse_locale, phrases

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
        payload = message.payload(parse_locale(sub.locale))
        result = await send_push_notification(sub.endpoint, sub.p256dh, sub.auth, payload)
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


def assigned_message(event: TaskEvent) -> PushMessage:
    body = phrases.PUSH_ASSIGNED_BODY(title=event.title)
    return PushMessage(phrases.PUSH_ASSIGNED_TITLE(), body, str(event.task_id))


async def handle_task_created(event: TaskEvent) -> None:
    if event.assigned_to:
        await notify_user(event.assigned_to, assigned_message(event))
    # Managers planned a recurring series already, so its scheduled tasks reach the assignee only.
    if not event.country or event.scheduled:
        return
    body = phrases.PUSH_CREATED_BODY(title=event.title, country=phrases.country_name(event.country))
    created = PushMessage(phrases.PUSH_CREATED_TITLE(), body, str(event.task_id))
    for manager_id in await active_managers(event.country):
        if manager_id != event.changed_by:
            await notify_user(manager_id, created)


async def handle_task_status_changed(event: TaskEvent) -> None:
    if event.assigned_to is None or event.assigned_to == event.changed_by:
        return
    if event.old_status is None or event.new_status is None:
        return
    body = phrases.PUSH_STATUS_BODY(
        title=event.title,
        old=phrases.status_name(event.old_status),
        new=phrases.status_name(event.new_status),
    )
    await notify_user(event.assigned_to, PushMessage(phrases.PUSH_STATUS_TITLE(), body, str(event.task_id)))


async def handle_task_updated(event: TaskEvent) -> None:
    if event.assigned_to is None or event.assigned_to == event.previous_assigned_to:
        return
    if event.previous_assigned_to is None and "assigned_to" not in event.fields:
        return
    if event.assigned_to == event.changed_by:
        return
    await notify_user(event.assigned_to, assigned_message(event))


async def ignore_event(event: TaskEvent) -> None:
    return None


HANDLERS: dict[TaskEventType, Callable[[TaskEvent], Awaitable[None]]] = {
    TaskEventType.CREATED: handle_task_created,
    TaskEventType.STATUS_CHANGED: handle_task_status_changed,
    TaskEventType.UPDATED: handle_task_updated,
    TaskEventType.DELETED: ignore_event,
}


async def process_message(message: AbstractIncomingMessage) -> None:
    async with message.process(requeue=False):
        data = decode_event(message.body)
        event = TaskEvent.from_message(data)
        if event is None:
            logger.warning("Unreadable task event", extra={"type": data.get("type")})
            return
        await HANDLERS[event.type](event)


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
