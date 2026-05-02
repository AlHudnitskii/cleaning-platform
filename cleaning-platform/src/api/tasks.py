import azure.functions as func
import aiohttp
import logging
import json
import uuid
from datetime import datetime

from pydantic import ValidationError
from sqlalchemy import text

from src.api.events import broadcast_event
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.database.models import Task
from src.infrastructure.blob.storage import upload_photo, get_photos_for_task
from src.infrastructure.messaging.rabbitmq import publish_task_created, publish_task_status_changed
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
            rrule=task_data.rrule,
            is_recurring=bool(task_data.rrule),
            scheduled_for=task_data.scheduled_for,
            priority=task_data.priority,
            created_at=datetime.utcnow()
        )
        session.add(task)
        await session.commit()
        await session.refresh(task)

    await publish_task_created(
        task_id=str(task.id),
        title=task.title,
        country=task.country,
        assigned_to=str(task.assigned_to) if task.assigned_to else None,
        location_id=str(task.location_id) if task.location_id else None,
    )

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

    try:
        page = int(req.params.get("page", 1))
        limit = int(req.params.get("limit", 10))
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "page and limit must be integers"}),
            status_code=400,
            mimetype="application/json"
        )

    limit = min(limit, 100)
    offset = (page - 1) * limit

    status_filter = req.params.get("status")
    country_filter = req.params.get("country")
    location_id_filter = req.params.get("location_id")
    priority_filter = req.params.get("priority")
    date_from = req.params.get("date_from")
    date_to = req.params.get("date_to")

    conditions = []
    params = {}

    if user["role"] == UserRole.CLEANER:
        conditions.append("assigned_to = :user_id")
        params["user_id"] = uuid.UUID(user["sub"])
    elif user["role"] == UserRole.MANAGER:
        conditions.append("country = :country")
        params["country"] = user["country"]
    else:
        if country_filter:
            conditions.append("country = :country")
            params["country"] = country_filter.upper()

    if status_filter:
        conditions.append("status = :status")
        params["status"] = status_filter

    if priority_filter:
        conditions.append("priority = :priority")
        params["priority"] = priority_filter

    if location_id_filter:
        conditions.append("location_id = :location_id")
        params["location_id"] = uuid.UUID(location_id_filter)

    if date_from:
        conditions.append("created_at >= :date_from")
        params["date_from"] = date_from

    if date_to:
        conditions.append("created_at <= :date_to")
        params["date_to"] = date_to

    where_clause = "WHERE " + " AND ".join(conditions) if conditions else ""

    async with AsyncSessionLocal() as session:
        count_result = await session.execute(
            text(f"SELECT COUNT(*) FROM tasks {where_clause}"),
            params
        )
        total = count_result.scalar()

        params["limit"] = limit
        params["offset"] = offset
        result = await session.execute(
            text(f"""
                SELECT * FROM tasks {where_clause}
                ORDER BY created_at DESC
                LIMIT :limit OFFSET :offset
            """),
            params
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
            assigned_to=row.assigned_to,
            rrule=row.rrule,
            is_recurring=row.is_recurring,
            priority=row.priority,
            created_at=row.created_at
        ).model_dump_json())
        for row in tasks
    ]

    return func.HttpResponse(
        json.dumps({
            "data": tasks_list,
            "pagination": {
                "page": page,
                "limit": limit,
                "total": total,
                "pages": (total + limit - 1) // limit
            }
        }),
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
        rrule=task.rrule,
        is_recurring=task.is_recurring,
        priority=task.priority,
        quality_score=task.quality_score,
        quality_comment=task.quality_comment,
        quality_reviewed_by=task.quality_reviewed_by,
        quality_reviewed_at=task.quality_reviewed_at,
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

    try:
        body = req.get_json()
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid JSON"}),
            status_code=400,
            mimetype="application/json"
        )

    new_status = body.get("status")
    allowed_statuses = ["pending", "in_progress", "on_review", "completed", "on_hold", "cancelled"]

    if new_status not in allowed_statuses:
        return func.HttpResponse(
            json.dumps({"error": f"Status must be one of {allowed_statuses}"}),
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

        old_status = task.status

        await session.execute(
            text("UPDATE tasks SET status = :status WHERE id = :id"),
            {"status": new_status, "id": task_uuid}
        )

        await session.execute(
            text("""
                INSERT INTO task_status_history
                    (id, task_id, old_status, new_status, changed_by, changed_at)
                VALUES
                    (:id, :task_id, :old_status, :new_status, :changed_by, :changed_at)
            """),
            {
                "id": uuid.uuid4(),
                "task_id": task_uuid,
                "old_status": old_status,
                "new_status": new_status,
                "changed_by": uuid.UUID(user["sub"]),
                "changed_at": datetime.utcnow()
            }
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM tasks WHERE id = :id"),
            {"id": task_uuid}
        )
        task = result.fetchone()

    try:
        async with aiohttp.ClientSession() as http_session:
            await http_session.post(
                "http://localhost:8080/events/broadcast",
                json={
                    "type": "task_status_changed",
                    "data": {
                        "task_id": task_id,
                        "new_status": new_status,
                        "old_status": old_status,
                        "changed_by": user["email"]
                    },
                    "exclude_user": user["sub"]
                }
            )
    except Exception as e:
        logging.error(f"SSE broadcast failed: {e}")

    await publish_task_status_changed(
        task_id=task_id,
        title=task.title,
        old_status=old_status,
        new_status=new_status,
        assigned_to=str(task.assigned_to) if task.assigned_to else None,
    )

    response = TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        country=task.country,
        location_id=task.location_id,
        assigned_to=task.assigned_to,
        rrule=task.rrule,
        is_recurring=task.is_recurring,
        priority=task.priority,
        created_at=task.created_at
    )
    return func.HttpResponse(
        response.model_dump_json(),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="locations/{location_id}/tasks", methods=["GET"])
