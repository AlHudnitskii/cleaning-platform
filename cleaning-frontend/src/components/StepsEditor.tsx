import { useState } from "react";

import { t } from "../i18n/locale";
import { Icon } from "./Icon";

export const MAX_STEPS = 50;

export function StepsEditor({
  legend,
  items,
  onChange,
}: {
  legend: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const addDraft = () => {
    const value = draft.trim();
    if (!value || items.length >= MAX_STEPS) return;
    onChange([...items, value]);
    setDraft("");
  };

  return (
    <fieldset className="steps-editor">
      <legend className="field-label">{legend}</legend>
      {items.length > 0 && (
        <ol className="steps-editor-items">
          {items.map((item, index) => (
            <li key={`${item}-${index}`}>
              <span>{item}</span>
              <button
                type="button"
                className="icon-button"
                aria-label={t().steps.remove(item)}
                onClick={() => onChange(items.filter((_, position) => position !== index))}
              >
                <Icon name="close" size={13} />
              </button>
            </li>
          ))}
        </ol>
      )}
      <div className="steps-add">
        <input
          className="input"
          value={draft}
          maxLength={255}
          placeholder={t().steps.placeholder}
          aria-label={t().steps.newStep}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addDraft();
            }
          }}
        />
        <button type="button" className="btn btn-secondary" disabled={!draft.trim()} onClick={addDraft}>
          {t().common.add}
        </button>
      </div>
    </fieldset>
  );
}
