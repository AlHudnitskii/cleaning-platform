import uuid
from dataclasses import dataclass

from src.domain.models.enums import TaskStatus, UserRole
from src.domain.models.user import CurrentUser

S = TaskStatus

TRANSITIONS: dict[TaskStatus, frozenset[TaskStatus]] = {
    S.PENDING: frozenset({S.IN_PROGRESS, S.ON_HOLD, S.CANCELLED}),
    S.IN_PROGRESS: frozenset({S.ON_REVIEW, S.ON_HOLD, S.PENDING, S.CANCELLED}),
    S.ON_REVIEW: frozenset({S.COMPLETED, S.IN_PROGRESS}),
    S.ON_HOLD: frozenset({S.IN_PROGRESS, S.PENDING, S.CANCELLED}),
    S.COMPLETED: frozenset({S.IN_PROGRESS}),
    S.CANCELLED: frozenset({S.PENDING}),
}

CLEANER_TRANSITIONS: frozenset[tuple[TaskStatus, TaskStatus]] = frozenset(
    {
        (S.PENDING, S.IN_PROGRESS),
        (S.IN_PROGRESS, S.ON_REVIEW),
        (S.IN_PROGRESS, S.ON_HOLD),
        (S.ON_HOLD, S.IN_PROGRESS),
    }
)


@dataclass(frozen=True)
class TaskScope:
    country: str | None = None
    assigned_to: uuid.UUID | None = None


def task_scope(user: CurrentUser) -> TaskScope:
    if user.is_cleaner:
        return TaskScope(assigned_to=user.id)
    if user.is_manager:
        return TaskScope(country=user.country)
    return TaskScope()


def can_view(user: CurrentUser, country: str, assigned_to: uuid.UUID | None) -> bool:
    if user.is_admin:
        return True
    if user.is_manager:
        return user.country == country
    return assigned_to is not None and assigned_to == user.id


def can_manage(user: CurrentUser) -> bool:
    return user.role in (UserRole.ADMIN, UserRole.MANAGER)


def can_manage_country(user: CurrentUser, country: str) -> bool:
    if user.is_admin:
        return True
    return user.is_manager and user.country == country


def allowed_statuses(user: CurrentUser, current: TaskStatus) -> list[TaskStatus]:
    targets = TRANSITIONS.get(current, frozenset())
    if user.is_cleaner:
        targets = frozenset(t for t in targets if (current, t) in CLEANER_TRANSITIONS)
    return [s for s in TaskStatus if s in targets]


def can_change_status(user: CurrentUser, current: TaskStatus, target: TaskStatus) -> bool:
    return target in allowed_statuses(user, current)


def can_review_quality(user: CurrentUser, status: TaskStatus) -> bool:
    return can_manage(user) and status == TaskStatus.COMPLETED


def can_assign(task_country: str, assignee_role: str, assignee_country: str | None, assignee_active: bool) -> bool:
    return assignee_active and assignee_role == UserRole.CLEANER and assignee_country == task_country
