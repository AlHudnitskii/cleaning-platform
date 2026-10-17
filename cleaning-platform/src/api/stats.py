from datetime import UTC, date, datetime, timedelta

import azure.functions as func

from src.api.http import ApiError, authenticated, json_response, optional_date, query_choice
from src.api.stats_queries import (
    country_counts,
    country_scope,
    counts_by,
    daily_counts,
    full_counts,
    overdue_count,
    quality_summary,
    recurring_count,
    top_cleaners,
    top_locations,
    user_count,
    weekly_counts,
    work_summary,
)
from src.api.task_queries import day_end_exclusive, day_start
from src.domain.models.enums import Country, TaskPriority, TaskStatus, UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Task
from src.translations import phrases

bp = func.Blueprint()

DASHBOARD_DAYS = 7
DEFAULT_REPORT_DAYS = 30
MAX_REPORT_DAYS = 366


def scoped_country(user: CurrentUser, requested: Country | None) -> str | None:
    return user.country if user.is_manager else requested


@bp.route(route="stats/dashboard", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def get_dashboard(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    country = scoped_country(user, None)
    scope = country_scope(country)
    since = day_start(datetime.now(UTC).date() - timedelta(days=DASHBOARD_DAYS - 1))

    async with session_scope() as session:
        status_stats = full_counts(await counts_by(session, Task.status, scope), TaskStatus)
        priority_stats = full_counts(await counts_by(session, Task.priority, scope), TaskPriority)
        quality = await quality_summary(session, scope)
        body = {
            "status_stats": status_stats,
            "priority_stats": priority_stats,
            "country_stats": await country_counts(session, scope),
            "daily_stats": await daily_counts(session, [*scope, Task.created_at >= since]),
            "top_locations": await top_locations(session, country),
            "avg_quality": quality["avg"],
            "reviewed_count": quality["reviewed_count"],
            "recurring_count": await recurring_count(session, scope),
            "overdue_count": await overdue_count(session, scope),
            "total_users": await user_count(session, country),
            "total_tasks": sum(status_stats.values()),
        }

    return json_response(body)


def report_period(req: func.HttpRequest) -> tuple[date, date]:
    today = datetime.now(UTC).date()
    date_to = optional_date(req, "date_to") or today
    date_from = optional_date(req, "date_from") or date_to - timedelta(days=DEFAULT_REPORT_DAYS)
    if date_from > date_to:
        raise ApiError(400, phrases.PERIOD_REVERSED())
    if (date_to - date_from).days > MAX_REPORT_DAYS:
        raise ApiError(400, phrases.REPORT_PERIOD_TOO_LONG(days=MAX_REPORT_DAYS))
    return date_from, date_to


@bp.route(route="stats/reports", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def get_reports(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    date_from, date_to = report_period(req)
    country = scoped_country(user, query_choice(req, "country", Country))
    start, end = day_start(date_from), day_end_exclusive(date_to)
    scope = country_scope(country)
    created = [Task.created_at >= start, Task.created_at < end]
    reviewed = [Task.quality_reviewed_at >= start, Task.quality_reviewed_at < end]

    async with session_scope() as session:
        status_stats = full_counts(await counts_by(session, Task.status, [*scope, *created]), TaskStatus)
        body = {
            "period": {"date_from": date_from, "date_to": date_to},
            "total_tasks": sum(status_stats.values()),
            "status_stats": status_stats,
            "priority_stats": full_counts(await counts_by(session, Task.priority, [*scope, *created]), TaskPriority),
            "country_stats": await country_counts(session, [*scope, *created]),
            "daily_stats": await daily_counts(session, [*scope, *created]),
            "weekly_stats": await weekly_counts(session, [*scope, *created]),
            "quality_stats": await quality_summary(session, [*scope, *reviewed]),
            "top_cleaners": await top_cleaners(session, country, created),
            "work_time": await work_summary(session, [*scope, *created]),
        }

    return json_response(body)
