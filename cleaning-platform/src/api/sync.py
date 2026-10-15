from typing import Any

import azure.functions as func
from pydantic import ValidationError

from src.api.http import ApiError, authenticated, json_response, read_json, validation_details
from src.api.task_store import change_status, last_status_change, load_visible_task
from src.domain.models.task import SyncStatusChange
from src.domain.models.user import CurrentUser
from src.infrastructure.database.connection import session_scope

bp = func.Blueprint()

MAX_CHANGES = 200


def sync_error(change: Any, message: str) -> dict[str, Any]:
    task_id = change.get("task_id") if isinstance(change, dict) else None
    return {"task_id": str(task_id) if task_id else None, "error": message}


@bp.route(route="sync/batch", methods=["POST"])
@authenticated()
async def batch_sync(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    changes = read_json(req).get("changes", [])
    if not isinstance(changes, list):
        raise ApiError(400, "changes must be a list")
    if len(changes) > MAX_CHANGES:
        raise ApiError(400, f"At most {MAX_CHANGES} changes per batch")

    synced = 0
    errors: list[dict[str, Any]] = []

    async with session_scope() as session, session.begin():
        for raw in changes:
            try:
                change = SyncStatusChange.model_validate(raw)
            except ValidationError as e:
                details = "; ".join(f"{d['field']}: {d['message']}" for d in validation_details(e))
                errors.append(sync_error(raw, details))
                continue

            try:
                async with session.begin_nested():
                    task = await load_visible_task(session, user, change.task_id, for_update=True)
                    last_change = await last_status_change(session, task.id)
                    if change.timestamp and last_change and last_change > change.timestamp:
                        raise ApiError(409, "Task was changed on the server after this offline change")
                    change_status(session, user, task, change.status)
            except ApiError as e:
                errors.append(sync_error(raw, e.message))
                continue
            synced += 1

    return json_response({"synced": synced, "errors": errors})
