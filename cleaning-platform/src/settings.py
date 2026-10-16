import os
from dataclasses import dataclass
from functools import lru_cache

MIN_SECRET_LENGTH = 32


class SettingsError(RuntimeError):
    pass


def _required(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise SettingsError(f"environment variable {name} is required")
    return value


def _secret(name: str) -> str:
    value = _required(name)
    if len(value) < MIN_SECRET_LENGTH:
        raise SettingsError(f"environment variable {name} must be at least {MIN_SECRET_LENGTH} characters")
    return value


def _flag(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    database_url: str
    rabbitmq_url: str
    jwt_secret: str
    jwt_refresh_secret: str
    storage_connection_string: str
    vapid_private_key: str
    vapid_claims_email: str
    sql_echo: bool = False
    secure_cookies: bool = True
    access_token_minutes: int = 60
    refresh_token_days: int = 30
    sse_host: str = "127.0.0.1"
    sse_port: int = 8080
    blob_public_url: str | None = None

    def __repr__(self) -> str:
        return "Settings(<redacted>)"


@lru_cache
def get_settings() -> Settings:
    return Settings(
        database_url=_required("DATABASE_URL"),
        rabbitmq_url=_required("RABBITMQ_URL"),
        jwt_secret=_secret("JWT_SECRET"),
        jwt_refresh_secret=_secret("JWT_REFRESH_SECRET"),
        storage_connection_string=os.environ.get("AzureWebJobsStorage", "UseDevelopmentStorage=true"),
        vapid_private_key=os.environ.get("VAPID_PRIVATE_KEY", "private_key.pem"),
        vapid_claims_email=os.environ.get("VAPID_CLAIMS_EMAIL", "admin@cleaning.com"),
        sql_echo=_flag("SQL_ECHO", False),
        secure_cookies=_flag("SECURE_COOKIES", True),
        access_token_minutes=int(os.environ.get("ACCESS_TOKEN_MINUTES", "60")),
        refresh_token_days=int(os.environ.get("REFRESH_TOKEN_DAYS", "30")),
        sse_host=os.environ.get("SSE_HOST", "127.0.0.1"),
        sse_port=int(os.environ.get("SSE_PORT", "8080")),
        blob_public_url=os.environ.get("BLOB_PUBLIC_URL") or None,
    )
