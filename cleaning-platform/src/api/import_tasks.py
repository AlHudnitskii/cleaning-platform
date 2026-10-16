import io
from datetime import UTC, datetime

import azure.functions as func
import pandas as pd
from sqlalchemy import or_, select

from src.api.http import ApiError, authenticated, json_response
from src.domain.models.enums import TaskStatus, UserRole
from src.domain.models.user import CurrentUser
from src.domain.services import task_access
from src.domain.services.task_import import (
    MAX_IMPORT_BYTES,
    MAX_IMPORT_ROWS,
    REQUIRED_COLUMNS,
    ImportRow,
    parse_row,
)
from src.infrastructure.database.connection import session_scope
from src.infrastructure.database.models import Location, Task, User

bp = func.Blueprint()

FIRST_DATA_ROW = 2
PREVIEW_ROWS = 50
TEMPLATE_ROWS = [
    {
        "title": "Clean Room 101",
        "country": "DE",
        "description": "Daily cleaning",
        "priority": "normal",
        "assignee_email": "",
        "location_name": "Room 101",
        "rrule": "",
    },
    {
        "title": "Vacuum carpets",
        "country": "NL",
        "description": "",
        "priority": "high",
        "assignee_email": "",
        "location_name": "Floor A",
        "rrule": "FREQ=WEEKLY;BYDAY=MO",
    },
]


def read_table(filename: str, data: bytes) -> pd.DataFrame:
    name = filename.lower()
    try:
        if name.endswith(".csv"):
            return pd.read_csv(io.BytesIO(data), dtype=str, keep_default_na=False, nrows=MAX_IMPORT_ROWS + 1)
        if name.endswith(".xlsx"):
            return pd.read_excel(io.BytesIO(data), dtype=str, keep_default_na=False, nrows=MAX_IMPORT_ROWS + 1)
    except (ValueError, UnicodeDecodeError, pd.errors.ParserError) as e:
        raise ApiError(400, "Failed to parse file. Check that it is a valid CSV or Excel file") from e
    raise ApiError(400, "Unsupported file format. Use CSV or Excel (.xlsx)")


def row_error(row: ImportRow, message: str) -> str:
    return f"Row {row.row_number}: {message}"


def assignee_allowed(row: ImportRow, assignee: User | None) -> bool:
    if not row.assignee_email and not row.assignee_id:
        return True
    return assignee is not None and task_access.can_assign(
        row.country, assignee.role, assignee.country, assignee.is_active
    )


def preview_row(row: ImportRow, location: Location | None, assignee: User | None) -> dict[str, object]:
    return {
        "row": row.row_number,
        "title": row.title,
        "country": row.country.value,
        "priority": row.priority.value,
        "location_name": location.name if location else None,
        "assignee_email": assignee.email if assignee else None,
        "rrule": row.rrule,
    }


@bp.route(route="import/tasks", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def import_tasks(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    dry_run = req.params.get("dry_run") == "true"
    upload = req.files.get("file")
    if upload is None:
        raise ApiError(400, "No file provided. Use form-data with key 'file'")

    data = upload.read(MAX_IMPORT_BYTES + 1)
    if len(data) > MAX_IMPORT_BYTES:
        raise ApiError(413, f"File must be at most {MAX_IMPORT_BYTES // (1024 * 1024)} MB")

    df = read_table(upload.filename or "", data)
    df.columns = [str(c).strip().lower() for c in df.columns]
    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        raise ApiError(400, f"Missing required columns: {', '.join(sorted(missing))}")
    if len(df) > MAX_IMPORT_ROWS:
        raise ApiError(400, f"File must contain at most {MAX_IMPORT_ROWS} rows")

    forced_country = user.country if user.is_manager else None
    errors: list[str] = []
    rows: list[ImportRow] = []
    for offset, record in enumerate(df.to_dict(orient="records")):
        parsed = parse_row(record, offset + FIRST_DATA_ROW, forced_country)
        if isinstance(parsed, str):
            errors.append(parsed)
        else:
            rows.append(parsed)

    ready: list[Task] = []
    preview: list[dict[str, object]] = []
    async with session_scope() as session, session.begin():
        countries = {row.country.value for row in rows}
        locations: dict[tuple[str, str], list[Location]] = {}
        for known in await session.scalars(select(Location).where(Location.country.in_(countries))):
            locations.setdefault((known.country, known.name.lower()), []).append(known)

        emails = {row.assignee_email for row in rows if row.assignee_email}
        ids = {row.assignee_id for row in rows if row.assignee_id}
        assignees = (await session.scalars(select(User).where(or_(User.email.in_(emails), User.id.in_(ids))))).all()
        by_email = {a.email.lower(): a for a in assignees}
        by_id = {a.id: a for a in assignees}

        now = datetime.now(UTC)
        for row in rows:
            location: Location | None = None
            if row.location_name:
                matches = locations.get((row.country.value, row.location_name.lower()), [])
                if not matches:
                    errors.append(row_error(row, f"location '{row.location_name}' not found in {row.country}"))
                    continue
                if len(matches) > 1:
                    errors.append(row_error(row, f"location name '{row.location_name}' is ambiguous"))
                    continue
                location = matches[0]

            assignee = by_id.get(row.assignee_id) if row.assignee_id else None
            if row.assignee_email:
                assignee = by_email.get(row.assignee_email)
            if not assignee_allowed(row, assignee):
                errors.append(row_error(row, "assignee must be an active cleaner from the task's country"))
                continue

            ready.append(
                Task(
                    title=row.title,
                    description=row.description,
                    status=TaskStatus.PENDING,
                    country=row.country,
                    location_id=location.id if location else None,
                    assigned_to=assignee.id if assignee else None,
                    priority=row.priority,
                    rrule=row.rrule,
                    is_recurring=bool(row.rrule),
                    created_at=now,
                )
            )
            if len(preview) < PREVIEW_ROWS:
                preview.append(preview_row(row, location, assignee))

        if not dry_run:
            session.add_all(ready)

    return json_response(
        {
            "imported": 0 if dry_run else len(ready),
            "valid_rows": len(ready),
            "total_rows": len(df),
            "errors": errors,
            "preview": preview,
            "dry_run": dry_run,
        }
    )


@bp.route(route="import/template", methods=["GET"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def download_template(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    buffer = io.BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        pd.DataFrame(TEMPLATE_ROWS).to_excel(writer, index=False, sheet_name="Tasks")

    return func.HttpResponse(
        body=buffer.getvalue(),
        status_code=200,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import_template.xlsx"},
    )