async def get_tasks_by_location(req: func.HttpRequest) -> func.HttpResponse:
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
        json.dumps({"id": str(photo_id), "task_id": task_id, "url": url, "filename": filename}),
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


@bp.route(route="tasks/{task_id}/history", methods=["GET"])
async def get_task_history(req: func.HttpRequest) -> func.HttpResponse:
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
            text("""
                SELECT h.*, u.email as changed_by_email
                FROM task_status_history h
                LEFT JOIN users u ON h.changed_by = u.id
                WHERE h.task_id = :task_id
                ORDER BY h.changed_at ASC
            """),
            {"task_id": task_uuid}
        )
        history = result.fetchall()

    history_list = [
        {
            "id": str(row.id),
            "task_id": str(row.task_id),
            "old_status": row.old_status,
            "new_status": row.new_status,
            "changed_by": str(row.changed_by) if row.changed_by else None,
            "changed_by_email": row.changed_by_email,
            "changed_at": row.changed_at.isoformat()
        }
        for row in history
    ]

    return func.HttpResponse(
        json.dumps(history_list),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}/occurrences", methods=["GET"])
async def get_task_occurrences(req: func.HttpRequest) -> func.HttpResponse:
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
            json.dumps({"error": "Invalid task ID"}),
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

    if not task.rrule:
        return func.HttpResponse(
            json.dumps({"error": "Task is not recurring"}),
            status_code=400,
            mimetype="application/json"
        )

    from src.domain.services.recurring_tasks import get_next_occurrences
    occurrences = get_next_occurrences(task.rrule, count=10)

    return func.HttpResponse(
        json.dumps({
            "task_id": task_id,
            "rrule": task.rrule,
            "next_occurrences": [o.isoformat() for o in occurrences]
        }),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}/comments", methods=["POST"])
