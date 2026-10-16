import json
from functools import lru_cache
from typing import Any

import azure.functions as func
from pydantic import BaseModel

from src.domain.models.location import LocationCreate, LocationResponse
from src.domain.models.task import (
    ChecklistItemCreate,
    ChecklistItemResponse,
    ChecklistItemUpdate,
    CommentCreate,
    CommentResponse,
    HistoryEntryResponse,
    PhotoResponse,
    QualityReview,
    SyncStatusChange,
    TaskCreate,
    TaskResponse,
    TaskStatusUpdate,
    TaskUpdate,
)
from src.domain.models.user import (
    AssigneeResponse,
    PasswordChange,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
)

bp = func.Blueprint()

SCHEMAS: list[type[BaseModel]] = [
    AssigneeResponse,
    CommentCreate,
    CommentResponse,
    HistoryEntryResponse,
    LocationCreate,
    LocationResponse,
    PasswordChange,
    PhotoResponse,
    QualityReview,
    SyncStatusChange,
    TaskCreate,
    TaskResponse,
    TaskStatusUpdate,
    TaskUpdate,
    ChecklistItemCreate,
    ChecklistItemUpdate,
    ChecklistItemResponse,
    TokenResponse,
    UserLogin,
    UserRegister,
    UserResponse,
]

PATH_PARAMS = {
    "task_id": "Task ID",
    "location_id": "Location ID",
    "user_id": "User ID",
    "item_id": "Checklist item ID",
}

CHECKLIST = "/tasks/{task_id}/checklist"
CHECKLIST_ITEM = "/tasks/{task_id}/checklist/{item_id}"

ROUTES: list[tuple[str, str, str, str | None, str | None, bool]] = [
    ("post", "/auth/login", "Sign in; sets the refresh_token cookie", "UserLogin", "TokenResponse", False),
    ("post", "/auth/refresh", "Rotate the session using the refresh_token cookie", None, "TokenResponse", False),
    ("post", "/auth/logout", "Revoke all sessions of the cookie owner", None, None, False),
    ("get", "/auth/me", "Current user", None, "UserResponse", True),
    ("get", "/users", "List users (admin)", None, "UserResponse", True),
    ("post", "/users", "Create a user (admin)", "UserRegister", "UserResponse", True),
    ("get", "/users/assignees", "Active cleaners available for assignment", None, "AssigneeResponse", True),
    ("patch", "/users/{user_id}/toggle-active", "Activate or deactivate a user (admin)", None, "UserResponse", True),
    ("patch", "/users/me/password", "Change own password", "PasswordChange", "TokenResponse", True),
    ("get", "/tasks", "List tasks visible to the caller", None, "TaskResponse", True),
    ("post", "/tasks", "Create a task (admin, manager)", "TaskCreate", "TaskResponse", True),
    ("get", "/tasks/{task_id}", "Task details", None, "TaskResponse", True),
    ("patch", "/tasks/{task_id}", "Edit a task (admin, manager)", "TaskUpdate", "TaskResponse", True),
    ("delete", "/tasks/{task_id}", "Delete a task with its comments, history and photos", None, None, True),
    ("patch", "/tasks/{task_id}/status", "Change task status", "TaskStatusUpdate", "TaskResponse", True),
    ("post", "/tasks/{task_id}/quality", "Review quality of a completed task", "QualityReview", "TaskResponse", True),
    ("get", "/tasks/{task_id}/occurrences", "Next occurrences of a recurring task", None, None, True),
    ("get", CHECKLIST, "Checklist of a task", None, "ChecklistItemResponse", True),
    ("post", CHECKLIST, "Add a checklist item (admin, manager)", "ChecklistItemCreate", "ChecklistItemResponse", True),
    ("patch", CHECKLIST_ITEM, "Tick or rename a checklist item", "ChecklistItemUpdate", "ChecklistItemResponse", True),
    ("delete", CHECKLIST_ITEM, "Remove a checklist item (admin, manager)", None, None, True),
    ("get", "/tasks/{task_id}/comments", "Task comments", None, "CommentResponse", True),
    ("post", "/tasks/{task_id}/comments", "Add a comment", "CommentCreate", "CommentResponse", True),
    ("get", "/tasks/{task_id}/history", "Status history", None, "HistoryEntryResponse", True),
    ("get", "/tasks/{task_id}/photos", "Task photos", None, "PhotoResponse", True),
    (
        "post",
        "/tasks/{task_id}/photos",
        "Upload a JPEG/PNG/WebP photo (form field 'photo')",
        None,
        "PhotoResponse",
        True,
    ),
    ("get", "/locations", "Locations visible to the caller", None, "LocationResponse", True),
    ("post", "/locations", "Create a location (admin)", "LocationCreate", "LocationResponse", True),
    ("get", "/locations/{location_id}/children", "Descendants of a location", None, "LocationResponse", True),
    ("get", "/locations/{location_id}/tasks", "Tasks in a location subtree", None, "TaskResponse", True),
    ("get", "/stats/dashboard", "Dashboard statistics", None, None, True),
    ("get", "/stats/reports", "Period report", None, None, True),
    ("post", "/import/tasks", "Import tasks from CSV/XLSX (form field 'file')", None, None, True),
    ("get", "/import/template", "Download the import template", None, None, True),
    ("get", "/export/tasks", "Export tasks as Excel or Parquet", None, None, True),
    ("post", "/sync/batch", "Apply offline status changes", None, None, True),
    ("get", "/push/vapid-public-key", "VAPID public key", None, None, False),
    ("post", "/push/subscribe", "Subscribe to push notifications", None, None, True),
    ("delete", "/push/unsubscribe", "Remove own push subscriptions", None, None, True),
]


