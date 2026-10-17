from datetime import UTC, datetime
from urllib.parse import parse_qs, urlsplit

import pytest

from src.infrastructure.blob.storage import read_link
from src.settings import get_settings

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


@pytest.fixture
def public_base(monkeypatch):
    def use(value: str) -> None:
        monkeypatch.setenv("BLOB_PUBLIC_URL", value)
        get_settings.cache_clear()

    yield use
    monkeypatch.delenv("BLOB_PUBLIC_URL", raising=False)
    get_settings.cache_clear()


def test_links_point_at_the_public_base_so_other_devices_can_open_them(public_base):
    direct = urlsplit(read_link(BLOB, now=NOW))
    public_base("/blob/")

    link = urlsplit(read_link(BLOB, now=NOW))

    assert (link.scheme, link.netloc) == ("", "")
    assert link.path == "/blob/devstoreaccount1/task-photos/task-1/photo.jpg"
    assert parse_qs(link.query)["sig"] == parse_qs(direct.query)["sig"]


def test_links_stay_direct_without_a_public_base():
    assert read_link(BLOB, now=NOW).startswith("http://127.0.0.1:10000/devstoreaccount1/")
