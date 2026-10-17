import { useId } from "react";

import { t } from "../i18n/locale";
const SCORES = [1, 2, 3, 4, 5] as const;

export function StarDisplay({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">{t().rating.noReviews}</span>;
  const rounded = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={t().rating.outOf(value.toFixed(1))}>
      {SCORES.map((score) => (
        <span key={score} className={score <= rounded ? "star star-on" : "star"} aria-hidden="true">
          ★
        </span>
      ))}
      <span className="stars-value" aria-hidden="true">
        {value.toFixed(1)}
      </span>
    </span>
  );
}

export function StarInput({ value, onChange, legend }: { value: number; onChange: (v: number) => void; legend: string }) {
  const name = useId();
  return (
    <fieldset className="star-input">
      <legend className="field-label">{legend}</legend>
      {SCORES.map((score) => (
        <label key={score} className={score <= value ? "star star-on" : "star"}>
          <input
            className="visually-hidden"
            type="radio"
            name={name}
            value={score}
            checked={value === score}
            onChange={() => onChange(score)}
          />
          <span aria-hidden="true">★</span>
          <span className="visually-hidden">
            {t().rating.stars(score)}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
