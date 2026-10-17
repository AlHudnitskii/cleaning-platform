from typing import Any

import azure.functions as func
from pydantic import ValidationError

from src.api.http import ApiError, authenticated, json_response, read_json, request_locale, validation_details
from src.api.schemas.task import SyncStatusChange
from src.api.task_queries import last_status_change, load_visible_task
from src.api.task_workflow import change_status
from src.domain.models.user import CurrentUser
from src.infrastructure.database.connection import session_scope
from src.translations import phrases

bp = func.Blueprint()

MAX_CHANGES = 200


def sync_error(change: Any, message: str) -> dict[str, Any]:
    task_id = change.get("task_id") if isinstance(change, dict) else None
    return {"task_id": str(task_id) if task_id else None, "error": message}


@bp.route(route="sync/batch", methods=["POST"])
@authenticated()
async def batch_sync(req: func.HttpRequest, user: CurrentUser) -> func.HttpResponse:
    locale = request_locale(req)
    changes = read_json(req).get("changes", [])
    if not isinstance(changes, list):
        raise ApiError(400, phrases.SYNC_NOT_A_LIST())
    if len(changes) > MAX_CHANGES:
        raise ApiError(400, phrases.SYNC_TOO_MANY(limit=MAX_CHANGES))

    synced = 0
    errors: list[dict[str, Any]] = []

    async with session_scope() as session, session.begin():
        for raw in changes:
            try:
                change = SyncStatusChange.model_validate(raw)
            except ValidationError as e:
                details = "; ".join(detail.message.render(locale) for detail in validation_details(e))
                errors.append(sync_error(raw, details))
                continue

            try:
                async with session.begin_nested():
                    task = await load_visible_task(session, user, change.task_id, for_update=True)
                    last_change = await last_status_change(session, task.id)
                    if change.timestamp and last_change and last_change > change.timestamp:
                        raise ApiError(409, phrases.SYNC_CONFLICT())
                    await change_status(session, user, task, change.status)
            except ApiError as e:
                errors.append(sync_error(raw, e.message.render(locale)))
                continue
            synced += 1

    return json_response({"synced": synced, "errors": errors})
