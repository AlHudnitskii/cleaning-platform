from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy import String, DateTime, Text, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import text as sa_text
from sqlalchemy.types import UserDefinedType
import uuid
from datetime import datetime
from src.infrastructure.database.connection import Base
from src.domain.models.enums import UserRole, Country, TaskStatus, LocationLevel


class LtreeType(UserDefinedType):
    def get_col_spec(self):
        return "ltree"

    cache_ok = True


class Location(Base):
    __tablename__ = "locations"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(255))
    country: Mapped[str] = mapped_column(String(2))
    path: Mapped[str] = mapped_column(LtreeType)
    level: Mapped[str] = mapped_column(String(50))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("locations.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    parent: Mapped["Location | None"] = relationship(
        "Location", remote_side="Location.id", back_populates="children"
    )
    children: Mapped[list["Location"]] = relationship(
        "Location", back_populates="parent"
    )
    tasks: Mapped[list["Task"]] = relationship("Task", back_populates="location")

    __table_args__ = (
        Index("ix_locations_path", "path", postgresql_using="gist"),
        Index("ix_locations_country", "country"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="pending")
    country: Mapped[str] = mapped_column(String(2))
    location_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("locations.id"), nullable=True
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id"),
        nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    location: Mapped["Location | None"] = relationship("Location", back_populates="tasks")
    photos: Mapped[list["TaskPhoto"]] = relationship("TaskPhoto", back_populates="task")
    assigned_user: Mapped["User | None"] = relationship("User")


class TaskPhoto(Base):
    __tablename__ = "task_photos"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    task_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("tasks.id"))
    url: Mapped[str] = mapped_column(String(500))
    filename: Mapped[str] = mapped_column(String(255))
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    task: Mapped["Task"] = relationship("Task", back_populates="photos")


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(255), unique=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(String(50))
    country: Mapped[Country | None] = mapped_column(String(2), nullable=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
