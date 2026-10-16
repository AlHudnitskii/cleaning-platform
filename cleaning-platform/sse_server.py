import asyncio
import json
import logging
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
from src.infrastructure.auth.middleware import AuthError, authenticate_token
from src.infrastructure.messaging.rabbitmq import connect, declare_task_events, decode_event
from src.settings import get_settings

logger = logging.getLogger("sse")

PING_SECONDS = 30
CLIENT_QUEUE_SIZE = 100


@dataclass(eq=False)
class Client:
    user: CurrentUser
    queue: asyncio.Queue[str] = field(default_factory=lambda: asyncio.Queue(CLIENT_QUEUE_SIZE))


clients: dict[uuid.UUID, set[Client]] = defaultdict(set)


def sse_message(data: dict[str, Any]) -> str:
    return f"data: {json.dumps(data, default=str)}\n\n"


def can_receive(user: CurrentUser, event: dict[str, Any]) -> bool:
    if str(user.id) == event.get("changed_by"):
        return False
    country = str(event.get("country"))
    for key in ("assigned_to", "previous_assigned_to"):
        assigned = event.get(key)
        assigned_to = uuid.UUID(assigned) if assigned else None
        if task_access.can_view(user, country, assigned_to):
            return True
    return False


def dispatch(event: dict[str, Any]) -> None:
    event_type = event.pop("type", None)
    message = sse_message({"type": event_type, "data": event, "timestamp": datetime.now(UTC).isoformat()})
    for user_clients in clients.values():
        for client in user_clients:
            if can_receive(client.user, event):
                with suppress(asyncio.QueueFull):
                    client.queue.put_nowait(message)


async def stream_handler(request: web.Request) -> web.StreamResponse:
    token = request.query.get("token")
    if not token:
        raise web.HTTPUnauthorized(text="Unauthorized")
    try:
        user = await authenticate_token(token)
    except AuthError as e:
        raise web.HTTPUnauthorized(text=e.message) from e

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
        dispatch(decode_event(message.body))


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
