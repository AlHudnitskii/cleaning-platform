import uuid

import pytest

from src.domain.models.enums import Country, TaskPriority
from src.domain.services.task_import import ImportRow, parse_row


def valid_row(**overrides: object) -> dict[str, object]:
    row: dict[str, object] = {
        "title": "Clean Room 101",
        "country": "de",
        "description": "",
        "priority": "",
        "assignee_email": "",
        "location_name": "",
        "rrule": "",
    }
    row.update(overrides)
    return row


def test_empty_optional_cells_become_none() -> None:
    parsed = parse_row(valid_row(), 2, None)
    assert isinstance(parsed, ImportRow)
    assert parsed.description is None
    assert parsed.rrule is None
    assert parsed.location_name is None
    assert parsed.assignee_email is None
    assert parsed.priority == TaskPriority.NORMAL
    assert parsed.country == Country.DE


def test_missing_cells_are_treated_as_empty() -> None:
    parsed = parse_row({"title": "Clean Room 101", "country": "NL"}, 2, None)
    assert isinstance(parsed, ImportRow)
    assert parsed.description is None
    assert parsed.rrule is None


def test_manager_country_overrides_file_value() -> None:
    parsed = parse_row(valid_row(country="NL"), 2, "DE")
    assert isinstance(parsed, ImportRow)
    assert parsed.country == Country.DE


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"title": "ab"}, "Row 7: title must be at least 3 characters"),
        ({"title": "x" * 256}, "Row 7: title must be at most 255 characters"),
        ({"country": "XX"}, "Row 7: invalid country 'XX'"),
        ({"priority": "asap"}, "Row 7: invalid priority 'asap'"),
        ({"rrule": "nan"}, "Row 7: invalid rrule 'nan'"),
        ({"assigned_to": "not-a-uuid"}, "Row 7: assigned_to must be a user ID"),
    ],
    ids=["short title", "long title", "unknown country", "unknown priority", "invalid rrule", "invalid user id"],
)
def test_invalid_rows_report_row_number(overrides: dict[str, object], message: str) -> None:
    assert parse_row(valid_row(**overrides), 7, None) == message


def test_valid_rrule_and_assignee_are_kept() -> None:
    user_id = uuid.uuid4()
    parsed = parse_row(
        valid_row(rrule="FREQ=WEEKLY;BYDAY=MO", assigned_to=str(user_id), assignee_email=" Cleaner@Example.com "),
        2,
        None,
    )
    assert isinstance(parsed, ImportRow)
    assert parsed.rrule == "FREQ=WEEKLY;BYDAY=MO"
    assert parsed.assignee_id == user_id
    assert parsed.assignee_email == "cleaner@example.com"