async def add_comment(req: func.HttpRequest) -> func.HttpResponse:
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
            json.dumps({"error": "Invalid task ID"}),
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

    comment_text = body.get("text", "").strip()
    if not comment_text:
        return func.HttpResponse(
            json.dumps({"error": "Comment text is required"}),
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

        comment_id = uuid.uuid4()
        await session.execute(
            text("""
                INSERT INTO task_comments (id, task_id, user_id, text, created_at)
                VALUES (:id, :task_id, :user_id, :text, :created_at)
            """),
            {
                "id": comment_id,
                "task_id": task_uuid,
                "user_id": uuid.UUID(user["sub"]),
                "text": comment_text,
                "created_at": datetime.utcnow()
            }
        )
        await session.commit()

        result = await session.execute(
            text("""
                SELECT c.*, u.email as user_email, u.role as user_role
                FROM task_comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.id = :id
            """),
            {"id": comment_id}
        )
        comment = result.fetchone()

    return func.HttpResponse(
        json.dumps({
            "id": str(comment.id),
            "task_id": str(comment.task_id),
            "user_id": str(comment.user_id),
            "user_email": comment.user_email,
            "user_role": comment.user_role,
            "text": comment.text,
            "created_at": comment.created_at.isoformat()
        }),
        status_code=201,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}/comments", methods=["GET"])
async def get_comments(req: func.HttpRequest) -> func.HttpResponse:
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
            json.dumps({"error": "Invalid task ID"}),
            status_code=400,
            mimetype="application/json"
        )

    async with AsyncSessionLocal() as session:
        result = await session.execute(
            text("""
                SELECT c.*, u.email as user_email, u.role as user_role
                FROM task_comments c
                JOIN users u ON c.user_id = u.id
                WHERE c.task_id = :task_id
                ORDER BY c.created_at ASC
            """),
            {"task_id": task_uuid}
        )
        comments = result.fetchall()

    comments_list = [
        {
            "id": str(row.id),
            "task_id": str(row.task_id),
            "user_id": str(row.user_id),
            "user_email": row.user_email,
            "user_role": row.user_role,
            "text": row.text,
            "created_at": row.created_at.isoformat()
        }
        for row in comments
    ]

    return func.HttpResponse(
        json.dumps(comments_list),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="tasks/{task_id}/quality", methods=["POST"])
async def review_quality(req: func.HttpRequest) -> func.HttpResponse:
    task_id = req.route_params.get("task_id")

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
            json.dumps({"error": "Only admin and manager can review quality"}),
            status_code=403,
            mimetype="application/json"
        )

    try:
        task_uuid = uuid.UUID(task_id)
    except ValueError:
        return func.HttpResponse(
            json.dumps({"error": "Invalid task ID"}),
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

    try:
        from src.domain.models.task import QualityReview
        review = QualityReview(**body)
    except Exception as e:
        return func.HttpResponse(
            json.dumps({"error": str(e)}),
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

        if task.status != "completed":
            return func.HttpResponse(
                json.dumps({"error": "Can only review completed tasks"}),
                status_code=400,
                mimetype="application/json"
            )

        await session.execute(
            text("""
                UPDATE tasks SET
                    quality_score = :score,
                    quality_comment = :comment,
                    quality_reviewed_by = :reviewed_by,
                    quality_reviewed_at = :reviewed_at
                WHERE id = :id
            """),
            {
                "score": review.score,
                "comment": review.comment,
                "reviewed_by": uuid.UUID(user["sub"]),
                "reviewed_at": datetime.utcnow(),
                "id": task_uuid
            }
        )
        await session.commit()

        result = await session.execute(
            text("SELECT * FROM tasks WHERE id = :id"),
            {"id": task_uuid}
        )
        task = result.fetchone()

    response = TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        status=task.status,
        country=task.country,
        location_id=task.location_id,
        assigned_to=task.assigned_to,
        rrule=task.rrule,
        is_recurring=task.is_recurring,
        scheduled_for=task.scheduled_for,
        priority=task.priority,
        quality_score=task.quality_score,
        quality_comment=task.quality_comment,
        quality_reviewed_by=task.quality_reviewed_by,
        quality_reviewed_at=task.quality_reviewed_at,
        created_at=task.created_at
    )

    return func.HttpResponse(
        response.model_dump_json(),
        status_code=200,
        mimetype="application/json"
    )
