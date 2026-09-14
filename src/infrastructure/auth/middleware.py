import jwt
import logging
from azure.functions import HttpRequest
from src.infrastructure.auth.jwt_handler import decode_token
from src.domain.models.enums import UserRole


class AuthError(Exception):
    def __init__(self, message: str, status_code: int = 401):
        self.message = message
        self.status_code = status_code


def get_current_user(req: HttpRequest) -> dict:
    auth_header = req.headers.get("Authorization")

    if not auth_header:
        raise AuthError("Authorization header missing")

    if not auth_header.startswith("Bearer "):
        raise AuthError("Invalid authorization format. Use: Bearer <token>")

    token = auth_header.split(" ")[1]

    try:
        payload = decode_token(token)
        return payload
    except jwt.ExpiredSignatureError:
        raise AuthError("Token has expired")
    except jwt.InvalidTokenError:
        raise AuthError("Invalid token")


def require_roles(*roles: UserRole):
    def decorator(func):
        async def wrapper(req: HttpRequest, *args, **kwargs):
            import json
            import azure.functions as func

            try:
                user = get_current_user(req)
            except AuthError as e:
                return func.HttpResponse(
                    json.dumps({"error": e.message}),
                    status_code=e.status_code,
                    mimetype="application/json"
                )

            if user["role"] not in [r.value for r in roles]:
                return func.HttpResponse(
                    json.dumps({"error": "Insufficient permissions"}),
                    status_code=403,
                    mimetype="application/json"
                )

            req.current_user = user
            return await func(req, *args, **kwargs)
        return wrapper
    return decorator
