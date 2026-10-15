from datetime import UTC, datetime

import pytest

from src.domain.services.recurring_tasks import get_next_occurrences, validate_rrule


@pytest.mark.parametrize("rule", ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=MONTHLY"])
def test_valid_rules(rule: str) -> None:
    assert validate_rrule(rule)


@pytest.mark.parametrize("rule", ["", "nan", "FREQ=SOMETIMES", "hello"])
def test_invalid_rules(rule: str) -> None:
    assert not validate_rrule(rule)


def test_next_occurrences_are_timezone_aware_and_ordered() -> None:
    now = datetime(2026, 10, 12, 9, 0, tzinfo=UTC)
    occurrences = get_next_occurrences("FREQ=WEEKLY;BYDAY=MO", count=3, now=now)
    assert occurrences == [
        datetime(2026, 10, 12, 9, 0, tzinfo=UTC),
        datetime(2026, 10, 19, 9, 0, tzinfo=UTC),
        datetime(2026, 10, 26, 9, 0, tzinfo=UTC),
    ]


def test_next_occurrences_of_invalid_rule_is_empty() -> None:
    assert get_next_occurrences("nan") == []
