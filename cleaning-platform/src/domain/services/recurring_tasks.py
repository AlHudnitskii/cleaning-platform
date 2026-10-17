import re
from datetime import UTC, datetime

from dateutil.rrule import rrule, rrulestr

# Finer frequencies would make the scheduler create a task every hour or minute.
SCHEDULABLE_FREQUENCIES = frozenset({"DAILY", "WEEKLY", "MONTHLY", "YEARLY"})
FREQUENCY = re.compile(r"(?:^|[;:])FREQ=([A-Z]+)(?:;|$)", re.MULTILINE)


def _parse(rrule_string: str, dtstart: datetime) -> rrule | None:
    match = FREQUENCY.search(rrule_string.upper())
    if match is None or match.group(1) not in SCHEDULABLE_FREQUENCIES:
        return None
    try:
        rule = rrulestr(rrule_string, dtstart=dtstart)
    except (ValueError, TypeError, OverflowError):
        return None
    return rule if isinstance(rule, rrule) else None


def validate_rrule(rrule_string: str) -> bool:
    return _parse(rrule_string, datetime.now(UTC)) is not None


def series_anchor(scheduled_for: datetime | None, created_at: datetime) -> datetime:
    """Return the start of a series: the planned time of its first task, or its creation time."""
    return scheduled_for or created_at


def upcoming_occurrences(rrule_string: str, anchor: datetime, after: datetime, count: int) -> list[datetime]:
    """Return up to count occurrences of the series that starts at anchor, strictly later than after.

    The anchor fixes the time of day, so the dates stay the same whenever the caller asks.
    """
    rule = _parse(rrule_string, anchor)
    if rule is None:
        return []
    return list(rule.xafter(max(after, anchor), count=count))


def occurrences_between(
    rrule_string: str, anchor: datetime, after: datetime, until: datetime, limit: int
) -> list[datetime]:
    """Return up to limit occurrences in (after, until], never the anchor itself.

    The task that holds the rule covers the anchor, so the series continues after it.
    """
    occurrences: list[datetime] = []
    for occurrence in upcoming_occurrences(rrule_string, anchor, max(after, anchor), limit):
        if occurrence > until:
            break
        occurrences.append(occurrence)
    return occurrences
