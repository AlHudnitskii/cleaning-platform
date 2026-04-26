import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import text

from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.database.models import Task
from src.infrastructure.blob.storage import upload_photo, get_photos_for_task
from src.infrastructure.messaging.rabbitmq import publish_message
from src.domain.models.enums import UserRole
from src.domain.models.task import TaskCreate, TaskResponse

bp = func.Blueprint()


@bp.route(route="tasks", methods=["POST"])
async def create_task(req: func.HttpRequest) -> func.HttpResponse:
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
            assigned_to=task_data.assigned_to,
            created_at=datetime.utcnow()
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)


    await publish_message("task.created", {
        "task_id": str(task.id),
        "title": task.title,
        "status": task.status,
        "country": task.country,
        "location_id": str(task.location_id) if task.location_id else None,
        "created_at": task.created_at.isoformat()
    })

    response = TaskResponse.model_validate(task)
    return func.HttpResponse(
        response.model_dump_json(),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="tasks", methods=["GET"])
async def get_tasks(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Getting all tasks")

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

    country = req.params.get("country")

    async with AsyncSessionLocal() as session:
        if user["role"] == UserRole.CLEANER:
            result = await session.execute(
                text("SELECT * FROM tasks WHERE assigned_to = :user_id"),
                {"user_id": uuid.UUID(user["sub"])}
            )
        elif user["role"] == UserRole.MANAGER:
            result = await session.execute(
                text("SELECT * FROM tasks WHERE country = :country"),
                {"country": user["country"]}
            )
        else:
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
            assigned_to=row.assigned_to,
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
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
            mimetype="application/json"
        )

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

    if user["role"] == UserRole.CLEANER:
        if str(task.assigned_to) != user["sub"]:
            return func.HttpResponse(
                json.dumps({"error": "Access denied"}),
                status_code=403,
                mimetype="application/json"
            )

    response = TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        country=task.country,
        location_id=task.location_id,
        assigned_to=task.assigned_to,
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
            text("UPDATE tasks SET status = :status WHERE id = :id"),
            {"status": new_status, "id": task_uuid}
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM tasks WHERE id = :id"),
            {"id": task_uuid}
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
        assigned_to=task.assigned_to if hasattr(task, 'assigned_to') else None,
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


@bp.route(route="tasks/{task_id}/photos", methods=["POST"])
async def upload_task_photo(req: func.HttpRequest) -> func.HttpResponse:
    task_id = req.route_params.get("task_id")

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid task ID"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT id FROM tasks WHERE id = :id"),
            {"id": task_uuid}
        )
        if not result.fetchone():
            return func.HttpResponse(
                json.dumps({"error": "Task not found"}),
                status_code=404,
                mimetype="application/json"
            )

    files = req.files
    if "photo" not in files:
        return func.HttpResponse(
            json.dumps({"error": "No photo file provided. Use form-data with key 'photo'"}),
            status_code=400,
            mimetype="application/json"
        )

    photo = files["photo"]
    filename = photo.filename
    data = photo.read()
    content_type = photo.content_type or "image/jpeg"

    url = await upload_photo(task_id, filename, data, content_type)

    photo_id = uuid.uuid4()
    async with AsyncSessionLocal() as session:
        await session.execute(
            text("""
                INSERT INTO task_photos (id, task_id, url, filename, uploaded_at)
                VALUES (:id, :task_id, :url, :filename, :uploaded_at)
            """),
            {
                "id": photo_id,
                "task_id": task_uuid,
                "url": url,
                "filename": filename,
                "uploaded_at": datetime.utcnow()
            }
        )
        await session.commit()

    return func.HttpResponse(
        json.dumps({
            "id": str(photo_id),
            "task_id": task_id,
            "url": url,
            "filename": filename
        }),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}/photos", methods=["GET"])
async def get_task_photos(req: func.HttpRequest) -> func.HttpResponse:
    task_id = req.route_params.get("task_id")

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid task ID"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("SELECT * FROM task_photos WHERE task_id = :task_id ORDER BY uploaded_at DESC"),
            {"task_id": task_uuid}
        )
        photos = result.fetchall()

    photos_list = [
        {
            "id": str(row.id),
            "task_id": str(row.task_id),
            "url": row.url,
            "filename": row.filename,
            "uploaded_at": row.uploaded_at.isoformat()
        }
        for row in photos
    ]

    return func.HttpResponse(
        json.dumps(photos_list),
        status_code=200,
        mimetype="application/json"
    )
