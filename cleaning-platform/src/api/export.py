import logging
import uuid
from datetime import UTC, datetime
from enum import StrEnum

import azure.functions as func
from azure.core.exceptions import AzureError
from sqlalchemy import select

from src.api.http import ApiError, authenticated, parse_date, query_choice
from src.api.task_store import day_end_exclusive, day_start
from src.domain.models.enums import Country, UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.blob.storage import EXPORTS_CONTAINER, upload_blob
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location, Task, User
from src.infrastructure.export.exporter import export_to_excel, export_to_parquet, tasks_to_dataframe
from src.translations import phrases

logger = logging.getLogger(__name__)

bp = func.Blueprint()

MAX_EXPORT_DAYS = 366
EXCEL_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class ExportFormat(StrEnum):
    EXCEL = "excel"
    PARQUET = "parquet"


@bp.route(route="export/tasks", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def export_tasks(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    raw_from, raw_to = req.params.get("date_from"), req.params.get("date_to")
    if not raw_from or not raw_to:
        raise ApiError(400, phrases.PERIOD_REQUIRED())
    date_from, date_to = parse_date(raw_from, "date_from"), parse_date(raw_to, "date_to")
    if date_from > date_to:
        raise ApiError(400, phrases.PERIOD_REVERSED())
    if (date_to - date_from).days > MAX_EXPORT_DAYS:
        raise ApiError(400, phrases.EXPORT_PERIOD_TOO_LONG(days=MAX_EXPORT_DAYS))

    export_format = query_choice(req, "format", ExportFormat) or ExportFormat.PARQUET
    country = user.country if user.is_manager else query_choice(req, "country", Country)

    stmt = (
        select(Task, Location.name, User.email)
        .outerjoin(Location, Task.location_id == Location.id)
        .outerjoin(User, Task.assigned_to == User.id)
        .where(Task.created_at >= day_start(date_from), Task.created_at < day_end_exclusive(date_to))
        .order_by(Task.created_at.desc(), Task.id.desc())
    )
    if country:
        stmt = stmt.where(Task.country == country)

    async with session_scope() as session:
        rows = (await session.execute(stmt)).all()

    df = tasks_to_dataframe(
        [
            {
                "id": str(task.id),
                "title": task.title,
                "description": task.description or "",
                "status": task.status,
                "priority": task.priority,
                "country": task.country,
                "location": location_name or "",
                "assignee": assignee_email or "",
                "created_at": task.created_at.isoformat(),
            }
            for task, location_name, assignee_email in rows
        ]
    )

    if export_format == ExportFormat.EXCEL:
        file_data, extension, content_type = export_to_excel(df), "xlsx", EXCEL_MIME
    else:
        file_data, extension, content_type = export_to_parquet(df), "parquet", "application/octet-stream"

    filename = f"tasks_{date_from}_{date_to}.{extension}"
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    blob_name = f"{user.id}/{stamp}_{uuid.uuid4().hex[:8]}_{filename}"
    try:
        await upload_blob(EXPORTS_CONTAINER, blob_name, file_data, content_type)
    except AzureError:
        logger.exception("Failed to archive export", extra={"blob": blob_name})

    return func.HttpResponse(
        body=file_data,
        status_code=200,
        mimetype=content_type,
        headers={
            "Content-Disposition": f"attachment; filename={filename}",
            "X-Total-Tasks": str(len(rows)),
        },
    )
