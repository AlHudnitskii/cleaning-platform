import math
from collections.abc import Iterable
from datetime import datetime, timedelta

MAX_FAILURES = 5
WINDOW = timedelta(minutes=15)


def throttle_key(email: str) -> str:
    return email.strip().lower()


def window_start(now: datetime) -> datetime:
    return now - WINDOW


def retry_after(failures: Iterable[datetime], now: datetime) -> int | None:
    recent = sorted(at for at in failures if at > window_start(now))
    if len(recent) < MAX_FAILURES:
        return None
    unlocks_at = recent[-MAX_FAILURES] + WINDOW
    return max(1, math.ceil((unlocks_at - now).total_seconds()))
