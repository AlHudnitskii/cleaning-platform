import json
import logging
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import date, datetime
from http.cookies import CookieError, SimpleCookie
from typing import Any, TypeVar

import azure.functions as func
from pydantic import BaseModel, ValidationError
from pydantic_core import to_jsonable_python

from src.domain.models.enums import UserRole
from src.domain.models.user import CurrentUser
from src.infrastructure.auth.middleware import AuthError, authenticate
from src.translations import Locale, Phrase, Text, parse_locale, phrases

logger = logging.getLogger(__name__)

M = TypeVar("M", bound=BaseModel)
AuthedHandler = Callable[[func.HttpRequest, CurrentUser], Awaitable[func.HttpResponse]]
PublicHandler = Callable[[func.HttpRequest], Awaitable[func.HttpResponse]]


@dataclass(frozen=True)
class FieldError:
    field: str
    message: Text


class ApiError(Exception):
    def __init__(
        self,
        status_code: int,
        message: Text,
        details: list[FieldError] | None = None,
        retry_after: int | None = None,
    ):
        super().__init__(str(message))
        self.status_code = status_code
        self.message = message
        self.details = details
        self.retry_after = retry_after


def not_found(entity: Phrase) -> ApiError:
    return ApiError(404, phrases.NOT_FOUND(entity=entity()))


def forbidden(message: Text | None = None) -> ApiError:
    return ApiError(403, message or phrases.FORBIDDEN())


def request_locale(req: func.HttpRequest) -> Locale:
    return parse_locale(req.headers.get("Accept-Language"))


def json_response(data: Any, status_code: int = 200, headers: dict[str, str] | None = None) -> func.HttpResponse:
    return func.HttpResponse(
        json.dumps(to_jsonable_python(data, by_alias=True)),
        status_code=status_code,
        mimetype="application/json",
        headers=headers,
    )


def error_response(
    status_code: int,
    message: Text,
    locale: Locale,
    details: list[FieldError] | None = None,
    retry_after: int | None = None,
) -> func.HttpResponse:
    body: dict[str, Any] = {"error": message.render(locale)}
    if details:
        body["details"] = [{"field": item.field, "message": item.message.render(locale)} for item in details]
    if retry_after is None:
        return json_response(body, status_code)
    body["retry_after"] = retry_after
    return json_response(body, status_code, headers={"Retry-After": str(retry_after)})


GENERIC_ERRORS: dict[str, Phrase] = {
    "missing": phrases.FIELD_REQUIRED,
    "string_too_short": phrases.FIELD_TOO_SHORT,
    "string_too_long": phrases.FIELD_TOO_LONG,
    "too_long": phrases.FIELD_TOO_MANY,
    "enum": phrases.FIELD_INVALID_CHOICE,
    "literal_error": phrases.FIELD_INVALID_CHOICE,
    "uuid_parsing": phrases.FIELD_INVALID_ID,
    "uuid_type": phrases.FIELD_INVALID_ID,
    "int_parsing": phrases.FIELD_INVALID_NUMBER,
    "int_type": phrases.FIELD_INVALID_NUMBER,
    "int_from_float": phrases.FIELD_INVALID_NUMBER,
    "bool_parsing": phrases.FIELD_INVALID_BOOLEAN,
    "bool_type": phrases.FIELD_INVALID_BOOLEAN,
    "string_pattern_mismatch": phrases.FIELD_PATTERN,
}
LIMIT_ERRORS: dict[str, tuple[Phrase, str]] = {
    "greater_than_equal": (phrases.FIELD_TOO_SMALL, "ge"),
    "greater_than": (phrases.FIELD_TOO_SMALL, "gt"),
    "less_than_equal": (phrases.FIELD_TOO_BIG, "le"),
    "less_than": (phrases.FIELD_TOO_BIG, "lt"),
}


def field_label(loc: tuple[int | str, ...]) -> object:
    name = next((str(part) for part in reversed(loc) if isinstance(part, str)), "")
    label = phrases.FIELD.get(name)
    return label() if label else name or "body"


