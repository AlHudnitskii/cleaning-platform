import re
import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator

from src.domain.models.enums import Country, UserRole
from src.translations import phrases

MIN_PASSWORD_LENGTH = 6
PHONE = re.compile(r"^\+?[0-9][0-9 ()-]{5,30}$")


def _validate_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(phrases.PASSWORD_TOO_SHORT(length=MIN_PASSWORD_LENGTH))
    return value


def _validate_country_for_role(role: UserRole, country: Country | None) -> None:
    if role in (UserRole.MANAGER, UserRole.CLEANER) and not country:
        raise ValueError(phrases.COUNTRY_REQUIRED_FOR_ROLE())


class UserRegister(BaseModel):
    email: EmailStr
    password: str
    role: UserRole
    country: Country | None = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password(v)

    @model_validator(mode="after")
    def validate_country_for_role(self) -> "UserRegister":
        _validate_country_for_role(self.role, self.country)
        return self


class UserUpdate(BaseModel):
    email: EmailStr
    role: UserRole
    country: Country | None = None

    @model_validator(mode="after")
    def validate_country_for_role(self) -> "UserUpdate":
        _validate_country_for_role(self.role, self.country)
        return self


class PasswordReset(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password(v)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class PasswordChange(BaseModel):
    old_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_password(v)


class ProfileUpdate(BaseModel):
    full_name: str | None = Field(default=None, max_length=100)
    phone: str | None = Field(default=None, max_length=32)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, v: str | None) -> str | None:
        return (v or "").strip() or None

    @field_validator("phone")
    @classmethod
    def clean_phone(cls, v: str | None) -> str | None:
        value = (v or "").strip()
        if not value:
            return None
        if not PHONE.fullmatch(value):
            raise ValueError(phrases.PHONE_INVALID())
        return value


class NotificationSettings(BaseModel):
    """Which push topics reach the user; true means on."""

    assigned: bool = True
    task_created: bool = True
    status_changed: bool = True
    due_soon: bool = True
    overdue: bool = True


class NotificationSettingsUpdate(BaseModel):
    assigned: bool | None = None
    task_created: bool | None = None
    status_changed: bool | None = None
    due_soon: bool | None = None
    overdue: bool | None = None

    @field_validator("*")
    @classmethod
    def reject_null(cls, v: bool | None) -> bool | None:
        if v is None:
            raise ValueError(phrases.DONE_NOT_BOOLEAN())
        return v


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    country: Country | None
    full_name: str | None = None
    phone: str | None = None
    avatar_url: str | None = Field(default=None, description="Read-only link that expires in two hours")
    is_active: bool = True
    created_at: datetime


class AssigneeResponse(BaseModel):
    id: uuid.UUID
    email: str
    full_name: str | None = None
    country: Country | None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
