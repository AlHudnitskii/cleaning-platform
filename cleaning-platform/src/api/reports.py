import azure.functions as func
import logging
import json
from datetime import datetime, timedelta

from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.domain.models.enums import UserRole

bp = func.Blueprint()


@bp.route(route="stats/reports", methods=["GET"])
async def get_reports(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Getting reports")

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    date_from = req.params.get("date_from")
    date_to = req.params.get("date_to")
    country_filter = req.params.get("country")

    if not date_from or not date_to:
        end = datetime.utcnow()
        start = end - timedelta(days=30)
        date_from = start.strftime("%Y-%m-%d")
        date_to = end.strftime("%Y-%m-%d")

    try:
        dt_from = datetime.strptime(date_from, "%Y-%m-%d")
        dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(hour=23, minute=59, second=59)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid date format. Use YYYY-MM-DD"}),
            status_code=400,
            mimetype="application/json"
        )

    conditions = ["created_at BETWEEN :date_from AND :date_to"]
    params = {"date_from": dt_from, "date_to": dt_to}

    if user["role"] == UserRole.MANAGER:
        conditions.append("country = :country")
        params["country"] = user["country"]
    elif country_filter:
        conditions.append("country = :country")
        params["country"] = country_filter.upper()

    where = "WHERE " + " AND ".join(conditions)

    async with AsyncSessionLocal() as session:
        result = await session.execute(text(f"""
            SELECT status, COUNT(*) as count
            FROM tasks {where}
            GROUP BY status
        """), params)
        status_stats = {row.status: row.count for row in result.fetchall()}

        result = await session.execute(text(f"""
            SELECT priority, COUNT(*) as count
            FROM tasks {where}
            GROUP BY priority
        """), params)
        priority_stats = {row.priority: row.count for row in result.fetchall()}

        result = await session.execute(text(f"""
            SELECT country, COUNT(*) as count
            FROM tasks {where}
            GROUP BY country
            ORDER BY count DESC
        """), params)
        country_stats = [
            {"country": row.country, "count": row.count}
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM tasks {where}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """), params)
        daily_stats = [
            {"date": str(row.date), "count": row.count}
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT DATE_TRUNC('week', created_at) as week, COUNT(*) as count
            FROM tasks {where}
            GROUP BY DATE_TRUNC('week', created_at)
            ORDER BY week ASC
        """), params)
        weekly_stats = [
            {"week": str(row.week.date()), "count": row.count}
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT
                ROUND(AVG(quality_score), 1) as avg_score,
                COUNT(*) as reviewed_count,
                MIN(quality_score) as min_score,
                MAX(quality_score) as max_score
            FROM tasks
            {where.replace('created_at', 'quality_reviewed_at')}
            AND quality_score IS NOT NULL
        """), params)
        quality_row = result.fetchone()
        quality_stats = {
            "avg": float(quality_row.avg_score) if quality_row.avg_score else None,
            "min": quality_row.min_score,
            "max": quality_row.max_score,
            "reviewed_count": quality_row.reviewed_count or 0,
        }

        result = await session.execute(text(f"""
            SELECT u.email, u.role, u.country, COUNT(t.id) as task_count,
                   SUM(CASE WHEN t.status = 'completed' THEN 1 ELSE 0 END) as completed_count
            FROM users u
            LEFT JOIN tasks t ON t.assigned_to = u.id AND t.created_at BETWEEN :date_from AND :date_to
            WHERE u.role = 'cleaner'
            {"AND u.country = :country" if "country" in params else ""}
            GROUP BY u.id, u.email, u.role, u.country
            ORDER BY task_count DESC
            LIMIT 10
        """), params)
        top_cleaners = [
            {
                "email": row.email,
                "country": row.country,
                "task_count": row.task_count,
                "completed_count": row.completed_count,
                "completion_rate": round(row.completed_count / row.task_count * 100) if row.task_count > 0 else 0
            }
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT COUNT(*) as total FROM tasks {where}
        """), params)
        total_tasks = result.fetchone().total

    return func.HttpResponse(
        json.dumps({
            "period": {"date_from": date_from, "date_to": date_to},
            "total_tasks": total_tasks,
            "status_stats": status_stats,
            "priority_stats": priority_stats,
            "country_stats": country_stats,
            "daily_stats": daily_stats,
            "weekly_stats": weekly_stats,
            "quality_stats": quality_stats,
            "top_cleaners": top_cleaners,
        }),
        status_code=200,
        mimetype="application/json"
    )
