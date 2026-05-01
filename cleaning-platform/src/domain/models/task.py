from pydantic import BaseModel, field_validator
from typing import Optional
from datetime import datetime
import uuid
from src.domain.models.enums import Country, TaskStatus, TaskPriority


class TaskCreate(BaseModel):
    title: str
    country: Country
    description: Optional[str] = None
    location_id: Optional[uuid.UUID] = None
    assigned_to: Optional[uuid.UUID] = None
    rrule: Optional[str] = None
    scheduled_for: Optional[datetime] = None
    priority: TaskPriority = TaskPriority.NORMAL

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Title must be at least 3 characters")
        return v.strip()

    @field_validator("rrule")
    @classmethod
    def validate_rrule(cls, v: str | None) -> str | None:
        if v is None:
            return v
        from src.domain.services.recurring_tasks import validate_rrule
        if not validate_rrule(v):
            raise ValueError("Invalid rrule format")
        return v


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: Optional[str]
    status: TaskStatus
    country: Country
    location_id: Optional[uuid.UUID]
    assigned_to: Optional[uuid.UUID]
    rrule: Optional[str] = None
    is_recurring: bool = False
    scheduled_for: Optional[datetime] = None
    priority: TaskPriority = TaskPriority.NORMAL
    quality_score: Optional[int] = None
    quality_comment: Optional[str] = None
    quality_reviewed_by: Optional[uuid.UUID] = None
    quality_reviewed_at: Optional[datetime] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class QualityReview(BaseModel):
    score: int
    comment: Optional[str] = None

    @field_validator("score")
    @classmethod
    def validate_score(cls, v: int) -> int:
        if v < 1 or v > 5:
            raise ValueError("Score must be between 1 and 5")
        return v
