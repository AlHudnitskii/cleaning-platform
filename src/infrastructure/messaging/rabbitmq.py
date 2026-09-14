import aio_pika
import json
import logging
from datetime import datetime
import uuid


RABBITMQ_URL = "amqp://guest:guest@localhost:5672/"


async def get_connection():
    return await aio_pika.connect_robust(RABBITMQ_URL)


async def publish_message(queue_name: str, message: dict):
    try:
        connection = await get_connection()
        async with connection:
            channel = await connection.channel()

            queue = await channel.declare_queue(
                queue_name,
                durable=True
            )

            await channel.default_exchange.publish(
                aio_pika.Message(
                    body=json.dumps(message, default=str).encode(),
                    delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
                    message_id=str(uuid.uuid4())
                ),
                routing_key=queue_name
            )
            logging.info(f"Message published to {queue_name}: {message}")

    except Exception as e:
        logging.error(f"Failed to publish message: {e}")
