import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.domain.models.enums import Country, LocationLevel
from src.translations import phrases


def _validate_name(value: str) -> str:
    if len(value.strip()) < 2:
        raise ValueError(phrases.NAME_TOO_SHORT())
    return value.strip()


class LocationCreate(BaseModel):
    name: str = Field(max_length=255)
    country: Country
    level: LocationLevel
    parent_id: uuid.UUID | None = None

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name(v)


class LocationUpdate(BaseModel):
    name: str = Field(max_length=255)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return _validate_name(v)


class LocationResponse(BaseModel):
    id: uuid.UUID
    name: str
    country: Country
    level: LocationLevel
    parent_id: uuid.UUID | None
    path: str
    full_name: str
    created_at: datetime
