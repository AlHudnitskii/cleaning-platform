import azure.functions as func
import logging
import json
import uuid
from datetime import datetime
from io import BytesIO

import pandas as pd
from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.domain.models.enums import UserRole, Country, TaskPriority

bp = func.Blueprint()

REQUIRED_COLUMNS = {"title", "country"}
OPTIONAL_COLUMNS = {"description", "priority", "assigned_to", "location_name", "rrule"}
VALID_PRIORITIES = {p.value for p in TaskPriority}
VALID_COUNTRIES = {c.value for c in Country}


def validate_row(row: dict, row_num: int) -> tuple[dict | None, str | None]:
    title = str(row.get("title", "")).strip()
    if len(title) < 3:
        return None, f"Row {row_num}: title must be at least 3 characters"

    country = str(row.get("country", "")).strip().upper()
    if country not in VALID_COUNTRIES:
        return None, f"Row {row_num}: invalid country '{country}'"

    priority = str(row.get("priority", "normal")).strip().lower()
    if priority not in VALID_PRIORITIES:
        priority = "normal"

    return {
        "title": title,
        "country": country,
        "description": str(row.get("description", "")).strip() or None,
        "priority": priority,
        "assigned_to": str(row.get("assigned_to", "")).strip() or None,
        "location_name": str(row.get("location_name", "")).strip() or None,
        "rrule": str(row.get("rrule", "")).strip() or None,
    }, None


@bp.route(route="import/tasks", methods=["POST"])
async def import_tasks(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Import tasks request")

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

    files = req.files
    if "file" not in files:
        return func.HttpResponse(
            json.dumps({"error": "No file provided. Use form-data with key 'file'"}),
            status_code=400,
            mimetype="application/json"
        )

    file = files["file"]
    filename = file.filename.lower()
    data = file.read()

    try:
        if filename.endswith(".csv"):
            df = pd.read_csv(BytesIO(data))
        elif filename.endswith((".xlsx", ".xls")):
            df = pd.read_excel(BytesIO(data))
        else:
            return func.HttpResponse(
                json.dumps({"error": "Unsupported file format. Use CSV or Excel (.xlsx)"}),
                status_code=400,
                mimetype="application/json"
            )
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": f"Failed to parse file: {str(e)}"}),
            status_code=400,
            mimetype="application/json"
        )

    df.columns = [c.strip().lower() for c in df.columns]

    missing = REQUIRED_COLUMNS - set(df.columns)
    if missing:
        return func.HttpResponse(
            json.dumps({"error": f"Missing required columns: {', '.join(missing)}"}),
            status_code=400,
            mimetype="application/json"
        )

    if user["role"] == UserRole.MANAGER:
        df["country"] = user["country"]

    rows = df.to_dict(orient="records")
    valid_rows = []
    errors = []

    for i, row in enumerate(rows, start=2):
        validated, error = validate_row(row, i)
        if error:
            errors.append(error)
        else:
            valid_rows.append(validated)

    if not valid_rows:
        return func.HttpResponse(
            json.dumps({"imported": 0, "errors": errors}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(text("SELECT id, name FROM locations"))
        locations = {row.name.lower(): row.id for row in result.fetchall()}

        imported = 0
        import_errors = list(errors)

        for row in valid_rows:
            try:
                location_id = None
                if row["location_name"]:
                    location_id = locations.get(row["location_name"].lower())

                assigned_to = None
                if row["assigned_to"]:
                    try:
                        assigned_uuid = uuid.UUID(row["assigned_to"])
                        res = await session.execute(
                            text("SELECT id FROM users WHERE id = :id AND role = 'cleaner'"),
                            {"id": assigned_uuid}
                        )
                        if res.fetchone():
                            assigned_to = assigned_uuid
                    except ValueError:
                        pass

                await session.execute(
                    text("""
                        INSERT INTO tasks
                            (id, title, description, status, country, location_id,
                             assigned_to, priority, rrule, is_recurring, created_at)
                        VALUES
                            (:id, :title, :desc, 'pending', :country, :loc_id,
                             :assigned, :priority, :rrule, :is_recurring, :now)
                    """),
                    {
                        "id": uuid.uuid4(),
                        "title": row["title"],
                        "desc": row["description"],
                        "country": row["country"],
                        "loc_id": location_id,
                        "assigned": assigned_to,
                        "priority": row["priority"],
                        "rrule": row["rrule"],
                        "is_recurring": bool(row["rrule"]),
                        "now": datetime.utcnow(),
                    }
                )
                imported += 1
            except Exception as e:
                import_errors.append(f"Row insert error: {str(e)}")

        await session.commit()

    return func.HttpResponse(
        json.dumps({
            "imported": imported,
            "total_rows": len(rows),
            "errors": import_errors,
        }),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="import/template", methods=["GET"])
async def download_template(req: func.HttpRequest) -> func.HttpResponse:
    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    df = pd.DataFrame([
        {
            "title": "Clean Room 101",
            "country": "DE",
            "description": "Daily cleaning",
            "priority": "normal",
            "assigned_to": "",
            "location_name": "Room 101",
            "rrule": "",
        },
        {
            "title": "Vacuum carpets",
            "country": "NL",
            "description": "",
            "priority": "high",
            "assigned_to": "",
            "location_name": "Floor A",
            "rrule": "FREQ=WEEKLY;BYDAY=MO",
        },
    ])

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        df.to_excel(writer, index=False, sheet_name="Tasks")

    return func.HttpResponse(
        body=buffer.getvalue(),
        status_code=200,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": "attachment; filename=import_template.xlsx"}
    )
