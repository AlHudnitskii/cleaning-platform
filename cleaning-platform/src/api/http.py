import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from datetime import date, datetime
from http.cookies import CookieError, SimpleCookie
from typing import Any, TypeVar

import azure.functions as func
from pydantic import BaseModel, ValidationError
from pydantic_core import to_jsonable_python

from src.domain.models.enums import UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.auth.middleware import AuthError, authenticate

logger = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)
AuthedHandler = Callable[[func.HttpRequest, CurrentUser], Awaitable[func.HttpResponse]]
PublicHandler = Callable[[func.HttpRequest], Awaitable[func.HttpResponse]]


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        message: str,
        details: list[dict[str, str]] | None = None,
        retry_after: int | None = None,
    ):
        super().__init__(message)
        self.status_code = status_code
        self.message = message
        self.details = details
        self.retry_after = retry_after


def not_found(entity: str) -> ApiError:
    return ApiError(404, f"{entity} not found")


def forbidden(message: str = "Insufficient permissions") -> ApiError:
    return ApiError(403, message)


def json_response(data: Any, status_code: int = 200, headers: dict[str, str] | None = None) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(to_jsonable_python(data, by_alias=True)),
        status_code=status_code,
        mimetype="application/json",
        headers=headers,
    )


def error_response(
    status_code: int,
    message: str,
    details: list[dict[str, str]] | None = None,
    retry_after: int | None = None,
) -> func.HttpResponse:
    body: dict[str, Any] = {"error": message}
    if details:
        body["details"] = details
    if retry_after is None:
        return json_response(body, status_code)
    body["retry_after"] = retry_after
    return json_response(body, status_code, headers={"Retry-After": str(retry_after)})


def validation_details(error: ValidationError) -> list[dict[str, str]]:
    return [
        {
            "field": ".".join(str(part) for part in item["loc"]) or "body",
            "message": item["msg"].removeprefix("Value error, "),
        }
        for item in error.errors(include_url=False, include_input=False, include_context=False)
    ]


def read_json(req: func.HttpRequest) -> dict[str, Any]:
    try:
        body = req.get_json()
    except ValueError as e:
        raise ApiError(400, "Invalid JSON") from e
    if not isinstance(body, dict):
        raise ApiError(400, "JSON body must be an object")
    return body


def parse_model(model: type[M], data: Any) -> M:
    try:
        return model.model_validate(data)
    except ValidationError as e:
        raise ApiError(400, "Validation failed", validation_details(e)) from e


def read_model(req: func.HttpRequest, model: type[M]) -> M:
    return parse_model(model, read_json(req))


def parse_uuid(value: str | None, label: str) -> uuid.UUID:
    try:
        return uuid.UUID(value or "")
    except ValueError as e:
        raise ApiError(400, f"Invalid {label}") from e


def route_uuid(req: func.HttpRequest, name: str, label: str) -> uuid.UUID:
    return parse_uuid(req.route_params.get(name), label)


def optional_uuid(req: func.HttpRequest, name: str) -> uuid.UUID | None:
    value = req.params.get(name)
    return parse_uuid(value, name) if value else None


def parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise ApiError(400, f"Invalid {label}. Use YYYY-MM-DD") from e


def optional_date(req: func.HttpRequest, name: str) -> date | None:
    value = req.params.get(name)
    return parse_date(value, name) if value else None


def query_int(req: func.HttpRequest, name: str, default: int, minimum: int, maximum: int) -> int:
    raw = req.params.get(name)
    if raw is None or raw == "":
        return default
    try:
        value = int(raw)
    except ValueError as e:
        raise ApiError(400, f"{name} must be an integer") from e
    if not minimum <= value <= maximum:
        raise ApiError(400, f"{name} must be between {minimum} and {maximum}")
    return value


def query_text(req: func.HttpRequest, name: str, max_length: int) -> str | None:
    value = (req.params.get(name) or "").strip()
    if not value:
        return None
    if len(value) > max_length:
        raise ApiError(400, f"{name} must be at most {max_length} characters")
    return value


def like_pattern(value: str) -> str:
    escaped = value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def query_choice(req: func.HttpRequest, name: str, choices: type[Any]) -> Any:
    raw = req.params.get(name)
    if not raw:
        return None
    try:
        return choices(raw)
    except ValueError as e:
        allowed = ", ".join(c.value for c in choices)
        raise ApiError(400, f"{name} must be one of: {allowed}") from e


def read_cookie(req: func.HttpRequest, name: str) -> str | None:
    raw = req.headers.get("Cookie")
    if not raw:
        return None
    jar = SimpleCookie()
    try:
        jar.load(raw)
    except CookieError:
        return None
    morsel = jar.get(name)
    return morsel.value if morsel else None


def cookie_header(name: str, value: str, max_age: int, path: str, secure: bool) -> str:
    parts = [f"{name}={value}", f"Max-Age={max_age}", f"Path={path}", "HttpOnly", "SameSite=Strict"]
    if secure:
        parts.append("Secure")
    return "; ".join(parts)


def _error_from_exception(e: Exception) -> func.HttpResponse:
    if isinstance(e, ApiError):
        return error_response(e.status_code, e.message, e.details, e.retry_after)
    if isinstance(e, AuthError):
        return error_response(e.status_code, e.message)
    if isinstance(e, ValidationError):
        return error_response(400, "Validation failed", validation_details(e))
    logger.exception("Unhandled error")
    return error_response(500, "Internal server error")


def _named(wrapper: PublicHandler, handler: Callable[..., Any]) -> PublicHandler:
    wrapper.__name__ = handler.__name__
    wrapper.__qualname__ = handler.__qualname__
    wrapper.__module__ = handler.__module__
    return wrapper


def public(handler: PublicHandler) -> PublicHandler:
    async def wrapper(req: func.HttpRequest) -> func.HttpResponse:
        try:
            return await handler(req)
        except Exception as e:
            return _error_from_exception(e)

    return _named(wrapper, handler)


def authenticated(*roles: UserRole) -> Callable[[AuthedHandler], PublicHandler]:
    def decorator(handler: AuthedHandler) -> PublicHandler:
        async def wrapper(req: func.HttpRequest) -> func.HttpResponse:
            try:
                user = await authenticate(req.headers.get("Authorization"))
                if roles and user.role not in roles:
                    raise forbidden()
                return await handler(req, user)
            except Exception as e:
                return _error_from_exception(e)

        return _named(wrapper, handler)

    return decorator


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
