from datetime import datetime
from dateutil.rrule import rrulestr


def validate_rrule(rrule_string: str) -> bool:
    try:
        rrulestr(rrule_string)
        return True
    except Exception:
        return False


def get_next_occurrences(rrule_string: str, count: int = 10) -> list[datetime]:
    try:
        rule = rrulestr(rrule_string, dtstart=datetime.utcnow())
        return list(rule[:count])
    except Exception:
        return []


def get_occurrences_between(rrule_string: str, start: datetime, end: datetime) -> list[datetime]:
    try:
        rule = rrulestr(rrule_string, dtstart=start)
        return list(rule.between(start, end))
    except Exception:
        return []
