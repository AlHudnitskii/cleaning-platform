import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from src.api.http import ApiError, not_found
from src.api.task_queries import task_progress
from src.domain.models.enums import ReviewBlocker, TaskStatus
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.database.models import Location, Task, TaskStatusHistory, User
from src.infrastructure.messaging import outbox
from src.infrastructure.messaging.events import TaskEvent, TaskEventType
from src.translations import Joined, Text, phrases


def blocker_message(blockers: list[ReviewBlocker], progress: task_access.TaskProgress) -> Text:
    parts: list[Text] = []
    if ReviewBlocker.PHOTO in blockers:
        parts.append(phrases.UPLOAD_PHOTO_STEP())
    if ReviewBlocker.CHECKLIST in blockers:
        parts.append(phrases.FINISH_CHECKLIST_STEP(done=progress.checklist_done, total=progress.checklist_total))
    return phrases.BEFORE_REVIEW(steps=Joined(tuple(parts), phrases.AND))


async def ensure_assignable(session: AsyncSession, assignee_id: uuid.UUID, country: str) -> None:
    assignee = await session.get(User, assignee_id)
    if assignee is None or not task_access.can_assign(country, assignee.role, assignee.country, assignee.is_active):
        raise ApiError(400, phrases.ASSIGNEE_NOT_ALLOWED())


async def load_location(session: AsyncSession, location_id: uuid.UUID) -> Location:
    location = await session.get(Location, location_id)
    if location is None:
        raise not_found(phrases.LOCATION)
    return location


async def change_status(session: AsyncSession, user: CurrentUser, task: Task, target: TaskStatus) -> TaskStatus:
    current = TaskStatus(task.status)
    if not task_access.can_change_status(user, current, target):
        message = phrases.STATUS_CHANGE_NOT_ALLOWED(
            current=phrases.status_name(current), target=phrases.status_name(target)
        )
        raise ApiError(409, message)
    if target == TaskStatus.ON_REVIEW:
        progress = (await task_progress(session, [task.id]))[task.id]
        blockers = task_access.review_blockers(task.photo_required, progress)
        if blockers:
            raise ApiError(409, blocker_message(blockers, progress))

    now = datetime.now(UTC)
    task.status = target
    session.add(
        TaskStatusHistory(
            task_id=task.id,
            old_status=current,
            new_status=target,
            changed_by=user.id,
            changed_at=now,
        )
    )
    outbox.enqueue(session, TaskEvent.of(TaskEventType.STATUS_CHANGED, task, user.id, old_status=current))
    return current
