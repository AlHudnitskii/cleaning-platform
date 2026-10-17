import uuid
from datetime import UTC, date, datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from src.domain.models.enums import Country, PhotoKind, ReviewBlocker, TaskPriority, TaskStatus
from src.domain.services.recurring_tasks import validate_rrule
from src.translations import phrases


def clean_title(value: str) -> str:
    if len(value.strip()) < 3:
        raise ValueError(phrases.TITLE_TOO_SHORT())
    return value.strip()


def checked_rrule(value: str | None) -> str | None:
    if value is not None and not validate_rrule(value):
        raise ValueError(phrases.INVALID_RRULE())
    return value


MAX_CHECKLIST_ITEMS = 50


def clean_item(value: str) -> str:
    if not value.strip():
        raise ValueError(phrases.CHECKLIST_TEXT_REQUIRED())
    return value.strip()


class TaskCreate(BaseModel):
    title: str = Field(max_length=255)
    country: Country
    description: str | None = Field(default=None, max_length=5000)
    location_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    rrule: str | None = Field(default=None, max_length=500)
    scheduled_for: datetime | None = None
    priority: TaskPriority = TaskPriority.NORMAL
    due_date: date | None = None
    photo_required: bool = False
    checklist: list[str] = Field(default_factory=list, max_length=MAX_CHECKLIST_ITEMS)

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str) -> str:
        return clean_title(v)

    @field_validator("checklist")
    @classmethod
    def validate_checklist(cls, v: list[str]) -> list[str]:
        items = [clean_item(item) for item in v]
        if any(len(item) > 255 for item in items):
            raise ValueError(phrases.CHECKLIST_TEXT_TOO_LONG())
        return items

    @field_validator("rrule")
    @classmethod
    def check_rrule(cls, v: str | None) -> str | None:
        return checked_rrule(v)


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=255)
    description: str | None = Field(default=None, max_length=5000)
    location_id: uuid.UUID | None = None
    assigned_to: uuid.UUID | None = None
    rrule: str | None = Field(default=None, max_length=500)
    priority: TaskPriority | None = None
    due_date: date | None = None
    photo_required: bool | None = None

    @field_validator("photo_required")
    @classmethod
    def validate_photo_required(cls, v: bool | None) -> bool | None:
        if v is None:
            raise ValueError(phrases.PHOTO_REQUIREMENT_EMPTY())
        return v

    @field_validator("title")
    @classmethod
    def validate_title(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError(phrases.TITLE_EMPTY())
        return clean_title(v)

    @field_validator("priority")
    @classmethod
    def validate_priority(cls, v: TaskPriority | None) -> TaskPriority | None:
        if v is None:
            raise ValueError(phrases.PRIORITY_EMPTY())
        return v

    @field_validator("rrule")
    @classmethod
    def check_rrule(cls, v: str | None) -> str | None:
        return checked_rrule(v)


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
    assigned_to_name: str | None = None
    rrule: str | None = None
    is_recurring: bool = False
    parent_task_id: uuid.UUID | None = None
    scheduled_for: datetime | None = None
    priority: TaskPriority = TaskPriority.NORMAL
    due_date: date | None = None
    photo_required: bool = False
    checklist_done: int = 0
    checklist_total: int = 0
    photo_count: int = Field(default=0, description="Photos of the result; before photos are not counted")
    review_blockers: list[ReviewBlocker] = []
    quality_score: int | None = None
    quality_comment: str | None = None
    quality_reviewed_by: uuid.UUID | None = None
    quality_reviewed_at: datetime | None = None
    created_at: datetime
    started_at: datetime | None = None
    work_seconds: int | None = None
    allowed_statuses: list[TaskStatus] = []


class CalendarTask(BaseModel):
    id: uuid.UUID
    title: str
    status: TaskStatus
    priority: TaskPriority
    country: Country
    due_date: date
    assigned_to: uuid.UUID | None
    assigned_to_email: str | None
    assigned_to_name: str | None
    location_name: str | None
    is_recurring: bool
    parent_task_id: uuid.UUID | None


class CalendarResponse(BaseModel):
    date_from: date
    date_to: date
    data: list[CalendarTask]
    truncated: bool = Field(description="True when the period holds more tasks than the response carries")


class QualityReview(BaseModel):
    score: int = Field(ge=1, le=5)
    comment: str | None = Field(default=None, max_length=2000)


class CommentCreate(BaseModel):
    text: str = Field(max_length=2000)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        if not v.strip():
            raise ValueError(phrases.COMMENT_REQUIRED())
        return v.strip()


class CommentResponse(BaseModel):
    id: uuid.UUID
    task_id: uuid.UUID
    user_id: uuid.UUID
    user_email: str
    user_name: str | None = None
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
    kind: PhotoKind
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


class ChecklistItemCreate(BaseModel):
    text: str = Field(max_length=255)

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str) -> str:
        return clean_item(v)


class ChecklistItemUpdate(BaseModel):
    text: str | None = Field(default=None, max_length=255)
    done: bool | None = None

    @field_validator("text")
    @classmethod
    def validate_text(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError(phrases.CHECKLIST_TEXT_REQUIRED())
        return clean_item(v)

    @field_validator("done")
    @classmethod
    def validate_done(cls, v: bool | None) -> bool | None:
        if v is None:
            raise ValueError(phrases.DONE_NOT_BOOLEAN())
        return v


class ChecklistItemResponse(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    task_id: uuid.UUID
    position: int
    text: str
    done: bool
    done_by: uuid.UUID | None
    done_at: datetime | None
