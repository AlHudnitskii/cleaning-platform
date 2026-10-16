from typing import Any

from sqlalchemy import ColumnElement, and_, case, select
from sqlalchemy import func as sql
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.task_queries import overdue_condition
from src.domain.models.enums import TaskPriority, TaskStatus, UserRole
from src.infrastructure.database.models import Location, Task, User

TOP_LOCATIONS = 5
TOP_CLEANERS = 10


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
        select(User.email, User.country, task_count, completed_count)
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
            "country": cleaner_country,
            "task_count": tasks,
            "completed_count": completed,
            "completion_rate": round(completed / tasks * 100) if tasks else 0,
        }
        for email, cleaner_country, tasks, completed in (await session.execute(stmt)).all()
    ]
