import type { KeyboardEvent } from "react";

import { setTheme, useTheme, type Theme } from "../theme";
import { Icon, type IconName } from "./Icon";

const THEMES: { value: Theme; label: string; icon: IconName }[] = [
  { value: "light", label: "Light theme", icon: "sun" },
  { value: "dark", label: "Dark theme", icon: "moon" },
];

const ARROW_KEYS = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

export function ThemeSwitch() {
  const theme = useTheme();

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!ARROW_KEYS.includes(event.key)) return;
    event.preventDefault();
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(`[data-value="${next}"]`)?.focus();
  };

  return (
    <div className="theme-switch" role="radiogroup" aria-label="Colour theme">
      {THEMES.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-value={option.value}
          aria-checked={theme === option.value}
          aria-label={option.label}
          title={option.label}
          className="theme-option"
          tabIndex={theme === option.value ? 0 : -1}
          onClick={() => setTheme(option.value)}
          onKeyDown={handleKeyDown}
        >
          <Icon name={option.icon} size={15} />
        </button>
      ))}
    </div>
  );
}
