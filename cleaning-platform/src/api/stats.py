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
            country_filter = f"WHERE country = '{user['country']}'"
        else:
            country_filter = ""

        result = await session.execute(text(f"""
            SELECT status, COUNT(*) as count
            FROM tasks {country_filter}
            GROUP BY status
        """))
        status_stats = {row.status: row.count for row in result.fetchall()}

        result = await session.execute(text(f"""
            SELECT country, COUNT(*) as count
            FROM tasks {country_filter}
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
            {country_filter}
            {"AND" if country_filter else "WHERE"} created_at >= NOW() - INTERVAL '7 days'
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

        result = await session.execute(text("SELECT COUNT(*) as count FROM users"))
        total_users = result.fetchone().count

    return func.HttpResponse(
        json.dumps({
            "status_stats": {
                "pending": status_stats.get("pending", 0),
                "in_progress": status_stats.get("in_progress", 0),
                "completed": status_stats.get("completed", 0),
            },
            "country_stats": country_stats,
            "daily_stats": daily_stats,
            "top_locations": top_locations,
            "total_users": total_users,
            "total_tasks": sum(status_stats.values()),
        }),
        status_code=200,
        mimetype="application/json"
    )
