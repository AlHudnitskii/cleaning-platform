import azure.functions as func
import logging
import json

from sqlalchemy import text
from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.domain.models.enums import UserRole

bp = func.Blueprint()


@bp.route(route="stats/dashboard", methods=["GET"])
async def get_dashboard(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Getting dashboard stats")

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        if user["role"] == UserRole.MANAGER:
            where = f"WHERE country = '{user['country']}'"
            where_and = f"AND country = '{user['country']}'"
        else:
            where = ""
            where_and = ""

        result = await session.execute(text(f"""
            SELECT status, COUNT(*) as count
            FROM tasks {where}
            GROUP BY status
        """))
        status_stats = {row.status: row.count for row in result.fetchall()}

        result = await session.execute(text(f"""
            SELECT priority, COUNT(*) as count
            FROM tasks {where}
            GROUP BY priority
        """))
        priority_stats = {row.priority: row.count for row in result.fetchall()}

        result = await session.execute(text(f"""
            SELECT country, COUNT(*) as count
            FROM tasks {where}
            GROUP BY country
            ORDER BY count DESC
        """))
        country_stats = [
            {"country": row.country, "count": row.count}
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT DATE(created_at) as date, COUNT(*) as count
            FROM tasks
            WHERE created_at >= NOW() - INTERVAL '7 days'
            {where_and}
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        """))
        daily_stats = [
            {"date": str(row.date), "count": row.count}
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT l.name, l.level, COUNT(t.id) as count
            FROM locations l
            LEFT JOIN tasks t ON t.location_id = l.id
            {"WHERE l.country = '" + user['country'] + "'" if user['role'] == UserRole.MANAGER else ""}
            GROUP BY l.id, l.name, l.level
            ORDER BY count DESC
            LIMIT 5
        """))
        top_locations = [
            {"name": row.name, "level": row.level, "count": row.count}
            for row in result.fetchall()
        ]

        result = await session.execute(text(f"""
            SELECT ROUND(AVG(quality_score), 1) as avg_score, COUNT(*) as reviewed_count
            FROM tasks
            WHERE quality_score IS NOT NULL
            {where_and}
        """))
        quality_row = result.fetchone()
        avg_quality = float(quality_row.avg_score) if quality_row.avg_score else None
        reviewed_count = quality_row.reviewed_count or 0

        result = await session.execute(text(f"""
            SELECT COUNT(*) as count FROM tasks
            WHERE is_recurring = true {where_and}
        """))
        recurring_count = result.fetchone().count

        result = await session.execute(text("SELECT COUNT(*) as count FROM users"))
        total_users = result.fetchone().count

    total_tasks = sum(status_stats.values())

    return func.HttpResponse(
        json.dumps({
            "status_stats": {
                "pending": status_stats.get("pending", 0),
                "in_progress": status_stats.get("in_progress", 0),
                "completed": status_stats.get("completed", 0),
                "on_hold": status_stats.get("on_hold", 0),
                "cancelled": status_stats.get("cancelled", 0),
            },
            "priority_stats": {
                "low": priority_stats.get("low", 0),
                "normal": priority_stats.get("normal", 0),
                "high": priority_stats.get("high", 0),
                "urgent": priority_stats.get("urgent", 0),
            },
            "country_stats": country_stats,
            "daily_stats": daily_stats,
            "top_locations": top_locations,
            "avg_quality": avg_quality,
            "reviewed_count": reviewed_count,
            "recurring_count": recurring_count,
            "total_users": total_users,
            "total_tasks": total_tasks,
        }),
        status_code=200,
        mimetype="application/json"
    )
