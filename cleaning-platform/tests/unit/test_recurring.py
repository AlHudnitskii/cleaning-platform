from datetime import UTC, datetime

import pytest

from src.domain.services.recurring_tasks import (
    occurrences_between,
    series_anchor,
    upcoming_occurrences,
    validate_rrule,
)

ANCHOR = datetime(2026, 10, 5, 9, 0, tzinfo=UTC)


@pytest.mark.parametrize(
    "rule", ["FREQ=DAILY", "FREQ=WEEKLY;BYDAY=MO,WE,FR", "FREQ=MONTHLY", "FREQ=YEARLY", "RRULE:FREQ=WEEKLY"]
)
def test_valid_rules(rule: str) -> None:
    assert validate_rrule(rule)


@pytest.mark.parametrize("rule", ["", "nan", "FREQ=SOMETIMES", "hello", "INTERVAL=2"])
def test_invalid_rules(rule: str) -> None:
    assert not validate_rrule(rule)


@pytest.mark.parametrize("rule", ["FREQ=HOURLY", "FREQ=MINUTELY", "FREQ=SECONDLY", "INTERVAL=1;FREQ=HOURLY"])
def test_rules_finer_than_a_day_are_rejected(rule: str) -> None:
    assert not validate_rrule(rule)


def test_upcoming_occurrences_keep_the_time_of_day_of_the_series_start() -> None:
    now = datetime(2026, 10, 13, 15, 30, tzinfo=UTC)

    occurrences = upcoming_occurrences("FREQ=WEEKLY;BYDAY=MO", ANCHOR, now, 3)

    assert occurrences == [
        datetime(2026, 10, 19, 9, 0, tzinfo=UTC),
        datetime(2026, 10, 26, 9, 0, tzinfo=UTC),
        datetime(2026, 11, 2, 9, 0, tzinfo=UTC),
    ]


def test_upcoming_occurrences_of_a_new_series_skip_its_start() -> None:
    occurrences = upcoming_occurrences("FREQ=DAILY", ANCHOR, datetime(2026, 10, 1, tzinfo=UTC), 2)

    assert occurrences == [datetime(2026, 10, 6, 9, 0, tzinfo=UTC), datetime(2026, 10, 7, 9, 0, tzinfo=UTC)]


def test_upcoming_occurrences_of_an_invalid_rule_are_empty() -> None:
    assert upcoming_occurrences("nan", ANCHOR, ANCHOR, 5) == []


def test_occurrences_between_stop_at_the_end_of_the_window() -> None:
    occurrences = occurrences_between(
        "FREQ=DAILY", ANCHOR, datetime(2026, 10, 10, 9, 0, tzinfo=UTC), datetime(2026, 10, 12, 9, 0, tzinfo=UTC), 31
    )

    assert occurrences == [datetime(2026, 10, 11, 9, 0, tzinfo=UTC), datetime(2026, 10, 12, 9, 0, tzinfo=UTC)]


def test_occurrences_between_respect_the_limit() -> None:
    occurrences = occurrences_between("FREQ=DAILY", ANCHOR, ANCHOR, datetime(2027, 1, 1, tzinfo=UTC), 3)

    assert len(occurrences) == 3


def test_series_start_prefers_the_planned_time() -> None:
    created = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)

    assert series_anchor(ANCHOR, created) == ANCHOR
    assert series_anchor(None, created) == created
