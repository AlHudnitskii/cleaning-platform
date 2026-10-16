import pytest

from src.api.http import like_pattern


@pytest.mark.parametrize(
    ("text", "pattern"),
    [
        ("lobby", "%lobby%"),
        ("100%", "%100\\%%"),
        ("room_1", "%room\\_1%"),
        ("a\\b", "%a\\\\b%"),
    ],
)
def test_like_pattern_escapes_wildcards(text, pattern):
    assert like_pattern(text) == pattern
