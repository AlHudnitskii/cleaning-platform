import azure.functions as func
import json

bp = func.Blueprint()

OPENAPI_SPEC = {
    "openapi": "3.0.0",
    "info": {
        "title": "Cleaning Platform API",
        "version": "1.0.0",
        "description": "API для управления клининговыми задачами"
    },
    "servers": [{"url": "http://localhost:7071/api"}],
    "components": {
        "securitySchemes": {
            "BearerAuth": {
                "type": "http",
                "scheme": "bearer",
                "bearerFormat": "JWT"
            }
        },
        "schemas": {
            "TaskCreate": {
                "type": "object",
                "required": ["title", "country"],
                "properties": {
                    "title": {"type": "string", "minLength": 3, "example": "Clean Room 301"},
                    "country": {"type": "string", "enum": ["DE", "DK", "IT", "AU"]},
                    "description": {"type": "string", "nullable": True},
                    "location_id": {"type": "string", "format": "uuid", "nullable": True},
                    "assigned_to": {"type": "string", "format": "uuid", "nullable": True}
                }
            },
            "TaskResponse": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "format": "uuid"},
                    "title": {"type": "string"},
                    "description": {"type": "string", "nullable": True},
                    "status": {"type": "string", "enum": ["pending", "in_progress", "completed"]},
                    "country": {"type": "string"},
                    "location_id": {"type": "string", "format": "uuid", "nullable": True},
                    "assigned_to": {"type": "string", "format": "uuid", "nullable": True},
                    "created_at": {"type": "string", "format": "date-time"}
                }
            },
            "LocationCreate": {
                "type": "object",
                "required": ["name", "country", "level"],
                "properties": {
                    "name": {"type": "string", "example": "Berlin"},
                    "country": {"type": "string", "enum": ["DE", "DK", "IT", "AU"]},
                    "level": {"type": "string", "enum": ["country", "city", "building", "floor", "room"]},
                    "parent_id": {"type": "string", "format": "uuid", "nullable": True}
                }
            },
            "UserRegister": {
                "type": "object",
                "required": ["email", "password", "role"],
                "properties": {
                    "email": {"type": "string", "format": "email"},
                    "password": {"type": "string", "minLength": 6},
                    "role": {"type": "string", "enum": ["admin", "manager", "cleaner"]},
                    "country": {"type": "string", "enum": ["DE", "DK", "IT", "AU"], "nullable": True}
                }
            },
            "TokenResponse": {
                "type": "object",
                "properties": {
                    "access_token": {"type": "string"},
                    "token_type": {"type": "string", "example": "bearer"},
                    "user": {"$ref": "#/components/schemas/UserResponse"}
                }
            },
            "UserResponse": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "format": "uuid"},
                    "email": {"type": "string"},
                    "role": {"type": "string"},
                    "country": {"type": "string", "nullable": True},
                    "created_at": {"type": "string", "format": "date-time"}
                }
            },
            "Error": {
                "type": "object",
                "properties": {
                    "error": {"type": "string"}
                }
            }
        }
    },
    "security": [{"BearerAuth": []}],
    "paths": {
        "/auth/register": {
            "post": {
                "tags": ["Auth"],
                "summary": "Регистрация пользователя",
                "security": [],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/UserRegister"}}}
                },
                "responses": {
                    "201": {"description": "Успешная регистрация", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/TokenResponse"}}}},
                    "400": {"description": "Ошибка валидации"},
                    "409": {"description": "Email уже занят"}
                }
            }
        },
        "/auth/login": {
            "post": {
                "tags": ["Auth"],
                "summary": "Вход в систему",
                "security": [],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "properties": {"email": {"type": "string"}, "password": {"type": "string"}}}}}
                },
                "responses": {
                    "200": {"description": "Успешный вход", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/TokenResponse"}}}},
                    "401": {"description": "Неверные данные"}
                }
            }
        },
        "/auth/me": {
            "get": {
                "tags": ["Auth"],
                "summary": "Текущий пользователь",
                "responses": {
                    "200": {"description": "Данные пользователя"},
                    "401": {"description": "Не авторизован"}
                }
            }
        },
        "/tasks": {
            "get": {
                "tags": ["Tasks"],
                "summary": "Список задач",
                "description": "Admin видит все, Manager — своей страны, Cleaner — только свои",
                "parameters": [
                    {"name": "country", "in": "query", "schema": {"type": "string"}, "description": "Фильтр по стране (только для Admin)"}
                ],
                "responses": {
                    "200": {"description": "Список задач", "content": {"application/json": {"schema": {"type": "array", "items": {"$ref": "#/components/schemas/TaskResponse"}}}}},
                    "401": {"description": "Не авторизован"}
                }
            },
            "post": {
                "tags": ["Tasks"],
                "summary": "Создать задачу",
                "description": "Доступно: Admin, Manager",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/TaskCreate"}}}
                },
                "responses": {
                    "201": {"description": "Задача создана", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/TaskResponse"}}}},
                    "400": {"description": "Ошибка валидации"},
                    "403": {"description": "Недостаточно прав"}
                }
            }
        },
        "/tasks/{task_id}": {
            "get": {
                "tags": ["Tasks"],
                "summary": "Задача по ID",
                "description": "Cleaner видит только свои задачи",
                "parameters": [
                    {"name": "task_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
                ],
                "responses": {
                    "200": {"description": "Задача", "content": {"application/json": {"schema": {"$ref": "#/components/schemas/TaskResponse"}}}},
                    "403": {"description": "Нет доступа"},
                    "404": {"description": "Не найдена"}
                }
            }
        },
        "/tasks/{task_id}/status": {
            "patch": {
                "tags": ["Tasks"],
                "summary": "Обновить статус задачи",
                "parameters": [
                    {"name": "task_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
                ],
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"type": "object", "properties": {"status": {"type": "string", "enum": ["pending", "in_progress", "completed"]}}}}}
                },
                "responses": {
                    "200": {"description": "Статус обновлён"},
                    "404": {"description": "Не найдена"}
                }
            }
        },
        "/tasks/{task_id}/photos": {
            "post": {
                "tags": ["Tasks"],
                "summary": "Загрузить фото",
                "parameters": [
                    {"name": "task_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
                ],
                "requestBody": {
                    "content": {"multipart/form-data": {"schema": {"type": "object", "properties": {"photo": {"type": "string", "format": "binary"}}}}}
                },
                "responses": {
                    "201": {"description": "Фото загружено"},
                    "404": {"description": "Задача не найдена"}
                }
            },
            "get": {
                "tags": ["Tasks"],
                "summary": "Список фото задачи",
                "parameters": [
                    {"name": "task_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
                ],
                "responses": {
                    "200": {"description": "Список фото"}
                }
            }
        },
        "/locations": {
            "post": {
                "tags": ["Locations"],
                "summary": "Создать локацию",
                "description": "Доступно: только Admin",
                "requestBody": {
                    "required": True,
                    "content": {"application/json": {"schema": {"$ref": "#/components/schemas/LocationCreate"}}}
                },
                "responses": {
                    "201": {"description": "Локация создана"},
                    "403": {"description": "Недостаточно прав"}
                }
            }
        },
        "/locations/{location_id}/children": {
            "get": {
                "tags": ["Locations"],
                "summary": "Все потомки локации",
                "description": "Использует ltree для обхода иерархии",
                "parameters": [
                    {"name": "location_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
                ],
                "responses": {
                    "200": {"description": "Список потомков"},
                    "404": {"description": "Локация не найдена"}
                }
            }
        },
        "/locations/{location_id}/tasks": {
            "get": {
                "tags": ["Locations"],
                "summary": "Задачи в локации и её потомках",
                "description": "Использует ltree оператор <@ для поиска по дереву",
                "parameters": [
                    {"name": "location_id", "in": "path", "required": True, "schema": {"type": "string", "format": "uuid"}}
                ],
                "responses": {
                    "200": {"description": "Список задач"}
                }
            }
        },
        "/export/tasks": {
            "get": {
                "tags": ["Export"],
                "summary": "Экспорт задач",
                "description": "Доступно: Admin, Manager. Поддерживает Parquet и Excel форматы",
                "parameters": [
                    {"name": "date_from", "in": "query", "required": True, "schema": {"type": "string"}, "example": "2026-01-01"},
                    {"name": "date_to", "in": "query", "required": True, "schema": {"type": "string"}, "example": "2026-12-31"},
                    {"name": "format", "in": "query", "schema": {"type": "string", "enum": ["parquet", "excel"]}, "description": "Формат экспорта"},
                    {"name": "country", "in": "query", "schema": {"type": "string"}, "description": "Фильтр по стране (только Admin)"}
                ],
                "responses": {
                    "200": {"description": "Файл экспорта", "content": {"application/octet-stream": {}}},
                    "400": {"description": "Неверные параметры"},
                    "403": {"description": "Недостаточно прав"}
                }
            }
        }
    }
}


@bp.route(route="docs/openapi.json", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
async def openapi_spec(req: func.HttpRequest) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(OPENAPI_SPEC, ensure_ascii=False, indent=2),
        status_code=200,
        mimetype="application/json"
    )


@bp.route(route="docs", methods=["GET"], auth_level=func.AuthLevel.ANONYMOUS)
async def swagger_ui(req: func.HttpRequest) -> func.HttpResponse:
    html = """<!DOCTYPE html>
<html>
<head>
    <title>Cleaning Platform API</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui.min.css">
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/5.11.0/swagger-ui-bundle.min.js"></script>
<script>
    SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: '#swagger-ui',
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: "BaseLayout",
        persistAuthorization: true
    })
</script>
</body>
</html>"""
    return func.HttpResponse(html, status_code=200, mimetype="text/html")
