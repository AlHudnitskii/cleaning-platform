import uuid
from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime

from src.domain.models.enums import Country, TaskStatus, LocationLevel


class TaskCreate(BaseModel):
    title: str
    country: Country
    description: Optional[str] = None
    location_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Title must be at least 3 characters")
        return v.strip()


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    status: TaskStatus
    country: Country
    location_id: Optional[uuid.UUID]
    assigned_to: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}
