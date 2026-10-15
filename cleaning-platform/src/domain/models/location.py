import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.domain.models.enums import Country, LocationLevel


class LocationCreate(BaseModel):
    name: str = Field(max_length=255)
    country: Country
    level: LocationLevel
    parent_id: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if len(v.strip()) < 2:
            raise ValueError("Name must be at least 2 characters")
        return v.strip()


class LocationResponse(BaseModel):
    id: uuid.UUID
    name: str
    country: Country
    level: LocationLevel
    parent_id: uuid.UUID | None
    path: str
    full_name: str
    created_at: datetime
