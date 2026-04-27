import os
import logging
from pywebpush import webpush, WebPushException
import json

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

VAPID_PRIVATE_KEY = os.environ.get("VAPID_PRIVATE_KEY", os.path.join(BASE_DIR, "private_key.pem"))
VAPID_PUBLIC_KEY_FILE = os.environ.get("VAPID_PUBLIC_KEY", os.path.join(BASE_DIR, "public_key.pem"))
VAPID_CLAIMS_EMAIL = os.environ.get("VAPID_CLAIMS_EMAIL", "admin@cleaning.com")


def get_public_key_base64() -> str:
    from py_vapid import Vapid
    from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat
    import base64

    v = Vapid().from_file(VAPID_PRIVATE_KEY)
    public_key_bytes = v.public_key.public_bytes(
        Encoding.X962,
        PublicFormat.UncompressedPoint
    )
    return base64.urlsafe_b64encode(public_key_bytes).decode('utf-8').rstrip('=')


async def send_push_notification(endpoint: str, p256dh: str, auth: str, title: str, body: str) -> bool:
    try:
        logging.info(f"Sending push to endpoint: {endpoint[:50]}...")
        data = json.dumps({"title": title, "body": body})
        webpush(
            subscription_info={
                "endpoint": endpoint,
                "keys": {"p256dh": p256dh, "auth": auth}
            },
            data=data,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims={"sub": f"mailto:{VAPID_CLAIMS_EMAIL}"}
        )
        logging.info("Push sent successfully!")
        return True
    except WebPushException as e:
        logging.error(f"WebPushException: {e}")
        logging.error(f"Response: {e.response.text if e.response else 'no response'}")
        return False
    except Exception as e:
        logging.error(f"Push error: {type(e).__name__}: {e}")
        return False
