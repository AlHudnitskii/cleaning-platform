from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.schemas.task import TaskResponse
from src.api.task_queries import WorkTime, task_progress, work_times
from src.domain.models.enums import Country, TaskPriority, TaskStatus
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.infrastructure.database.models import Location, Task, User


def to_response(
    task: Task,
    user: CurrentUser,
    progress: task_access.TaskProgress,
    assignee_email: str | None = None,
    location_name: str | None = None,
    location_path: list[str] | None = None,
    work: WorkTime | None = None,
    assignee_name: str | None = None,
) -> TaskResponse:
    status = TaskStatus(task.status)
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=status,
        country=Country(task.country),
        location_id=task.location_id,
        location_name=location_name,
        location_path=location_path or [],
        assigned_to=task.assigned_to,
        assigned_to_email=assignee_email,
        assigned_to_name=assignee_name,
        rrule=task.rrule,
        is_recurring=task.is_recurring,
        parent_task_id=task.parent_task_id,
        scheduled_for=task.scheduled_for,
        priority=TaskPriority(task.priority),
        due_date=task.due_date,
        photo_required=task.photo_required,
        checklist_done=progress.checklist_done,
        checklist_total=progress.checklist_total,
        photo_count=progress.photo_count,
        review_blockers=task_access.review_blockers(task.photo_required, progress),
        quality_score=task.quality_score,
        quality_comment=task.quality_comment,
        quality_reviewed_by=task.quality_reviewed_by,
        quality_reviewed_at=task.quality_reviewed_at,
        created_at=task.created_at,
        started_at=work.started_at if work else None,
        work_seconds=work.work_seconds if work else None,
        allowed_statuses=task_access.allowed_statuses(user, status),
    )


async def detailed_response(session: AsyncSession, user: CurrentUser, task: Task) -> TaskResponse:
    assignee_email = assignee_name = None
    if task.assigned_to:
        assignee = (
            await session.execute(select(User.email, User.full_name).where(User.id == task.assigned_to))
        ).first()
        if assignee is not None:
            assignee_email, assignee_name = assignee

    location_name = None
    location_path: list[str] = []
    if task.location_id:
        location = await session.get(Location, task.location_id)
        if location is not None:
            location_name = location.name
            ancestors = await session.scalars(
                select(Location.name).where(Location.path.op("@>")(location.path)).order_by(func.nlevel(Location.path))
            )
            location_path = list(ancestors)

    progress = (await task_progress(session, [task.id]))[task.id]
    work = (await work_times(session, [task.id]))[task.id]
    return to_response(task, user, progress, assignee_email, location_name, location_path, work, assignee_name)
