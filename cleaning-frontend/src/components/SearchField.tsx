import type { Ref } from "react";

import { t } from "../i18n/locale";
import { Icon } from "./Icon";

export function SearchField({
  ref,
  value,
  onChange,
  label,
  placeholder,
  shortcut,
}: {
  ref?: Ref<HTMLInputElement>;
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  shortcut?: string;
}) {
  return (
    <div className="search-box">
      <Icon name="search" size={16} />
      <input
        ref={ref}
        type="search"
        className="search-input"
        placeholder={placeholder ?? `${label}…`}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        maxLength={200}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            event.stopPropagation();
            onChange("");
          }
        }}
      />
      {value ? (
        <button type="button" className="search-clear" aria-label={t().search.clear} onClick={() => onChange("")}>
          <Icon name="close" size={13} />
        </button>
      ) : (
        shortcut && (
          <kbd className="kbd" aria-hidden="true">
            {shortcut}
          </kbd>
        )
      )}
    </div>
  );
}
