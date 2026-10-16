import type { KeyboardEvent } from "react";

import { LOCALES, setLocale, t, useLocale, type Locale } from "../i18n/locale";

const SHORT: Record<Locale, string> = { en: "EN", ru: "RU" };
const ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

function optionId(option: Locale): string {
  return `language-option-${option}`;
}

export function LanguageSwitch() {
  const locale = useLocale();

  const choose = (option: Locale) => {
    document.getElementById(optionId(option))?.focus();
    setLocale(option);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!ARROW_KEYS.includes(event.key)) return;
    event.preventDefault();
    choose(locale === "en" ? "ru" : "en");
  };

  return (
    <div className="theme-switch language-switch" role="radiogroup" aria-label={t().language.group}>
      {LOCALES.map((option) => (
        <button
          key={option}
          id={optionId(option)}
          type="button"
          role="radio"
          lang={option}
          aria-checked={locale === option}
          aria-label={t().language[option]}
          title={t().language[option]}
          className="theme-option language-option"
          tabIndex={locale === option ? 0 : -1}
          onClick={() => choose(option)}
          onKeyDown={handleKeyDown}
        >
          {SHORT[option]}
        </button>
      ))}
    </div>
  );
}
