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

export function FilterControl({ label, children }: { label: ReactNode; children: ReactElement<ControlProps> }) {
  const id = useId();
  return (
    <div className="filter-control">
      <label className="filter-control-label" htmlFor={id}>
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}
