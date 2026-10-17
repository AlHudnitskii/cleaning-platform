import asyncio
import base64
import json
import logging
from dataclasses import dataclass
from enum import StrEnum

from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
from py_vapid import Vapid
from pywebpush import WebPushException, webpush

from src.settings import get_settings
from src.translations import Locale, Text

logger = logging.getLogger(__name__)

GONE_STATUSES = frozenset({403, 404, 410})
PUSH_TIMEOUT_SECONDS = 10


@dataclass(frozen=True)
class PushMessage:
    title: Text
    body: Text
    task_id: str | None = None

    def payload(self, locale: Locale) -> str:
        return json.dumps(
            {"title": self.title.render(locale), "body": self.body.render(locale), "task_id": self.task_id}
        )


class PushResult(StrEnum):
    SENT = "sent"
    GONE = "gone"
    FAILED = "failed"


def get_public_key_base64() -> str:
    vapid = Vapid.from_file(get_settings().vapid_private_key)
    public_key_bytes = vapid.public_key.public_bytes(Encoding.X962, PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(public_key_bytes).decode().rstrip("=")


def _send(endpoint: str, p256dh: str, auth: str, payload: str) -> PushResult:
    settings = get_settings()
    try:
        webpush(
            subscription_info={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            data=payload,
            vapid_private_key=settings.vapid_private_key,
            vapid_claims={"sub": f"mailto:{settings.vapid_claims_email}"},
            timeout=PUSH_TIMEOUT_SECONDS,
        )
    except WebPushException as e:
        status = e.response.status_code if e.response is not None else None
        if status in GONE_STATUSES:
            return PushResult.GONE
        logger.warning("Web push rejected", extra={"status": status})
        return PushResult.FAILED
    return PushResult.SENT


async def send_push_notification(endpoint: str, p256dh: str, auth: str, payload: str) -> PushResult:
    return await asyncio.to_thread(_send, endpoint, p256dh, auth, payload)
