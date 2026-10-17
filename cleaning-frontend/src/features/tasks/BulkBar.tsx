import type { TaskResponse, TaskStatus } from "../../api/types";
import { Select } from "../../components/Select";
import { t } from "../../i18n/locale";

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
    label: count === tasks.length ? t().status[status] : t().tasks.ofSelection(t().status[status], count, tasks.length),
  }));

  return (
    <div className="bulk-bar" role="region" aria-label={t().tasks.bulkActions}>
      <span className="bulk-count" aria-live="polite">
        {t().tasks.selectedCount(tasks.length)}
      </span>
      {options.length > 0 ? (
        <Select<TaskStatus | "">
          variant="inline"
          value=""
          placeholder={busy ? t().tasks.updating : t().tasks.changeStatus}
          disabled={busy}
          options={options}
          onChange={(status) => {
            if (status) onChangeStatus(status);
          }}
        />
      ) : (
        <span className="bulk-hint">{t().tasks.noBulkChange}</span>
      )}
      <button type="button" className="bulk-clear" onClick={onClear}>
        {t().common.clear}
      </button>
    </div>
  );
}
