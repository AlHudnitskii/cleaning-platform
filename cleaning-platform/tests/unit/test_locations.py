import uuid

from src.domain.models.enums import LocationLevel
from src.domain.services.locations import LocationNode, build_path, child_error, full_names


def test_build_path_uses_id_labels() -> None:
    parent_id, child_id = uuid.uuid4(), uuid.uuid4()
    root = build_path(None, parent_id)
    assert root == parent_id.hex
    assert build_path(root, child_id) == f"{parent_id.hex}.{child_id.hex}"


def test_build_path_ignores_display_name_characters() -> None:
    location_id = uuid.uuid4()
    assert set(build_path(None, location_id)) <= set("0123456789abcdef")


def test_child_must_share_country() -> None:
    error = child_error(LocationLevel.CITY, "DE", LocationLevel.BUILDING, "NL")
    assert error == "Child location must be in the same country as its parent"


def test_child_must_be_deeper_than_parent() -> None:
    assert child_error(LocationLevel.FLOOR, "DE", LocationLevel.BUILDING, "DE") == (
        "A building cannot be placed inside a floor"
    )
    assert child_error(LocationLevel.FLOOR, "DE", LocationLevel.FLOOR, "DE") is not None
    assert child_error(LocationLevel.CITY, "DE", LocationLevel.ROOM, "DE") is None


def test_full_names_follow_parent_chain() -> None:
    country, city, room = uuid.uuid4(), uuid.uuid4(), uuid.uuid4()
    names = full_names(
        [
            LocationNode(room, city, "Room 1"),
            LocationNode(country, None, "Germany"),
            LocationNode(city, country, "Berlin"),
        ]
    )
    assert names[room] == ["Germany", "Berlin", "Room 1"]
    assert names[city] == ["Germany", "Berlin"]
    assert names[country] == ["Germany"]


def test_full_names_with_missing_parent_start_at_known_node() -> None:
    orphan = uuid.uuid4()
    names = full_names([LocationNode(orphan, uuid.uuid4(), "Floor 2")])
    assert names[orphan] == ["Floor 2"]


def test_full_names_terminate_on_cycle() -> None:
    a, b = uuid.uuid4(), uuid.uuid4()
    names = full_names([LocationNode(a, b, "A"), LocationNode(b, a, "B")])
    assert set(names) == {a, b}
