import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.database.models import Task
from src.domain.models.task import TaskCreate, TaskResponse

bp = func.Blueprint()


@bp.route(route="tasks", methods=["POST"])
async def create_task(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Creating new task")

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    try:
        task_data = TaskCreate(**body)
    except ValidationError as e:
        return func.HttpResponse(
            json.dumps({"error": e.errors()}, default=str),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        if task_data.location_id:
            result = await session.execute(
                text("SELECT id, country FROM locations WHERE id = :id"),
                {"id": task_data.location_id}
            )
            location = result.fetchone()
            if not location:
                return func.HttpResponse(
                    json.dumps({"error": "Location not found"}),
                    status_code=404,
                    mimetype="application/json"
                )
            task_data.country = location.country

        task = Task(
            id=uuid.uuid4(),
            title=task_data.title,
            description=task_data.description,
            status="pending",
            country=task_data.country,
            location_id=task_data.location_id,
            created_at=datetime.utcnow()
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)

    response = TaskResponse.model_validate(task)
    return func.HttpResponse(
        response.model_dump_json(),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="tasks", methods=["GET"])
async def get_tasks(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Getting all tasks")

    country = req.params.get("country")

    async with AsyncSessionLocal() as session:
        if country:
            result = await session.execute(
                text("SELECT * FROM tasks WHERE country = :country"),
                {"country": country.upper()}
            )
        else:
            result = await session.execute(text("SELECT * FROM tasks"))
        tasks = result.fetchall()

    tasks_list = [
        json.loads(TaskResponse(
            id=row.id,
            title=row.title,
            description=row.description,
            status=row.status,
            country=row.country,
            location_id=row.location_id,
            created_at=row.created_at
        ).model_dump_json())
        for row in tasks
    ]

    return func.HttpResponse(
        json.dumps(tasks_list),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}", methods=["GET"])
async def get_task(req: func.HttpRequest) -> func.HttpResponse:
    task_id = req.route_params.get("task_id")

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid task ID format"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT * FROM tasks WHERE id = :id"),
            {"id": task_uuid}
        )
        task = result.fetchone()

    if not task:
        return func.HttpResponse(
            json.dumps({"error": "Task not found"}),
            status_code=404,
            mimetype="application/json"
        )

    response = TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        country=task.country,
        location_id=task.location_id,
        created_at=task.created_at
    )
    return func.HttpResponse(
        response.model_dump_json(),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}/status", methods=["PATCH"])
async def update_task_status(req: func.HttpRequest) -> func.HttpResponse:
    task_id = req.route_params.get("task_id")

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid task ID format"}),
            status_code=400,
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

    new_status = body.get("status")
    allowed_statuses = ["pending", "in_progress", "completed"]

    if new_status not in allowed_statuses:
        return func.HttpResponse(
            json.dumps({"error": f"Status must be one of {allowed_statuses}"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("UPDATE tasks SET status = :status WHERE id = :id RETURNING *"),
            {"status": new_status, "id": task_uuid}
        )
        task = result.fetchone()
        await session.commit()

    if not task:
        return func.HttpResponse(
            json.dumps({"error": "Task not found"}),
            status_code=404,
            mimetype="application/json"
        )

    response = TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        country=task.country,
        location_id=task.location_id,
        created_at=task.created_at
    )
    return func.HttpResponse(
        response.model_dump_json(),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="locations/{location_id}/tasks", methods=["GET"])
async def get_tasks_by_location(req: func.HttpRequest) -> func.HttpResponse:
    """Получить все задачи по локации И её потомкам через ltree"""
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
            text("""
                SELECT t.* FROM tasks t
                JOIN locations l ON t.location_id = l.id
                WHERE l.path <@ :path
            """),
            {"path": location.path}
        )
        tasks = result.fetchall()

    tasks_list = [
        json.loads(TaskResponse(
            id=row.id,
            title=row.title,
            description=row.description,
            status=row.status,
            country=row.country,
            location_id=row.location_id,
            created_at=row.created_at
        ).model_dump_json())
        for row in tasks
    ]

    return func.HttpResponse(
        json.dumps(tasks_list),
        status_code=200,
        mimetype="application/json"
    )
