import uuid

import pytest

from src.domain.models.enums import Country, TaskStatus, UserRole
from src.domain.models.user import CurrentUser
from src.domain.services import task_access

S = TaskStatus


def make_user(role: UserRole, country: Country | None = Country.DE) -> CurrentUser:
    return CurrentUser(id=uuid.uuid4(), email=f"{role}@example.com", role=role, country=country)


ADMIN = make_user(UserRole.ADMIN, None)
MANAGER_DE = make_user(UserRole.MANAGER)
CLEANER_DE = make_user(UserRole.CLEANER)


@pytest.mark.parametrize(
    ("user", "country", "assigned_to", "want"),
    [
        (ADMIN, "NL", None, True),
        (MANAGER_DE, "DE", None, True),
        (MANAGER_DE, "NL", None, False),
        (CLEANER_DE, "DE", CLEANER_DE.id, True),
        (CLEANER_DE, "DE", uuid.uuid4(), False),
        (CLEANER_DE, "DE", None, False),
    ],
    ids=[
        "admin sees any country",
        "manager sees own country",
        "manager does not see other country",
        "cleaner sees own task",
        "cleaner does not see task of another cleaner",
        "cleaner does not see unassigned task",
    ],
)
def test_can_view(user: CurrentUser, country: str, assigned_to: uuid.UUID | None, want: bool) -> None:
    assert task_access.can_view(user, country, assigned_to) is want


def test_task_scope_by_role() -> None:
    assert task_access.task_scope(ADMIN) == task_access.TaskScope()
    assert task_access.task_scope(MANAGER_DE) == task_access.TaskScope(country=Country.DE)
    assert task_access.task_scope(CLEANER_DE) == task_access.TaskScope(assigned_to=CLEANER_DE.id)


@pytest.mark.parametrize(
    ("current", "want"),
    [
        (S.PENDING, [S.IN_PROGRESS]),
        (S.IN_PROGRESS, [S.ON_REVIEW, S.ON_HOLD]),
        (S.ON_REVIEW, []),
        (S.ON_HOLD, [S.IN_PROGRESS]),
        (S.COMPLETED, []),
        (S.CANCELLED, []),
    ],
)
def test_cleaner_allowed_statuses(current: TaskStatus, want: list[TaskStatus]) -> None:
    assert task_access.allowed_statuses(CLEANER_DE, current) == want


def test_cleaner_cannot_complete_or_cancel() -> None:
    for current in TaskStatus:
        assert not task_access.can_change_status(CLEANER_DE, current, S.COMPLETED)
        assert not task_access.can_change_status(CLEANER_DE, current, S.CANCELLED)


def test_manager_completes_only_from_review() -> None:
    assert task_access.can_change_status(MANAGER_DE, S.ON_REVIEW, S.COMPLETED)
    assert not task_access.can_change_status(MANAGER_DE, S.PENDING, S.COMPLETED)
    assert not task_access.can_change_status(MANAGER_DE, S.IN_PROGRESS, S.COMPLETED)


def test_status_cannot_transition_to_itself() -> None:
    for status in TaskStatus:
        assert not task_access.can_change_status(ADMIN, status, status)


def test_quality_review_requires_completed_task_and_manager_role() -> None:
    assert task_access.can_review_quality(MANAGER_DE, S.COMPLETED)
    assert not task_access.can_review_quality(MANAGER_DE, S.ON_REVIEW)
    assert not task_access.can_review_quality(CLEANER_DE, S.COMPLETED)


def test_can_manage_country() -> None:
    assert task_access.can_manage_country(ADMIN, "NL")
    assert task_access.can_manage_country(MANAGER_DE, "DE")
    assert not task_access.can_manage_country(MANAGER_DE, "NL")
    assert not task_access.can_manage_country(CLEANER_DE, "DE")


@pytest.mark.parametrize(
    ("role", "country", "active", "want"),
    [
        ("cleaner", "DE", True, True),
        ("cleaner", "NL", True, False),
        ("cleaner", "DE", False, False),
        ("manager", "DE", True, False),
    ],
    ids=["active cleaner same country", "other country", "inactive", "not a cleaner"],
)
def test_can_assign(role: str, country: str, active: bool, want: bool) -> None:
    assert task_access.can_assign("DE", role, country, active) is want
