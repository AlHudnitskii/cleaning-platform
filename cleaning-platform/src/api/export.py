import azure.functions as func
import logging
import json
from datetime import datetime

from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.export.exporter import tasks_to_dataframe, export_to_parquet, export_to_excel
from src.infrastructure.blob.storage import get_blob_service_client, CONTAINER_NAME
from src.domain.models.enums import UserRole

bp = func.Blueprint()


@bp.route(route="export/tasks", methods=["GET"])
async def export_tasks(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Exporting tasks")

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    if user["role"] not in [UserRole.ADMIN, UserRole.MANAGER]:
        return func.HttpResponse(
            json.dumps({"error": "Insufficient permissions"}),
            status_code=403,
            mimetype="application/json"
        )

    date_from = req.params.get("date_from")
    date_to = req.params.get("date_to")
    export_format = req.params.get("format", "parquet")
    country_filter = req.params.get("country")

    if not date_from or not date_to:
        return func.HttpResponse(
            json.dumps({"error": "date_from and date_to are required (YYYY-MM-DD)"}),
            status_code=400,
            mimetype="application/json"
        )

    try:
        dt_from = datetime.strptime(date_from, "%Y-%m-%d")
        dt_to = datetime.strptime(date_to, "%Y-%m-%d").replace(
            hour=23, minute=59, second=59
        )
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid date format. Use YYYY-MM-DD"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        if user["role"] == UserRole.MANAGER:
            result = await session.execute(
                text("""
                    SELECT t.id, t.title, t.description, t.status,
                           t.country, t.location_id, t.assigned_to, t.created_at
                    FROM tasks t
                    WHERE t.country = :country
                    AND t.created_at BETWEEN :date_from AND :date_to
                    ORDER BY t.created_at DESC
                """),
                {
                    "country": user["country"],
                    "date_from": dt_from,
                    "date_to": dt_to
                }
            )
        else:
            if country_filter:
                result = await session.execute(
                    text("""
                        SELECT t.id, t.title, t.description, t.status,
                               t.country, t.location_id, t.assigned_to, t.created_at
                        FROM tasks t
                        WHERE t.country = :country
                        AND t.created_at BETWEEN :date_from AND :date_to
                        ORDER BY t.created_at DESC
                    """),
                    {
                        "country": country_filter.upper(),
                        "date_from": dt_from,
                        "date_to": dt_to
                    }
                )
            else:
                result = await session.execute(
                    text("""
                        SELECT t.id, t.title, t.description, t.status,
                               t.country, t.location_id, t.assigned_to, t.created_at
                        FROM tasks t
                        WHERE t.created_at BETWEEN :date_from AND :date_to
                        ORDER BY t.created_at DESC
                    """),
                    {
                        "date_from": dt_from,
                        "date_to": dt_to
                    }
                )

        rows = result.fetchall()

    tasks = [
        {
            "id": str(row.id),
            "title": row.title,
            "description": row.description or "",
            "status": row.status,
            "country": row.country,
            "location_id": str(row.location_id) if row.location_id else "",
            "assigned_to": str(row.assigned_to) if row.assigned_to else "",
            "created_at": row.created_at.isoformat()
        }
        for row in rows
    ]

    logging.info(f"Exporting {len(tasks)} tasks")

    df = tasks_to_dataframe(tasks)

    if export_format == "excel":
        file_data = export_to_excel(df)
        filename = f"tasks_{date_from}_{date_to}.xlsx"
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    else:
        file_data = export_to_parquet(df)
        filename = f"tasks_{date_from}_{date_to}.parquet"
        content_type = "application/octet-stream"

    try:
        client = get_blob_service_client()
        blob_client = client.get_blob_client(
            container="exports",
            blob=filename
        )
        try:
            client.create_container("exports")
        except Exception:
            pass

        blob_client.upload_blob(file_data, overwrite=True)
        blob_url = f"http://127.0.0.1:10000/devstoreaccount1/exports/{filename}"
        logging.info(f"Export saved to blob: {blob_url}")
    except Exception as e:
        logging.error(f"Failed to save to blob: {e}")
        blob_url = None

    return func.HttpResponse(
        body=file_data,
        status_code=200,
        mimetype=content_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Tasks": str(len(tasks)),
            "X-Blob-URL": blob_url or ""
        }
    )
