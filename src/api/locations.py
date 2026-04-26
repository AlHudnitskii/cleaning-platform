import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import text

from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.database.connection import AsyncSessionLocal
from src.domain.models.enums import UserRole
from src.domain.models.location import LocationCreate, LocationResponse

bp = func.Blueprint()


def build_path(parent_path: str | None, name: str) -> str:
    safe_name = name.replace(" ", "_").replace("-", "_")
    if parent_path:
        return f"{parent_path}.{safe_name}"
    return safe_name


@bp.route(route="locations", methods=["POST"])
async def create_location(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Creating new location")

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    if user["role"] != UserRole.ADMIN:
        return func.HttpResponse(
            json.dumps({"error": "Only admins can create locations"}),
            status_code=403,
            mimetype="application/json"
        )

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    try:
        location_data = LocationCreate(**body)
    except ValidationError as e:
        return func.HttpResponse(
            json.dumps({"error": e.errors()}, default=str),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        parent_path = None
        if location_data.parent_id:
            result = await session.execute(
                text("SELECT path FROM locations WHERE id = :id"),
                {"id": location_data.parent_id}
            )
            parent = result.fetchone()
            if not parent:
                return func.HttpResponse(
                    json.dumps({"error": "Parent location not found"}),
                    status_code=404,
                    mimetype="application/json"
                )
            parent_path = parent.path

        path = build_path(parent_path, location_data.name)
        location_id = uuid.uuid4()

        await session.execute(
            text("""
                INSERT INTO locations (id, name, country, path, level, parent_id, created_at)
                VALUES (:id, :name, :country, :path, :level, :parent_id, :created_at)
            """),
            {
                "id": location_id,
                "name": location_data.name,
                "country": location_data.country,
                "path": path,
                "level": location_data.level,
                "parent_id": location_data.parent_id,
                "created_at": datetime.utcnow()
            }
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM locations WHERE id = :id"),
            {"id": location_id}
        )
        location = result.fetchone()

    response = LocationResponse(
        id=location.id,
        name=location.name,
        country=location.country,
        path=str(location.path),
        level=location.level,
        parent_id=location.parent_id,
        created_at=location.created_at
    )

    return func.HttpResponse(
        response.model_dump_json(),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="locations/{location_id}/children", methods=["GET"])
async def get_children(req: func.HttpRequest) -> func.HttpResponse:
    location_id = req.route_params.get("location_id")

    try:
        location_uuid = uuid.UUID(location_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid location ID"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT path FROM locations WHERE id = :id"),
            {"id": location_uuid}
        )
        location = result.fetchone()

        if not location:
            return func.HttpResponse(
                json.dumps({"error": "Location not found"}),
                status_code=404,
                mimetype="application/json"
            )

        result = await session.execute(
            text("SELECT * FROM locations WHERE path <@ :path AND path != :path"),
            {"path": location.path}
        )
        children = result.fetchall()

    children_list = [
        json.loads(LocationResponse(
            id=row.id,
            name=row.name,
            country=row.country,
            path=str(row.path),
            level=row.level,
            parent_id=row.parent_id,
            created_at=row.created_at
        ).model_dump_json())
        for row in children
    ]

    return func.HttpResponse(
        json.dumps(children_list),
        status_code=200,
        mimetype="application/json"
    )
