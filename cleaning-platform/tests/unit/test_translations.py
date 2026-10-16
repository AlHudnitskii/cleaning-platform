import json
import string

import azure.functions as func
import pytest

from src.api.http import ApiError, parse_model, public
from src.domain.models.user import UserRegister
from src.translations import Locale, Phrase, parse_locale, phrases


def placeholders(template: str) -> set[str]:
    return {name for _, name, _, _ in string.Formatter().parse(template) if name}


def catalog() -> list[tuple[str, Phrase]]:
    entries: list[tuple[str, Phrase]] = []
    for name, value in vars(phrases).items():
        if isinstance(value, Phrase):
            entries.append((name, value))
        elif isinstance(value, dict):
            entries.extend((f"{name}[{key}]", item) for key, item in value.items() if isinstance(item, Phrase))
    return entries


@pytest.mark.parametrize(("name", "phrase"), catalog(), ids=[name for name, _ in catalog()])
def test_every_phrase_has_both_languages_with_the_same_placeholders(name, phrase):
    assert phrase.en.strip() and phrase.ru.strip()
    assert placeholders(phrase.en) == placeholders(phrase.ru)


@pytest.mark.parametrize(
    ("header", "locale"),
    [
        ("ru-RU,ru;q=0.9,en;q=0.8", Locale.RU),
        ("en-GB,en;q=0.9", Locale.EN),
        ("de-DE,ru;q=0.5", Locale.RU),
        ("de-DE", Locale.EN),
        (None, Locale.EN),
    ],
)
def test_language_comes_from_the_first_supported_accept_language_entry(header, locale):
    assert parse_locale(header) == locale


@pytest.mark.parametrize(
    ("count", "expected"), [(1, "1 задаче"), (2, "2 задачах"), (11, "11 задачах"), (21, "21 задаче")]
)
def test_russian_counts_use_the_right_word_form(count, expected):
    assert phrases.tasks_count(count).render(Locale.RU) == expected
    assert phrases.tasks_count(count).render(Locale.EN) == f"{count} {'task' if count == 1 else 'tasks'}"


def test_validation_details_speak_the_request_language():
    with pytest.raises(ApiError) as caught:
        parse_model(UserRegister, {"password": "123", "role": "manager"})

    details = {item.field: item.message for item in caught.value.details or []}

    assert details["email"].render(Locale.RU) == "Email: обязательное поле"
    assert details["password"].render(Locale.RU) == "Пароль должен быть не короче 6 символов"
    assert details["password"].render(Locale.EN) == "Password must be at least 6 characters"


async def test_api_errors_are_rendered_in_the_language_of_the_request():
    @public
    async def handler(req: func.HttpRequest) -> func.HttpResponse:
        raise ApiError(409, phrases.LOCATION_IN_USE(tasks=phrases.tasks_count(3)))

    def request(language: str) -> func.HttpRequest:
        return func.HttpRequest(
            method="GET", url="http://localhost/api/x", body=b"", headers={"Accept-Language": language}
        )

    russian = json.loads((await handler(request("ru"))).get_body())
    english = json.loads((await handler(request("en"))).get_body())

    assert russian == {"error": "Локация используется в 3 задачах"}
    assert english == {"error": "This location is used by 3 tasks"}
