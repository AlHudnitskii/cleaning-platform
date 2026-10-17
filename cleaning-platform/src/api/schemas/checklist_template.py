import uuid
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from src.api.schemas.task import MAX_CHECKLIST_ITEMS, clean_item
from src.domain.models.enums import Country
from src.translations import phrases


def clean_name(value: str) -> str:
    if len(value.strip()) < 2:
        raise ValueError(phrases.NAME_TOO_SHORT())
    return value.strip()


def clean_items(values: list[str]) -> list[str]:
    items = [clean_item(value) for value in values]
    if not items:
        raise ValueError(phrases.TEMPLATE_EMPTY())
    if any(len(item) > 255 for item in items):
        raise ValueError(phrases.CHECKLIST_TEXT_TOO_LONG())
    return items


class ChecklistTemplateCreate(BaseModel):
    name: str = Field(max_length=100)
    country: Country | None = None
    items: list[str] = Field(max_length=MAX_CHECKLIST_ITEMS)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        return clean_name(v)

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[str]) -> list[str]:
        return clean_items(v)


class ChecklistTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, max_length=100)
    items: list[str] | None = Field(default=None, max_length=MAX_CHECKLIST_ITEMS)

    @field_validator("name")
    @classmethod
    def validate_name(cls, v: str | None) -> str | None:
        if v is None:
            raise ValueError(phrases.NAME_TOO_SHORT())
        return clean_name(v)

    @field_validator("items")
    @classmethod
    def validate_items(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            raise ValueError(phrases.TEMPLATE_EMPTY())
        return clean_items(v)


class ChecklistTemplateResponse(BaseModel):
    id: uuid.UUID
    name: str
    country: Country
    items: list[str]
    created_at: datetime
