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


@bp.route(route="import/tasks", methods=["POST"])
@authenticated(UserRole.ADMIN, UserRole.MANAGER)
async def import_tasks(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
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

    imported = 0
    async with session_scope() as session, session.begin():
        countries = {row.country.value for row in rows}
        locations: dict[tuple[str, str], list[Location]] = {}
        for location in await session.scalars(select(Location).where(Location.country.in_(countries))):
            locations.setdefault((location.country, location.name.lower()), []).append(location)

        emails = {row.assignee_email for row in rows if row.assignee_email}
        ids = {row.assignee_id for row in rows if row.assignee_id}
        assignees = (await session.scalars(select(User).where(or_(User.email.in_(emails), User.id.in_(ids))))).all()
        by_email = {a.email.lower(): a for a in assignees}
        by_id = {a.id: a for a in assignees}

        now = datetime.now(UTC)
        for row in rows:
            location_id = None
            if row.location_name:
                matches = locations.get((row.country.value, row.location_name.lower()), [])
                if not matches:
                    errors.append(row_error(row, f"location '{row.location_name}' not found in {row.country}"))
                    continue
                if len(matches) > 1:
                    errors.append(row_error(row, f"location name '{row.location_name}' is ambiguous"))
                    continue
                location_id = matches[0].id

            assignee_id = None
            assignee = by_id.get(row.assignee_id) if row.assignee_id else None
            if row.assignee_email:
                assignee = by_email.get(row.assignee_email)
            if row.assignee_email or row.assignee_id:
                if assignee is None or not task_access.can_assign(
                    row.country, assignee.role, assignee.country, assignee.is_active
                ):
                    errors.append(row_error(row, "assignee must be an active cleaner from the task's country"))
                    continue
                assignee_id = assignee.id

            session.add(
                Task(
                    title=row.title,
                    description=row.description,
                    status=TaskStatus.PENDING,
                    country=row.country,
                    location_id=location_id,
                    assigned_to=assignee_id,
                    priority=row.priority,
                    rrule=row.rrule,
                    is_recurring=bool(row.rrule),
                    created_at=now,
                )
            )
            imported += 1

    return json_response({"imported": imported, "total_rows": len(df), "errors": errors})


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
