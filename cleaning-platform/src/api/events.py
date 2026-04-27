import azure.functions as func
import asyncio
import json
import logging
from datetime import datetime

from src.infrastructure.auth.middleware import get_current_user, AuthError

bp = func.Blueprint()

connected_clients: dict[str, asyncio.Queue] = {}


async def send_event(user_id: str, event_type: str, data: dict):
    if user_id in connected_clients:
        await connected_clients[user_id].put({
            "type": event_type,
            "data": data,
            "timestamp": datetime.utcnow().isoformat()
        })


async def broadcast_event(event_type: str, data: dict, exclude_user: str = None):
    for user_id, queue in connected_clients.items():
        if user_id != exclude_user:
            await queue.put({
                "type": event_type,
                "data": data,
                "timestamp": datetime.utcnow().isoformat()
            })


@bp.route(route="events/stream", methods=["GET"])
async def event_stream(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    user_id = user["sub"]
    queue = asyncio.Queue()
    connected_clients[user_id] = queue
    logging.info(f"SSE client connected: {user_id}")

    async def generate():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'user_id': user_id})}\n\n"

            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=30.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        finally:
            connected_clients.pop(user_id, None)
            logging.info(f"SSE client disconnected: {user_id}")

    return func.HttpResponse(
        generate(),
        status_code=200,
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        }
    )
