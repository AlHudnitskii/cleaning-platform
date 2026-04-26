from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import uuid
import re


class LocationCreate(BaseModel):
    name: str
    country: str
    level: str
    parent_id: Optional[uuid.UUID] = None

    @field_validator("country")
    @classmethod
    def validate_country(cls, v: str) -> str:
        allowed = ["DE", "DK", "IT", "AU"]
        if v.upper() not in allowed:
            raise ValueError(f"Country must be one of {allowed}")
        return v.upper()

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str) -> str:
        allowed = ["country", "city", "building", "floor", "room"]
        if v.lower() not in allowed:
            raise ValueError(f"Level must be one of {allowed}")
        return v.lower()

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v.strip()


class LocationResponse(BaseModel):
    id: uuid.UUID
    name: str
    country: str
    path: str
    level: str
    parent_id: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}
