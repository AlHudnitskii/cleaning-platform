from datetime import UTC, datetime, timedelta

from src.domain.services.login_throttle import MAX_FAILURES, WINDOW, retry_after, throttle_key

NOW = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)


def minutes_ago(*minutes: float) -> list[datetime]:
    return [NOW - timedelta(minutes=m) for m in minutes]


def test_fewer_failures_than_the_limit_do_not_lock():
    assert retry_after(minutes_ago(*range(MAX_FAILURES - 1)), NOW) is None


def test_reaching_the_limit_locks_until_the_oldest_counted_failure_expires():
    failures = minutes_ago(10, 8, 6, 4, 2)

    assert retry_after(failures, NOW) == int((WINDOW - timedelta(minutes=10)).total_seconds())


def test_failures_outside_the_window_are_ignored():
    assert retry_after(minutes_ago(20, 16, 3, 2, 1), NOW) is None


def test_the_wait_is_never_zero_at_the_edge_of_the_window():
    failures = [NOW - WINDOW + timedelta(milliseconds=1), *minutes_ago(4, 3, 2, 1)]

    assert retry_after(failures, NOW) == 1


def test_email_case_and_spaces_share_one_counter():
    assert throttle_key("  Admin@Cleaning.com ") == throttle_key("admin@cleaning.com")
