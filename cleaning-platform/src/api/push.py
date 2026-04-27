import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from sqlalchemy import text
from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.push.notifications import get_public_key_base64

bp = func.Blueprint()


@bp.route(route="push/vapid-public-key", methods=["GET"])
async def get_vapid_key(req: func.HttpRequest) -> func.HttpResponse:
    try:
        from py_vapid import Vapid
        import os

        key_path = os.environ.get("VAPID_PRIVATE_KEY", "private_key.pem")
        logging.info(f"Loading VAPID key from: {key_path}")
        logging.info(f"Key exists: {os.path.exists(key_path)}")

        v = Vapid().from_file(key_path)
        public_key = get_public_key_base64()
        logging.info(f"Public key: {public_key}")

        if not public_key:
            return func.HttpResponse(
                json.dumps({"error": "Public key is empty"}),
                status_code=500,
                mimetype="application/json"
            )

        return func.HttpResponse(
            json.dumps({"public_key": public_key}),
            status_code=200,
            mimetype="application/json"
        )
    except Exception as e:
        logging.error(f"VAPID key error: {e}")
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
            status_code=500,
            mimetype="application/json"
        )


@bp.route(route="push/subscribe", methods=["POST"])
async def subscribe(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    endpoint = body.get("endpoint")
    p256dh = body.get("keys", {}).get("p256dh")
    auth = body.get("keys", {}).get("auth")

    if not all([endpoint, p256dh, auth]):
        return func.HttpResponse(
            json.dumps({"error": "endpoint, p256dh and auth are required"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, created_at)
                VALUES (:id, :user_id, :endpoint, :p256dh, :auth, :created_at)
                ON CONFLICT DO NOTHING
            """),
            {
                "id": uuid.uuid4(),
                "user_id": uuid.UUID(user["sub"]),
                "endpoint": endpoint,
                "p256dh": p256dh,
                "auth": auth,
                "created_at": datetime.utcnow()
            }
        )
        await session.commit()

    return func.HttpResponse(
        json.dumps({"message": "Subscribed successfully"}),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="push/unsubscribe", methods=["DELETE"])
async def unsubscribe(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        await session.execute(
            text("DELETE FROM push_subscriptions WHERE user_id = :user_id"),
            {"user_id": uuid.UUID(user["sub"])}
        )
        await session.commit()

    return func.HttpResponse(
        json.dumps({"message": "Unsubscribed"}),
        status_code=200,
        mimetype="application/json"
    )
