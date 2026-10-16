import type { TaskResponse, TaskStatus } from "../../api/types";
import { Select } from "../../components/Select";
import { STATUS_LABELS } from "../../labels";

export function BulkBar({
  tasks,
  busy,
  onChangeStatus,
  onClear,
}: {
  tasks: TaskResponse[];
  busy: boolean;
  onChangeStatus: (status: TaskStatus) => void;
  onClear: () => void;
}) {
  const counts = new Map<TaskStatus, number>();
  for (const task of tasks) {
    for (const status of task.allowed_statuses) counts.set(status, (counts.get(status) ?? 0) + 1);
  }
  const options = [...counts.entries()].map(([status, count]) => ({
    value: status,
    label: count === tasks.length ? STATUS_LABELS[status] : `${STATUS_LABELS[status]} (${count} of ${tasks.length})`,
  }));

  return (
    <div className="bulk-bar" role="region" aria-label="Bulk actions">
      <span className="bulk-count" aria-live="polite">
        {tasks.length} selected
      </span>
      {options.length > 0 ? (
        <Select<TaskStatus | "">
          variant="inline"
          value=""
          placeholder={busy ? "Updating…" : "Change status…"}
          disabled={busy}
          options={options}
          onChange={(status) => {
            if (status) onChangeStatus(status);
          }}
        />
      ) : (
        <span className="bulk-hint">No status change is allowed for this selection</span>
      )}
      <button type="button" className="bulk-clear" onClick={onClear}>
        Clear
      </button>
    </div>
  );
}
