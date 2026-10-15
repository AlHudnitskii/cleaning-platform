import asyncio
import logging
from datetime import UTC, datetime

from aio_pika.abc import AbstractExchange
from sqlalchemy import select

from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import OutboxMessage
from src.infrastructure.messaging.rabbitmq import connect, declare_push_queue, declare_task_events, encode_event
from src.settings import get_settings

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
IDLE_SECONDS = 1.0
RETRY_SECONDS = 5.0


async def relay_batch(exchange: AbstractExchange) -> int:
    async with session_scope() as session, session.begin():
        messages = (
            await session.scalars(
                select(OutboxMessage)
                .where(OutboxMessage.published_at.is_(None))
                .order_by(OutboxMessage.created_at, OutboxMessage.id)
                .limit(BATCH_SIZE)
                .with_for_update(skip_locked=True)
            )
        ).all()
        for message in messages:
            await exchange.publish(
                encode_event(message.event_type, message.payload, str(message.id)),
                routing_key="",
            )
            message.published_at = datetime.now(UTC)
        return len(messages)


async def run_relay() -> None:
    settings = get_settings()
    while True:
        try:
            connection = await connect(settings.rabbitmq_url)
            async with connection:
                channel = await connection.channel(publisher_confirms=True)
                await declare_push_queue(channel)
                exchange = await declare_task_events(channel)
                logger.info("Outbox relay started")
                while True:
                    published = await relay_batch(exchange)
                    if published == 0:
                        await asyncio.sleep(IDLE_SECONDS)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("Outbox relay failed, retrying in %s seconds", RETRY_SECONDS)
            await asyncio.sleep(RETRY_SECONDS)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    asyncio.run(run_relay())
