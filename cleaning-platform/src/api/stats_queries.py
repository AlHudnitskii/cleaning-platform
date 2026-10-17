from datetime import datetime
from typing import Any

from sqlalchemy import ColumnElement, and_, case, select
from sqlalchemy import func as sql
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.task_queries import OPEN_STATUS_VALUES, in_progress_spans, overdue_condition, work_seconds
from src.domain.models.enums import TaskPriority, TaskStatus, UserRole
from src.infrastructure.database.models import Location, Task, TaskStatusHistory, User

TOP_LOCATIONS = 5
TOP_CLEANERS = 10
TOP_WORK_ROWS = 10


def country_scope(country: str | None) -> list[ColumnElement[bool]]:
    return [Task.country == country] if country else []


async def counts_by(session: AsyncSession, column: Any, conditions: list[ColumnElement[bool]]) -> dict[str, int]:
    rows = await session.execute(select(column, sql.count()).where(*conditions).group_by(column))
    return {str(key): count for key, count in rows.all()}


def full_counts(counts: dict[str, int], keys: type[TaskStatus] | type[TaskPriority]) -> dict[str, int]:
    return {k.value: counts.get(k.value, 0) for k in keys}


async def country_counts(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> list[dict[str, Any]]:
    total = sql.count().label("count")
    rows = await session.execute(
        select(Task.country, total).where(*conditions).group_by(Task.country).order_by(total.desc(), Task.country)
    )
    return [{"country": country, "count": count} for country, count in rows.all()]


async def daily_counts(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> list[dict[str, Any]]:
    day = sql.date(sql.timezone("UTC", Task.created_at)).label("day")
    rows = await session.execute(select(day, sql.count()).where(*conditions).group_by(day).order_by(day))
    return [{"date": d.isoformat(), "count": count} for d, count in rows.all()]


async def weekly_counts(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> list[dict[str, Any]]:
    week = sql.date_trunc("week", sql.timezone("UTC", Task.created_at)).label("week")
    rows = await session.execute(select(week, sql.count()).where(*conditions).group_by(week).order_by(week))
    return [{"week": w.date().isoformat(), "count": count} for w, count in rows.all()]


async def quality_summary(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> dict[str, Any]:
    row = (
        await session.execute(
            select(
                sql.round(sql.avg(Task.quality_score), 1),
                sql.count(Task.quality_score),
                sql.min(Task.quality_score),
                sql.max(Task.quality_score),
            ).where(*conditions, Task.quality_score.is_not(None))
        )
    ).one()
    avg, reviewed, minimum, maximum = row
    return {
        "avg": float(avg) if avg is not None else None,
        "min": minimum,
        "max": maximum,
        "reviewed_count": reviewed,
    }


async def recurring_count(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> int:
    stmt = select(sql.count()).select_from(Task).where(*conditions, Task.is_recurring.is_(True))
    return await session.scalar(stmt) or 0


async def overdue_count(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> int:
    return await session.scalar(select(sql.count()).select_from(Task).where(*conditions, overdue_condition())) or 0


async def top_locations(session: AsyncSession, country: str | None) -> list[dict[str, Any]]:
    task_count = sql.count(Task.id).label("count")
    stmt = (
        select(Location.id, Location.name, Location.level, task_count)
        .outerjoin(Task, Task.location_id == Location.id)
        .group_by(Location.id)
        .order_by(task_count.desc(), Location.name)
        .limit(TOP_LOCATIONS)
    )
    if country:
        stmt = stmt.where(Location.country == country)
    return [
        {"id": loc_id, "name": name, "level": level, "count": count}
        for loc_id, name, level, count in (await session.execute(stmt)).all()
    ]


async def user_count(session: AsyncSession, country: str | None) -> int:
    stmt = select(sql.count()).select_from(User)
    if country:
        stmt = stmt.where(User.country == country)
    return await session.scalar(stmt) or 0


async def top_cleaners(
    session: AsyncSession, country: str | None, period: list[ColumnElement[bool]]
) -> list[dict[str, Any]]:
    task_count = sql.count(Task.id).label("task_count")
    completed_count = sql.count(case((Task.status == TaskStatus.COMPLETED, 1))).label("completed_count")
    stmt = (
        select(User.email, User.full_name, User.country, task_count, completed_count)
        .outerjoin(Task, and_(Task.assigned_to == User.id, *period))
        .where(User.role == UserRole.CLEANER)
        .group_by(User.id)
        .order_by(task_count.desc(), User.email)
        .limit(TOP_CLEANERS)
    )
    if country:
        stmt = stmt.where(User.country == country)
    return [
        {
            "email": email,
            "name": name,
            "country": cleaner_country,
            "task_count": tasks,
            "completed_count": completed,
            "completion_rate": round(completed / tasks * 100) if tasks else 0,
        }
        for email, name, cleaner_country, tasks, completed in (await session.execute(stmt)).all()
    ]


async def work_summary(session: AsyncSession, conditions: list[ColumnElement[bool]]) -> dict[str, Any]:
    """Average time in progress of completed tasks that match conditions, overall, per cleaner and per location."""
    completed = select(Task.id).where(*conditions, Task.status == TaskStatus.COMPLETED)
    spans = in_progress_spans(TaskStatusHistory.task_id.in_(completed))
    per_task = select(spans.c.task_id, work_seconds(spans).label("seconds")).group_by(spans.c.task_id).subquery()
    measured = per_task.c.seconds.is_not(None)
    average = sql.avg(per_task.c.seconds)
    tasks = sql.count(per_task.c.task_id).label("tasks")

    overall_avg, overall_count = (await session.execute(select(average, sql.count()).where(measured))).one()
    by_cleaner = await session.execute(
        select(User.email, User.full_name, tasks, average)
        .select_from(per_task)
        .join(Task, Task.id == per_task.c.task_id)
        .join(User, User.id == Task.assigned_to)
        .where(measured)
        .group_by(User.id)
        .order_by(tasks.desc(), User.email)
        .limit(TOP_WORK_ROWS)
    )
    by_location = await session.execute(
        select(Location.id, Location.name, tasks, average)
        .select_from(per_task)
        .join(Task, Task.id == per_task.c.task_id)
        .join(Location, Location.id == Task.location_id)
        .where(measured)
        .group_by(Location.id)
        .order_by(tasks.desc(), Location.name)
        .limit(TOP_WORK_ROWS)
    )
    return {
        "avg_seconds": round(overall_avg) if overall_avg is not None else None,
        "task_count": overall_count,
        "by_cleaner": [
            {"email": email, "name": name, "task_count": count, "avg_seconds": round(avg)}
            for email, name, count, avg in by_cleaner.all()
        ],
        "by_location": [
            {"id": location_id, "name": name, "task_count": count, "avg_seconds": round(avg)}
            for location_id, name, count, avg in by_location.all()
        ],
    }


async def personal_summary(session: AsyncSession, scope: list[ColumnElement[bool]], since: datetime) -> dict[str, Any]:
    """Figures for one user's profile: work finished since a moment and the state of their open tasks now."""
    finished = (
        select(TaskStatusHistory.task_id)
        .where(TaskStatusHistory.new_status == TaskStatus.COMPLETED, TaskStatusHistory.changed_at >= since)
        .distinct()
    )
    completed = [*scope, Task.status == TaskStatus.COMPLETED, Task.id.in_(finished)]
    spans = in_progress_spans(TaskStatusHistory.task_id.in_(select(Task.id).where(*completed)))
    per_task = select(spans.c.task_id, work_seconds(spans).label("seconds")).group_by(spans.c.task_id).subquery()

    def count(*conditions: ColumnElement[bool]) -> Any:
        return select(sql.count()).select_from(Task).where(*scope, *conditions).scalar_subquery()

    row = (
        await session.execute(
            select(
                count(Task.status == TaskStatus.COMPLETED, Task.id.in_(finished)),
                count(Task.status.in_(OPEN_STATUS_VALUES)),
                count(Task.status == TaskStatus.ON_REVIEW),
                count(overdue_condition()),
                select(sql.round(sql.avg(Task.quality_score), 1))
                .where(*scope, Task.quality_score.is_not(None), Task.quality_reviewed_at >= since)
                .scalar_subquery(),
                select(sql.avg(per_task.c.seconds)).scalar_subquery(),
            )
        )
    ).one()
    done, open_now, on_review, overdue, quality, work = row
    return {
        "completed": done,
        "open": open_now,
        "on_review": on_review,
        "overdue": overdue,
        "avg_quality": float(quality) if quality is not None else None,
        "avg_work_seconds": round(work) if work is not None else None,
    }