def field_message(kind: str, loc: tuple[int | str, ...], context: dict[str, Any]) -> Text:
    label = field_label(loc)
    if kind == "value_error":
        reason = context.get("error")
        if isinstance(reason, ValueError) and reason.args and isinstance(reason.args[0], Text):
            return reason.args[0]
        if loc and loc[-1] == "email":
            return phrases.FIELD_INVALID_EMAIL(field=label)
        return phrases.FIELD_INVALID(field=label)
    if kind in LIMIT_ERRORS:
        phrase, key = LIMIT_ERRORS[kind]
        return phrase(field=label, limit=context.get(key, ""))
    if kind.startswith(("date", "datetime")):
        return phrases.FIELD_INVALID_DATE(field=label)
    phrase = GENERIC_ERRORS.get(kind, phrases.FIELD_INVALID)
    return phrase(field=label, **{key: value for key, value in context.items() if isinstance(value, str | int)})


def validation_details(error: ValidationError) -> list[FieldError]:
    return [
        FieldError(
            field=".".join(str(part) for part in item["loc"]) or "body",
            message=field_message(item["type"], item["loc"], item.get("ctx", {})),
        )
        for item in error.errors(include_url=False, include_input=False)
    ]


def read_json(req: func.HttpRequest) -> dict[str, Any]:
    try:
        body = req.get_json()
    except ValueError as e:
        raise ApiError(400, phrases.INVALID_JSON()) from e
    if not isinstance(body, dict):
        raise ApiError(400, phrases.JSON_NOT_OBJECT())
    return body


def parse_model(model: type[M], data: Any) -> M:
    try:
        return model.model_validate(data)
    except ValidationError as e:
        raise ApiError(400, phrases.VALIDATION_FAILED(), validation_details(e)) from e


def read_model(req: func.HttpRequest, model: type[M]) -> M:
    return parse_model(model, read_json(req))


def parse_uuid(value: str | None, label: str) -> uuid.UUID:
    try:
        return uuid.UUID(value or "")
    except ValueError as e:
        raise ApiError(400, phrases.INVALID_ID(label=label)) from e


def route_uuid(req: func.HttpRequest, name: str, label: str) -> uuid.UUID:
    return parse_uuid(req.route_params.get(name), label)


def optional_uuid(req: func.HttpRequest, name: str) -> uuid.UUID | None:
    value = req.params.get(name)
    return parse_uuid(value, name) if value else None


def parse_date(value: str, label: str) -> date:
    try:
        return date.fromisoformat(value)
    except ValueError as e:
        raise ApiError(400, phrases.INVALID_DATE(label=label)) from e


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
        raise ApiError(400, phrases.NOT_INTEGER(name=name)) from e
    if not minimum <= value <= maximum:
        raise ApiError(400, phrases.OUT_OF_RANGE(name=name, minimum=minimum, maximum=maximum))
    return value


def query_text(req: func.HttpRequest, name: str, max_length: int) -> str | None:
    value = (req.params.get(name) or "").strip()
    if not value:
        return None
    if len(value) > max_length:
        raise ApiError(400, phrases.TEXT_TOO_LONG(name=name, max_length=max_length))
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
        raise ApiError(400, phrases.NOT_A_CHOICE(name=name, allowed=allowed)) from e


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


def _error_from_exception(e: Exception, req: func.HttpRequest) -> func.HttpResponse:
    locale = request_locale(req)
    if isinstance(e, ApiError):
        return error_response(e.status_code, e.message, locale, e.details, e.retry_after)
    if isinstance(e, AuthError):
        return error_response(e.status_code, e.message, locale)
    if isinstance(e, ValidationError):
        return error_response(400, phrases.VALIDATION_FAILED(), locale, validation_details(e))
    logger.exception("Unhandled error")
    return error_response(500, phrases.INTERNAL_ERROR(), locale)


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
            return _error_from_exception(e, req)

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
                return _error_from_exception(e, req)

        return _named(wrapper, handler)

    return decorator


def iso(value: datetime | None) -> str | None:
    return value.isoformat() if value else None
