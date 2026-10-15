import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from src.domain.models.enums import Country, TaskPriority, TaskStatus
from src.domain.services.recurring_tasks import validate_rrule


class TaskCreate(BaseModel):
    title: str = Field(max_length=255)
    country: Country
    description: str | None = Field(default=None, max_length=5000)
    location_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    rrule: str | None = Field(default=None, max_length=500)
    scheduled_for: datetime | None = None
    priority: TaskPriority = TaskPriority.NORMAL

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        if len(v.strip()) < 3:
            raise ValueError("Title must be at least 3 characters")
        return v.strip()

    @field_validator("rrule")
    @classmethod
    def check_rrule(cls, v: str | None) -> str | None:
        if v is None:
            return None
        if not validate_rrule(v):
            raise ValueError("Invalid rrule format")
        return v


class TaskStatusUpdate(BaseModel):
    status: TaskStatus


class TaskResponse(BaseModel):
    id: uuid.UUID
    title: str
    description: str | None
    status: TaskStatus
    country: Country
    location_id: uuid.UUID | None
    location_name: str | None = None
    location_path: list[str] = []
    assigned_to: uuid.UUID | None
    assigned_to_email: str | None = None
    rrule: str | None = None
    is_recurring: bool = False
    scheduled_for: datetime | None = None
    priority: TaskPriority = TaskPriority.NORMAL
    quality_score: int | None = None
    quality_comment: str | None = None
    quality_reviewed_by: uuid.UUID | None = None
    quality_reviewed_at: datetime | None = None
    created_at: datetime
    allowed_statuses: list[TaskStatus] = []


class QualityReview(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class CommentCreate(BaseModel):
    text: str = Field(max_length=2000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Comment text is required")
        return v.strip()


class CommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_role: str
    text: str
    created_at: datetime


class HistoryEntryResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    old_status: TaskStatus | None
    new_status: TaskStatus
    changed_by: uuid.UUID | None
    changed_by_email: str | None
    changed_at: datetime


class PhotoResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    url: str
    filename: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class SyncStatusChange(BaseModel):
    type: Literal["status_change"]
    task_id: uuid.UUID
    status: TaskStatus
    timestamp: datetime | None = None

    @field_validator("timestamp")
    @classmethod
    def assume_utc(cls, v: datetime | None) -> datetime | None:
        if v is not None and v.tzinfo is None:
            return v.replace(tzinfo=UTC)
        return v
