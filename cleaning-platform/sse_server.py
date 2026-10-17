import asyncio
import json
import logging
import time
import uuid
from collections import defaultdict
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any

from aio_pika.abc import AbstractIncomingMessage
from aiohttp import web

from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.auth.middleware import AuthError, authenticate_ticket
from src.infrastructure.messaging.events import TaskEvent
from src.infrastructure.messaging.rabbitmq import connect, declare_task_events, decode_event
from src.settings import get_settings

logger = logging.getLogger("sse")

PING_SECONDS = 30
CLIENT_QUEUE_SIZE = 100
TICKET_MEMORY_SECONDS = 120.0

used_tickets: dict[str, float] = {}


def claim_ticket(token_id: str, now: float) -> bool:
    for known, forget_at in list(used_tickets.items()):
        if forget_at <= now:
            del used_tickets[known]
    if not token_id or token_id in used_tickets:
        return False
    used_tickets[token_id] = now + TICKET_MEMORY_SECONDS
    return True


@dataclass(eq=False)
class Client:
    user: CurrentUser
    queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(CLIENT_QUEUE_SIZE))


clients: dict[uuid.UUID, set[Client]] = defaultdict(set)


def sse_message(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


def can_receive(user: CurrentUser, event: TaskEvent) -> bool:
    if user.id == event.changed_by:
        return False
    return any(
        task_access.can_view(user, event.country, assignee)
        for assignee in (event.assigned_to, event.previous_assigned_to)
    )


def dispatch(event: TaskEvent) -> None:
    data = {"type": event.type.value, "data": event.payload(), "timestamp": datetime.now(UTC).isoformat()}
    message = sse_message(data)
    for user_clients in clients.values():
        for client in user_clients:
            if can_receive(client.user, event):
                with suppress(asyncio.QueueFull):
                    client.queue.put_nowait(message)


async def stream_handler(request: web.Request) -> web.StreamResponse:
    ticket = request.query.get("ticket")
    if not ticket:
        raise web.HTTPUnauthorized(text="Unauthorized")
    try:
        user, claims = await authenticate_ticket(ticket)
    except AuthError as e:
        raise web.HTTPUnauthorized(text=str(e.message)) from e
    if not claim_ticket(claims.token_id, time.monotonic()):
        logger.warning("Stream ticket reused", extra={"user_id": str(user.id)})
        raise web.HTTPUnauthorized(text="Unauthorized")

    response = web.StreamResponse(
        headers={"Content-Type": "text/event-stream", "Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )
    await response.prepare(request)

    client = Client(user)
    clients[user.id].add(client)
    logger.info("Client connected", extra={"user_id": str(user.id)})
    try:
        await response.write(sse_message({"type": "connected"}).encode())
        while True:
            try:
                message = await asyncio.wait_for(client.queue.get(), timeout=PING_SECONDS)
            except TimeoutError:
                message = sse_message({"type": "ping"})
            await response.write(message.encode())
    except (ConnectionResetError, asyncio.CancelledError):
        pass
    finally:
        clients[user.id].discard(client)
        if not clients[user.id]:
            clients.pop(user.id, None)
        logger.info("Client disconnected", extra={"user_id": str(user.id)})
    return response


async def on_event(message: AbstractIncomingMessage) -> None:
    async with message.process():
        event = TaskEvent.from_message(decode_event(message.body))
        if event is not None:
            dispatch(event)


async def consume_events(app: web.Application) -> Any:
    settings = get_settings()
    connection = await connect(settings.rabbitmq_url)
    channel = await connection.channel()
    exchange = await declare_task_events(channel)
    queue = await channel.declare_queue(exclusive=True, auto_delete=True)
    await queue.bind(exchange)
    await queue.consume(on_event)
    yield
    await connection.close()


def create_app() -> web.Application:
    app = web.Application()
    app.router.add_get("/events/stream", stream_handler)
    app.cleanup_ctx.append(consume_events)
    return app


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    web.run_app(create_app(), host=settings.sse_host, port=settings.sse_port, access_log=None)
