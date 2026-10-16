import type { TaskResponse, TaskStatus } from "../../api/types";
import { actionLabel, nextStep } from "./workflow";

function buttonClass(status: TaskStatus, next: TaskStatus | null): string {
  if (status === "cancelled") return "btn btn-danger";
  return status === next ? "btn btn-primary" : "btn btn-secondary";
}

export function StatusActions({
  task,
  onChange,
  disabled,
}: {
  task: TaskResponse;
  onChange: (status: TaskStatus) => void;
  disabled?: boolean;
}) {
  if (task.allowed_statuses.length === 0) return null;
  const next = nextStep(task);
  const ordered = [...task.allowed_statuses].sort((a, b) => Number(b === next) - Number(a === next));
  return (
    <div className="button-row" role="group" aria-label={`Change status of ${task.title}`}>
      {ordered.map((status) => (
        <button
          key={status}
          type="button"
          className={buttonClass(status, next)}
          disabled={disabled}
          onClick={() => onChange(status)}
        >
          {actionLabel(task.status, status)}
        </button>
      ))}
    </div>
  );
}
