import type { TaskResponse, TaskStatus } from "../../api/types";
import { STATUS_ACTIONS } from "../../labels";

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
  return (
    <div className="button-row" role="group" aria-label={`Change status of ${task.title}`}>
      {task.allowed_statuses.map((status) => (
        <button
          key={status}
          type="button"
          className={status === "cancelled" ? "btn btn-danger" : "btn btn-secondary"}
          disabled={disabled}
          onClick={() => onChange(status)}
        >
          {STATUS_ACTIONS[status]}
        </button>
      ))}
    </div>
  );
}
