from datetime import UTC, date, datetime, timedelta
from typing import Any

import azure.functions as func
from sqlalchemy import ColumnElement, and_, case, select
from sqlalchemy import func as sql
from sqlalchemy.ext.asyncio import AsyncSession

from src.api.http import ApiError, authenticated, json_response, optional_date, query_choice
from src.api.task_store import day_end_exclusive, day_start, overdue_condition
from src.domain.models.enums import Country, TaskPriority, TaskStatus, UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location, Task, User

bp = func.Blueprint()

DASHBOARD_DAYS = 7
DEFAULT_REPORT_DAYS = 30
MAX_REPORT_DAYS = 366
TOP_LOCATIONS = 5
TOP_CLEANERS = 10


def scoped_country(user: CurrentUser, requested: Country | None) -> str | None:
    return user.country if user.is_manager else requested


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


@bp.route(route="stats/dashboard", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def get_dashboard(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    country = scoped_country(user, None)
    task_conditions: list[ColumnElement[bool]] = [Task.country == country] if country else []
    since = day_start(datetime.now(UTC).date() - timedelta(days=DASHBOARD_DAYS - 1))

    async with session_scope() as session:
        status_stats = full_counts(await counts_by(session, Task.status, task_conditions), TaskStatus)
        priority_stats = full_counts(await counts_by(session, Task.priority, task_conditions), TaskPriority)
        countries = await country_counts(session, task_conditions)
        daily = await daily_counts(session, [*task_conditions, Task.created_at >= since])
        quality = await quality_summary(session, task_conditions)
        recurring = await session.scalar(
            select(sql.count()).select_from(Task).where(*task_conditions, Task.is_recurring.is_(True))
        )
        overdue = await session.scalar(
            select(sql.count()).select_from(Task).where(*task_conditions, overdue_condition())
        )

        task_count = sql.count(Task.id).label("count")
        location_stmt = (
            select(Location.id, Location.name, Location.level, task_count)
            .outerjoin(Task, Task.location_id == Location.id)
            .group_by(Location.id)
            .order_by(task_count.desc(), Location.name)
            .limit(TOP_LOCATIONS)
        )
        if country:
            location_stmt = location_stmt.where(Location.country == country)
        top_locations = [
            {"id": loc_id, "name": name, "level": level, "count": count}
            for loc_id, name, level, count in (await session.execute(location_stmt)).all()
        ]

        user_stmt = select(sql.count()).select_from(User)
        if country:
            user_stmt = user_stmt.where(User.country == country)
        total_users = await session.scalar(user_stmt)

    return json_response(
        {
            "status_stats": status_stats,
            "priority_stats": priority_stats,
            "country_stats": countries,
            "daily_stats": daily,
            "top_locations": top_locations,
            "avg_quality": quality["avg"],
            "reviewed_count": quality["reviewed_count"],
            "recurring_count": recurring or 0,
            "overdue_count": overdue or 0,
            "total_users": total_users or 0,
            "total_tasks": sum(status_stats.values()),
        }
    )


def report_period(req: func.HttpRequest) -> tuple[date, date]:
    today = datetime.now(UTC).date()
    date_to = optional_date(req, "date_to") or today
    date_from = optional_date(req, "date_from") or date_to - timedelta(days=DEFAULT_REPORT_DAYS)
    if date_from > date_to:
        raise ApiError(400, "date_from must not be after date_to")
    if (date_to - date_from).days > MAX_REPORT_DAYS:
        raise ApiError(400, f"Report period must not exceed {MAX_REPORT_DAYS} days")
    return date_from, date_to


@bp.route(route="stats/reports", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def get_reports(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    date_from, date_to = report_period(req)
    country = scoped_country(user, query_choice(req, "country", Country))
    start, end = day_start(date_from), day_end_exclusive(date_to)

    country_conditions: list[ColumnElement[bool]] = [Task.country == country] if country else []
    created_in_period = [*country_conditions, Task.created_at >= start, Task.created_at < end]
    reviewed_in_period = [*country_conditions, Task.quality_reviewed_at >= start, Task.quality_reviewed_at < end]

    async with session_scope() as session:
        status_stats = full_counts(await counts_by(session, Task.status, created_in_period), TaskStatus)
        priority_stats = full_counts(await counts_by(session, Task.priority, created_in_period), TaskPriority)
        countries = await country_counts(session, created_in_period)
        daily = await daily_counts(session, created_in_period)
        weekly = await weekly_counts(session, created_in_period)
        quality = await quality_summary(session, reviewed_in_period)

        task_count = sql.count(Task.id).label("task_count")
        completed_count = sql.count(case((Task.status == TaskStatus.COMPLETED, 1))).label("completed_count")
        cleaners_stmt = (
            select(User.email, User.country, task_count, completed_count)
            .outerjoin(Task, and_(Task.assigned_to == User.id, Task.created_at >= start, Task.created_at < end))
            .where(User.role == UserRole.CLEANER)
            .group_by(User.id)
            .order_by(task_count.desc(), User.email)
            .limit(TOP_CLEANERS)
        )
        if country:
            cleaners_stmt = cleaners_stmt.where(User.country == country)
        top_cleaners = [
            {
                "email": email,
                "country": cleaner_country,
                "task_count": tasks,
                "completed_count": completed,
                "completion_rate": round(completed / tasks * 100) if tasks else 0,
            }
            for email, cleaner_country, tasks, completed in (await session.execute(cleaners_stmt)).all()
        ]

    return json_response(
        {
            "period": {"date_from": date_from, "date_to": date_to},
            "total_tasks": sum(status_stats.values()),
            "status_stats": status_stats,
            "priority_stats": priority_stats,
            "country_stats": countries,
            "daily_stats": daily,
            "weekly_stats": weekly,
            "quality_stats": quality,
            "top_cleaners": top_cleaners,
        }
    )
