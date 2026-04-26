from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import uuid


class TaskCreate(BaseModel):
    title: str
    country: str
    description: Optional[str] = None
    location_id: Optional[uuid.UUID] = None

    @field_validator("country")
    @classmethod
    def validate_country(cls, v: str) -> str:
        allowed = ["DE", "DK", "IT", "AU"]
        if v.upper() not in allowed:
            raise ValueError(f"Country must be one of {allowed}")
        return v.upper()

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
    status: str
    country: str
    location_id: Optional[uuid.UUID]
    created_at: datetime

    model_config = {"from_attributes": True}
