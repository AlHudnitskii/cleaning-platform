from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

from src.infrastructure.blob.storage import read_link

BLOB = "http://127.0.0.1:10000/devstoreaccount1/task-photos/task-1/photo.jpg"
NOW = datetime(2026, 10, 16, 12, 0, tzinfo=UTC)


def test_read_link_grants_read_only_access_for_two_hours():
    link = urlsplit(read_link(BLOB, now=NOW))
    query = parse_qs(link.query)

    assert link.path == "/devstoreaccount1/task-photos/task-1/photo.jpg"
    assert query["sp"] == ["r"]
    assert query["sr"] == ["b"]
    assert query["se"] == ["2026-10-16T14:00:00Z"]
    assert query["sig"][0]


def test_read_link_replaces_an_existing_query():
    link = read_link(f"{BLOB}?sp=rwd&sig=stale", now=NOW)

    assert "stale" not in link
    assert parse_qs(urlsplit(link).query)["sp"] == ["r"]
