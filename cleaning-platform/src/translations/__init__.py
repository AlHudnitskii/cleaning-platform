from collections.abc import Mapping
from dataclasses import dataclass, field
from enum import StrEnum


class Locale(StrEnum):
    EN = "en"
    RU = "ru"


DEFAULT_LOCALE = Locale.EN


def parse_locale(value: str | None) -> Locale:
    for part in (value or "").split(","):
        tag = part.split(";", 1)[0].strip().lower()
        if tag.startswith("ru"):
            return Locale.RU
        if tag.startswith("en"):
            return Locale.EN
    return DEFAULT_LOCALE


@dataclass(frozen=True)
class Text:
    phrase: "Phrase"
    params: Mapping[str, object] = field(default_factory=dict)

    def render(self, locale: Locale) -> str:
        template = self.phrase.ru if locale == Locale.RU else self.phrase.en
        values = {key: _render(value, locale) for key, value in self.params.items()}
        return template.format(**values)

    def __str__(self) -> str:
        return self.render(DEFAULT_LOCALE)


@dataclass(frozen=True)
class Phrase:
    en: str
    ru: str

    def __call__(self, **params: object) -> Text:
        return Text(self, params)


def _ru_form(n: int, one: str, few: str, many: str) -> str:
    mod10, mod100 = n % 10, n % 100
    if mod10 == 1 and mod100 != 11:
        return one
    if 2 <= mod10 <= 4 and not 12 <= mod100 <= 14:
        return few
    return many


@dataclass(frozen=True)
class Plural:
    count: int
    en: tuple[str, str]
    ru: tuple[str, str, str]

    def render(self, locale: Locale) -> str:
        if locale == Locale.RU:
            return f"{self.count} {_ru_form(self.count, *self.ru)}"
        return f"{self.count} {self.en[0] if self.count == 1 else self.en[1]}"


@dataclass(frozen=True)
class Joined:
    parts: tuple[Text, ...]
    separator: Phrase

    def render(self, locale: Locale) -> str:
        glue = self.separator.ru if locale == Locale.RU else self.separator.en
        return glue.join(part.render(locale) for part in self.parts)


def _render(value: object, locale: Locale) -> object:
    render = getattr(value, "render", None)
    return render(locale) if callable(render) else value
