import asyncio
import json
import logging
from datetime import datetime
from aiohttp import web

logging.basicConfig(level=logging.INFO)

connected_clients: dict[str, web.StreamResponse] = {}


async def stream_handler(request: web.Request) -> web.StreamResponse:
    token = request.rel_url.query.get('token')
    if not token:
        return web.Response(status=401, text='Unauthorized')

    try:
        import jwt
        payload = jwt.decode(token, "your-secret-key-change-in-production", algorithms=["HS256"])
        user_id = payload["sub"]
    except Exception:
        return web.Response(status=401, text='Invalid token')

    response = web.StreamResponse(
        status=200,
        headers={
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
            'Access-Control-Allow-Origin': '*',
        }
    )
    await response.prepare(request)

    connected_clients[user_id] = response
    logging.info(f"Client connected: {user_id}, total: {len(connected_clients)}")

    try:
        await response.write(
            f"data: {json.dumps({'type': 'connected', 'user_id': user_id})}\n\n".encode()
        )

        while True:
            await asyncio.sleep(30)
            await response.write(b"data: {\"type\": \"ping\"}\n\n")
    except Exception:
        pass
    finally:
        connected_clients.pop(user_id, None)
        logging.info(f"Client disconnected: {user_id}")

    return response


async def broadcast_handler(request: web.Request) -> web.Response:
    data = await request.json()
    event_type = data.get("type")
    payload = data.get("data", {})
    exclude_user = data.get("exclude_user")

    message = f"data: {json.dumps({'type': event_type, 'data': payload, 'timestamp': datetime.utcnow().isoformat()})}\n\n"

    disconnected = []
    for user_id, response in connected_clients.items():
        if user_id == exclude_user:
            continue
        try:
            await response.write(message.encode())
        except Exception:
            disconnected.append(user_id)

    for user_id in disconnected:
        connected_clients.pop(user_id, None)

    return web.json_response({"sent_to": len(connected_clients) - len(disconnected)})


app = web.Application()
app.router.add_get('/events/stream', stream_handler)
app.router.add_post('/events/broadcast', broadcast_handler)

if __name__ == '__main__':
    web.run_app(app, host='0.0.0.0', port=8080)
