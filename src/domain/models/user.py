from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import uuid
from src.domain.models.enums import UserRole, Country


class UserRegister(BaseModel):
    email: str
    password: str
    role: UserRole
    country: Optional[Country] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 6:
            raise ValueError("Password must be at least 6 characters")
        return v

    @field_validator("country")
    @classmethod
    def validate_country_for_role(cls, v, info):
        role = info.data.get("role")
        if role in [UserRole.MANAGER, UserRole.CLEANER] and not v:
            raise ValueError("Country is required for manager and cleaner roles")
        return v


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    email: str
    role: UserRole
    country: Optional[Country]
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
