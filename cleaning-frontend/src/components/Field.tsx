import { useId, type ReactElement, type ReactNode, cloneElement } from "react";

interface ControlProps {
  id?: string;
  "aria-describedby"?: string;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: ReactNode;
  hint?: ReactNode;
  children: ReactElement<ControlProps>;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id, "aria-describedby": hint ? hintId : undefined })}
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
}

export function Options<T extends string>({
  values,
  labels,
  empty,
}: {
  values: readonly T[];
  labels: Record<T, string>;
  empty?: string;
}) {
  return (
    <>
      {empty !== undefined && <option value="">{empty}</option>}
      {values.map((value) => (
        <option key={value} value={value}>
          {labels[value]}
        </option>
      ))}
    </>
  );
}
