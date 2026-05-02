import os
import aio_pika
import json
import logging
import uuid

RABBITMQ_URL = os.environ.get("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

QUEUE_PUSH = "notifications.push"
QUEUE_EMAIL = "notifications.email"
QUEUE_INTEGRATIONS = "integrations"


async def get_connection():
    return await aio_pika.connect_robust(RABBITMQ_URL)


async def publish_message(queue_name: str, message: dict):
    try:
        connection = await get_connection()
        async with connection:
            channel = await connection.channel()
            await channel.declare_queue(queue_name, durable=True)
            await channel.default_exchange.publish(
                aio_pika.Message(
                    body=json.dumps(message, default=str).encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    message_id=str(uuid.uuid4()),
                ),
                routing_key=queue_name,
            )
            logging.info(f"Message published to {queue_name}: {message}")
    except Exception as e:
        logging.error(f"Failed to publish message to {queue_name}: {e}")


async def publish_push_notification(user_id: str, title: str, body: str):
    await publish_message(QUEUE_PUSH, {
        "type": "push",
        "user_id": user_id,
        "title": title,
        "body": body,
    })


async def publish_task_created(task_id: str, title: str, country: str, assigned_to: str | None, location_id: str | None):
    await publish_message(QUEUE_PUSH, {
        "type": "task_created",
        "task_id": task_id,
        "title": title,
        "country": country,
        "assigned_to": assigned_to,
        "location_id": location_id,
    })


async def publish_task_status_changed(task_id: str, title: str, old_status: str, new_status: str, assigned_to: str | None):
    await publish_message(QUEUE_PUSH, {
        "type": "task_status_changed",
        "task_id": task_id,
        "title": title,
        "old_status": old_status,
        "new_status": new_status,
        "assigned_to": assigned_to,
    })
