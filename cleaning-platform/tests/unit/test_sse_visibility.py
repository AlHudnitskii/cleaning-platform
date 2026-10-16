import uuid

from src.domain.models.enums import Country, UserRole
from src.domain.models.user import CurrentUser
from sse_server import can_receive

FIRST = CurrentUser(id=uuid.uuid4(), email="first@cleaning.com", role=UserRole.CLEANER, country=Country.DE)
SECOND = CurrentUser(id=uuid.uuid4(), email="second@cleaning.com", role=UserRole.CLEANER, country=Country.DE)
OTHER = CurrentUser(id=uuid.uuid4(), email="other@cleaning.com", role=UserRole.CLEANER, country=Country.DE)


def reassignment() -> dict[str, object]:
    return {"country": "DE", "assigned_to": str(SECOND.id), "previous_assigned_to": str(FIRST.id)}


def test_reassignment_reaches_both_the_previous_and_the_new_assignee():
    assert can_receive(FIRST, reassignment())
    assert can_receive(SECOND, reassignment())


def test_reassignment_does_not_reach_unrelated_cleaners():
    assert not can_receive(OTHER, reassignment())


def test_author_does_not_receive_their_own_change():
    assert not can_receive(SECOND, {**reassignment(), "changed_by": str(SECOND.id)})
