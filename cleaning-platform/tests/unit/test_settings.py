from collections.abc import Iterator

import pytest

from src.settings import SettingsError, get_settings


@pytest.fixture(autouse=True)
def fresh_settings() -> Iterator[None]:
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_missing_secret_names_the_variable(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("JWT_SECRET")
    with pytest.raises(SettingsError, match="JWT_SECRET is required"):
        get_settings()


def test_short_secret_is_rejected(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("JWT_REFRESH_SECRET", "too-short")
    with pytest.raises(SettingsError, match="JWT_REFRESH_SECRET must be at least 32 characters"):
        get_settings()


def test_repr_does_not_leak_secrets() -> None:
    settings = get_settings()
    assert settings.jwt_secret not in repr(settings)
    assert settings.database_url not in repr(settings)
