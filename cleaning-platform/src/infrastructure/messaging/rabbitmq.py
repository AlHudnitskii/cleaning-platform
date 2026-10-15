import json
from typing import Any

import aio_pika
from aio_pika.abc import AbstractChannel, AbstractExchange, AbstractQueue, AbstractRobustConnection

EXCHANGE_TASK_EVENTS = "task_events"
QUEUE_PUSH = "notifications.push"
QUEUE_PUSH_DEAD = "notifications.push.dead"


async def connect(url: str) -> AbstractRobustConnection:
    return await aio_pika.connect_robust(url)


async def declare_task_events(channel: AbstractChannel) -> AbstractExchange:
    return await channel.declare_exchange(EXCHANGE_TASK_EVENTS, aio_pika.ExchangeType.FANOUT, durable=True)


async def declare_push_queue(channel: AbstractChannel) -> AbstractQueue:
    exchange = await declare_task_events(channel)
    await channel.declare_queue(QUEUE_PUSH_DEAD, durable=True)
    queue = await channel.declare_queue(
        QUEUE_PUSH,
        durable=True,
        arguments={
            "x-dead-letter-exchange": "",
            "x-dead-letter-routing-key": QUEUE_PUSH_DEAD,
        },
    )
    await queue.bind(exchange)
    return queue


def encode_event(event_type: str, payload: dict[str, Any], message_id: str) -> aio_pika.Message:
    return aio_pika.Message(
        body=json.dumps({"type": event_type, **payload}, default=str).encode(),
        content_type="application/json",
        delivery_mode=aio_pika.DeliveryMode.PERSISTENT,
        message_id=message_id,
    )


def decode_event(body: bytes) -> dict[str, Any]:
    data = json.loads(body.decode())
    if not isinstance(data, dict):
        raise ValueError("event body must be a JSON object")
    return data
