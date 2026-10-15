from datetime import UTC, datetime

from dateutil.rrule import rrulebase, rrulestr


def _parse(rrule_string: str, dtstart: datetime) -> rrulebase | None:
    try:
        rule = rrulestr(rrule_string, dtstart=dtstart)
    except (ValueError, TypeError, OverflowError):
        return None
    return rule if isinstance(rule, rrulebase) else None


def validate_rrule(rrule_string: str) -> bool:
    return _parse(rrule_string, datetime.now(UTC)) is not None


def get_next_occurrences(rrule_string: str, count: int = 10, now: datetime | None = None) -> list[datetime]:
    rule = _parse(rrule_string, now or datetime.now(UTC))
    if rule is None:
        return []
    return list(rule[:count])
