import uuid
from datetime import UTC, date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.types import UserDefinedType

from src.domain.models.enums import ReminderKind, TaskPriority, TaskStatus
from src.infrastructure.database.connection import Base


def utcnow() -> datetime:
    return datetime.now(UTC)


def _in_list(column: str, values: list[str]) -> str:
    quoted = ", ".join(f"'{v}'" for v in values)
    return f"{column} IN ({quoted})"


class LtreeType(UserDefinedType[str]):
    cache_ok = True

    def get_col_spec(self, **kw: object) -> str:
        return "ltree"


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    country: Mapped[str] = mapped_column(String(2))
    path: Mapped[str] = mapped_column(LtreeType())
    level: Mapped[str] = mapped_column(String(50))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    __table_args__ = (
        Index("ix_locations_path", "path", postgresql_using="gist"),
        Index("ix_locations_country", "country"),
    )


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(50))
    country: Mapped[str | None] = mapped_column(String(2))
    is_active: Mapped[bool] = mapped_column(default=True)
    token_version: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(50), default=TaskStatus.PENDING)
    country: Mapped[str] = mapped_column(String(2))
    location_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("locations.id"))
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    rrule: Mapped[str | None] = mapped_column(String(500))
    is_recurring: Mapped[bool] = mapped_column(default=False, server_default="false")
    parent_task_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("tasks.id", ondelete="SET NULL"))
    scheduled_for: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    priority: Mapped[str] = mapped_column(String(20), default=TaskPriority.NORMAL, server_default="normal")
    due_date: Mapped[date | None] = mapped_column(Date)
    photo_required: Mapped[bool] = mapped_column(default=False, server_default="false")
    quality_score: Mapped[int | None] = mapped_column(Integer)
    quality_comment: Mapped[str | None] = mapped_column(Text)
    quality_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    quality_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        CheckConstraint(_in_list("status", [s.value for s in TaskStatus]), name="status"),
        CheckConstraint(_in_list("priority", [p.value for p in TaskPriority]), name="priority"),
        CheckConstraint("quality_score BETWEEN 1 AND 5", name="quality_score"),
        Index("ix_tasks_country_created_at", "country", "created_at"),
        Index("ix_tasks_assigned_to", "assigned_to"),
        Index("ix_tasks_status", "status"),
        Index("ix_tasks_created_at_id", "created_at", "id"),
        Index("ix_tasks_location_id", "location_id"),
        Index("ix_tasks_due_date", "due_date"),
        Index(
            "ix_tasks_parent_task_id_scheduled_for",
            "parent_task_id",
            "scheduled_for",
            unique=True,
            postgresql_where=text("parent_task_id IS NOT NULL"),
        ),
    )


class TaskPhoto(Base):
    __tablename__ = "task_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"), index=True)
    url: Mapped[str] = mapped_column(String(500))
    filename: Mapped[str] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())


class TaskStatusHistory(Base):
    __tablename__ = "task_status_history"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    old_status: Mapped[str | None] = mapped_column(String(50))
    new_status: Mapped[str] = mapped_column(String(50))
    changed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id"))
    changed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    __table_args__ = (Index("ix_task_status_history_task_id_changed_at", "task_id", "changed_at"),)


class TaskChecklistItem(Base):
    __tablename__ = "task_checklist_items"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer)
    text: Mapped[str] = mapped_column(String(255))
    done: Mapped[bool] = mapped_column(default=False, server_default="false")
    done_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    done_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (Index("ix_task_checklist_items_task_id_position", "task_id", "position"),)


class ChecklistTemplate(Base):
    """A named list of checklist steps that managers of a country reuse when they create tasks."""

    __tablename__ = "checklist_templates"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(100))
    country: Mapped[str] = mapped_column(String(2))
    items: Mapped[list[str]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    __table_args__ = (
        CheckConstraint("jsonb_typeof(items) = 'array'", name="items_array"),
        UniqueConstraint("country", "name"),
    )


class TaskReminder(Base):
    """One row per reminder sent, so each due date of a task triggers each kind of reminder once."""

    __tablename__ = "task_reminders"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4, server_default=func.gen_random_uuid())
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(20))
    due_date: Mapped[date] = mapped_column(Date)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    __table_args__ = (
        CheckConstraint(_in_list("kind", [k.value for k in ReminderKind]), name="kind"),
        UniqueConstraint("task_id", "kind", "due_date"),
    )


class TaskComment(Base):
    __tablename__ = "task_comments"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id", ondelete="CASCADE"))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    user: Mapped[User] = relationship()

    __table_args__ = (Index("ix_task_comments_task_id_created_at", "task_id", "created_at"),)


class LoginFailure(Base):
    __tablename__ = "login_failures"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255))
    failed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())

    __table_args__ = (Index("ix_login_failures_email_failed_at", "email", "failed_at"),)


class PushSubscription(Base):
    __tablename__ = "push_subscriptions"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    endpoint: Mapped[str] = mapped_column(String(500), unique=True)
    p256dh: Mapped[str] = mapped_column(String(500))
    auth: Mapped[str] = mapped_column(String(100))
    locale: Mapped[str] = mapped_column(String(5), default="en", server_default="en")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())


class OutboxMessage(Base):
    __tablename__ = "outbox_messages"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(String(100))
    payload: Mapped[dict[str, object]] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, server_default=func.now())
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    __table_args__ = (
        Index(
            "ix_outbox_messages_unpublished",
            "created_at",
            postgresql_where=text("published_at IS NULL"),
        ),
    )