def ref(name: str) -> dict[str, str]:
    return {"$ref": f"#/components/schemas/{name}"}


def operation(path: str, summary: str, request: str | None, response: str | None, secured: bool) -> dict[str, Any]:
    op: dict[str, Any] = {"summary": summary, "responses": {"200": {"description": "OK"}}}
    if response:
        op["responses"]["200"]["content"] = {"application/json": {"schema": ref(response)}}
    if request:
        op["requestBody"] = {"required": True, "content": {"application/json": {"schema": ref(request)}}}
    params = [name for name in PATH_PARAMS if "{" + name + "}" in path]
    if params:
        op["parameters"] = [
            {
                "name": name,
                "in": "path",
                "required": True,
                "description": PATH_PARAMS[name],
                "schema": {"type": "string", "format": "uuid"},
            }
            for name in params
        ]
    if secured:
        op["security"] = [{"BearerAuth": []}]
    return op


@lru_cache
def openapi_spec() -> dict[str, Any]:
    schemas: dict[str, Any] = {}
    for model in SCHEMAS:
        schema = model.model_json_schema(ref_template="#/components/schemas/{model}")
        schemas.update(schema.pop("$defs", {}))
        schemas[model.__name__] = schema

    paths: dict[str, Any] = {}
    for method, path, summary, request, response, secured in ROUTES:
        paths.setdefault(path, {})[method] = operation(path, summary, request, response, secured)

    return {
        "openapi": "3.1.0",
        "info": {"title": "Cleaning Platform API", "version": "2.0.0"},
        "servers": [{"url": "/api"}],
        "components": {
            "securitySchemes": {"BearerAuth": {"type": "http", "scheme": "bearer", "bearerFormat": "JWT"}},
            "schemas": schemas,
        },
        "paths": paths,
    }


@bp.route(route="docs/openapi.json", methods=["GET"])
async def openapi_json(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(json.dumps(openapi_spec(), ensure_ascii=False), mimetype="application/json")


SWAGGER_HTML = """<!DOCTYPE html>
<html>
<head>
    <title>Cleaning Platform API</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
<script>
    SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis],
        persistAuthorization: true
    })
</script>
</body>
</html>"""


@bp.route(route="docs", methods=["GET"])
async def swagger_ui(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(SWAGGER_HTML, mimetype="text/html")
