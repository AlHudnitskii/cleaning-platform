import { useId } from "react";

const SCORES = [1, 2, 3, 4, 5] as const;

export function StarDisplay({ value }: { value: number | null }) {
  if (value === null) return <span className="muted">No reviews yet</span>;
  const rounded = Math.round(value);
  return (
    <span className="stars" role="img" aria-label={`${value.toFixed(1)} out of 5`}>
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
            {score} {score === 1 ? "star" : "stars"}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
