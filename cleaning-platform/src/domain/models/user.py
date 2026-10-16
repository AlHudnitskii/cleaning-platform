import uuid
from dataclasses import dataclass
from datetime import datetime

from pydantic import BaseModel, EmailStr, field_validator, model_validator

from src.domain.models.enums import Country, UserRole
from src.translations import phrases

MIN_PASSWORD_LENGTH = 6


def _validate_password(value: str) -> str:
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError(phrases.PASSWORD_TOO_SHORT(length=MIN_PASSWORD_LENGTH))
    return value


@dataclass(frozen=True)
class CurrentUser:
    id: uuid.UUID
    email: str
    role: UserRole
    country: Country | None

    @property
    def is_admin(self) -> bool:
        return self.role == UserRole.ADMIN

    @property
    def is_manager(self) -> bool:
        return self.role == UserRole.MANAGER

    @property
    def is_cleaner(self) -> bool:
        return self.role == UserRole.CLEANER


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


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    country: Country | None
    is_active: bool = True
    created_at: datetime

    model_config = {"from_attributes": True}


class AssigneeResponse(BaseModel):
    id: uuid.UUID
    email: str
    country: Country | None

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
