import uuid
import re
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

from src.domain.models.enums import Country, LocationLevel


class LocationCreate(BaseModel):
    name: str
    country: Country
    level: LocationLevel
    parent_id: Optional[uuid.UUID] = None

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
