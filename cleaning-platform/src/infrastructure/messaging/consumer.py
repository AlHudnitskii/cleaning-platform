import os
import asyncio
import json
import logging
import uuid

import aio_pika
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

from src.infrastructure.push.notifications import send_push_notification
from src.infrastructure.messaging.rabbitmq import QUEUE_PUSH

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+asyncpg://cleaning_user:cleaning_pass@localhost:5433/cleaning_db"
)
RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def get_push_subscriptions(user_id: str) -> list[dict]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = :uid"),
            {"uid": uuid.UUID(user_id)}
        )
        return [{"endpoint": row.endpoint, "p256dh": row.p256dh, "auth": row.auth} for row in result.fetchall()]


async def get_user_by_id(user_id: str) -> dict | None:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id, email, role, country FROM users WHERE id = :uid"),
            {"uid": uuid.UUID(user_id)}
        )
        row = result.fetchone()
        if not row:
            return None
        return {"id": str(row.id), "email": row.email, "role": row.role, "country": row.country}


async def get_managers_by_country(country: str) -> list[dict]:
    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM users WHERE role = 'manager' AND country = :country AND is_active = true"),
            {"country": country}
        )
        return [{"id": str(row.id)} for row in result.fetchall()]


async def notify_user(user_id: str, title: str, body: str):
    subscriptions = await get_push_subscriptions(user_id)
    if not subscriptions:
        logging.info(f"No push subscriptions for user {user_id}")
        return

    for sub in subscriptions:
        success = await send_push_notification(
            endpoint=sub["endpoint"],
            p256dh=sub["p256dh"],
            auth=sub["auth"],
            title=title,
            body=body,
        )
        if success:
            logging.info(f"Push sent to user {user_id}")
        else:
            logging.warning(f"Push failed for user {user_id}")


async def handle_task_created(data: dict):
    logging.info(f"Handling task_created: {data['task_id']}")

    assigned_to = data.get("assigned_to")
    title = data.get("title", "New task")
    country = data.get("country")

    if assigned_to:
        await notify_user(
            user_id=assigned_to,
            title="New task assigned",
            body=f"You have been assigned: {title}",
        )

    if country:
        managers = await get_managers_by_country(country)
        for manager in managers:
            await notify_user(
                user_id=manager["id"],
                title="New task created",
                body=f"{title} ({country})",
            )


async def handle_task_status_changed(data: dict):
    logging.info(f"Handling task_status_changed: {data['task_id']}")

    assigned_to = data.get("assigned_to")
    title = data.get("title", "Task")
    old_status = data.get("old_status", "")
    new_status = data.get("new_status", "")

    if assigned_to:
        await notify_user(
            user_id=assigned_to,
            title="Task status updated",
            body=f"{title}: {old_status} -> {new_status}",
        )


async def handle_push(data: dict):
    user_id = data.get("user_id")
    title = data.get("title", "Notification")
    body = data.get("body", "")

    if user_id:
        await notify_user(user_id=user_id, title=title, body=body)


async def process_message(message: aio_pika.IncomingMessage):
    async with message.process():
        try:
            data = json.loads(message.body.decode())
            msg_type = data.get("type")

            logging.info(f"Received message type={msg_type}")

            if msg_type == "task_created":
                await handle_task_created(data)
            elif msg_type == "task_status_changed":
                await handle_task_status_changed(data)
            elif msg_type == "push":
                await handle_push(data)
            else:
                logging.warning(f"Unknown message type: {msg_type}")

        except Exception as e:
            logging.error(f"Error processing message: {e}")


async def start_consumer():
    logging.info("Starting consumer...")

    while True:
        try:
            connection = await aio_pika.connect_robust(RABBITMQ_URL)
            async with connection:
                channel = await connection.channel()
                await channel.set_qos(prefetch_count=10)

                queue = await channel.declare_queue(QUEUE_PUSH, durable=True)
                logging.info(f"Listening on queue: {QUEUE_PUSH}")

                await queue.consume(process_message)
                await asyncio.Future()

        except Exception as e:
            logging.error(f"Consumer error: {e}. Retrying in 5 seconds...")
            await asyncio.sleep(5)


if __name__ == "__main__":
    asyncio.run(start_consumer())
