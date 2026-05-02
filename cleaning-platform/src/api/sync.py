import azure.functions as func
import logging
import json
import uuid
from datetime import datetime

from sqlalchemy import text

from src.infrastructure.database.connection import AsyncSessionLocal
from src.infrastructure.auth.middleware import get_current_user, AuthError
from src.infrastructure.messaging.rabbitmq import publish_task_status_changed

bp = func.Blueprint()


@bp.route(route="sync/batch", methods=["POST"])
async def batch_sync(req: func.HttpRequest) -> func.HttpResponse:
    logging.info("Batch sync request")

    try:
        user = get_current_user(req)
    except AuthError as e:
        return func.HttpResponse(
            json.dumps({"error": e.message}),
            status_code=e.status_code,
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

    changes = body.get("changes", [])
    if not changes:
        return func.HttpResponse(
            json.dumps({"synced": 0, "errors": []}),
            status_code=200,
            mimetype="application/json"
        )

    synced = 0
    errors = []

    async with AsyncSessionLocal() as session:
        for change in changes:
            try:
                change_type = change.get("type")
                task_id = change.get("task_id")
                client_timestamp = change.get("timestamp")

                if not task_id or not change_type:
                    errors.append({"change": change, "error": "Missing task_id or type"})
                    continue

                try:
                    task_uuid = uuid.UUID(task_id)
                except ValueError:
                    errors.append({"task_id": task_id, "error": "Invalid task ID"})
                    continue

                result = await session.execute(
                    text("SELECT * FROM tasks WHERE id = :id"),
                    {"id": task_uuid}
                )
                task = result.fetchone()

                if not task:
                    errors.append({"task_id": task_id, "error": "Task not found"})
                    continue

                if str(task.assigned_to) != user["sub"]:
                    errors.append({"task_id": task_id, "error": "Access denied"})
                    continue

                if change_type == "status_change":
                    new_status = change.get("status")
                    if not new_status:
                        errors.append({"task_id": task_id, "error": "Missing status"})
                        continue

                    allowed = ["pending", "in_progress", "completed", "on_hold"]
                    if new_status not in allowed:
                        errors.append({"task_id": task_id, "error": f"Invalid status: {new_status}"})
                        continue

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

                    await publish_task_status_changed(
                        task_id=task_id,
                        title=task.title,
                        old_status=old_status,
                        new_status=new_status,
                        assigned_to=str(task.assigned_to) if task.assigned_to else None,
                    )

                    synced += 1

            except Exception as e:
                logging.error(f"Error syncing change {change}: {e}")
                errors.append({"change": change, "error": str(e)})

        await session.commit()

    return func.HttpResponse(
        json.dumps({"synced": synced, "errors": errors}),
        status_code=200,
        mimetype="application/json"
    )
