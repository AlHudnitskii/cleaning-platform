import uuid
from collections.abc import Mapping
from dataclasses import dataclass

from src.domain.models.enums import Country, TaskPriority
from src.domain.services.recurring_tasks import validate_rrule

REQUIRED_COLUMNS = frozenset({"title", "country"})
OPTIONAL_COLUMNS = frozenset({"description", "priority", "assignee_email", "assigned_to", "location_name", "rrule"})
MAX_IMPORT_BYTES = 5 * 1024 * 1024
MAX_IMPORT_ROWS = 5000
MAX_TITLE_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 5000
MAX_RRULE_LENGTH = 500


@dataclass(frozen=True)
class ImportRow:
    row_number: int
    title: str
    country: Country
    description: str | None
    priority: TaskPriority
    assignee_email: str | None
    assignee_id: uuid.UUID | None
    location_name: str | None
    rrule: str | None


def _cell(row: Mapping[str, object], key: str) -> str:
    value = row.get(key)
    if value is None:
        return ""
    return str(value).strip()


def parse_row(row: Mapping[str, object], row_number: int, forced_country: str | None) -> ImportRow | str:
    title = _cell(row, "title")
    if len(title) < 3:
        return f"Row {row_number}: title must be at least 3 characters"
    if len(title) > MAX_TITLE_LENGTH:
        return f"Row {row_number}: title must be at most {MAX_TITLE_LENGTH} characters"

    country_code = (forced_country or _cell(row, "country")).upper()
    if country_code not in Country.__members__:
        return f"Row {row_number}: invalid country '{country_code}'"

    priority_value = _cell(row, "priority").lower() or TaskPriority.NORMAL
    if priority_value not in {p.value for p in TaskPriority}:
        return f"Row {row_number}: invalid priority '{priority_value}'"

    description = _cell(row, "description") or None
    if description and len(description) > MAX_DESCRIPTION_LENGTH:
        return f"Row {row_number}: description must be at most {MAX_DESCRIPTION_LENGTH} characters"

    rrule = _cell(row, "rrule") or None
    if rrule and (len(rrule) > MAX_RRULE_LENGTH or not validate_rrule(rrule)):
        return f"Row {row_number}: invalid rrule '{rrule}'"

    assignee_id = None
    raw_assignee_id = _cell(row, "assigned_to")
    if raw_assignee_id:
        try:
            assignee_id = uuid.UUID(raw_assignee_id)
        except ValueError:
            return f"Row {row_number}: assigned_to must be a user ID"

    return ImportRow(
        row_number=row_number,
        title=title,
        country=Country(country_code),
        description=description,
        priority=TaskPriority(priority_value),
        assignee_email=_cell(row, "assignee_email").lower() or None,
        assignee_id=assignee_id,
        location_name=_cell(row, "location_name") or None,
        rrule=rrule,
    )
