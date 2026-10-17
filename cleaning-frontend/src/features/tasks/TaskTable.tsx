import { Link } from "react-router-dom";

import type { TaskResponse, TaskSort, TaskStatus } from "../../api/types";
import { PriorityText, StatusBadge } from "../../components/Badges";
import { Person, RelativeDate } from "../../components/People";
import { SortHeader } from "../../components/SortHeader";
import { countryName, rruleLabel } from "../../labels";
import { t } from "../../i18n/locale";
import type { SortState } from "../../sorting";
import { DueDate } from "./DueDate";
import { actionLabel, nextStep } from "./workflow";

export function TaskTable({
  tasks,
  showCountry,
  busy,
  sort,
  onSort,
  onAdvance,
  advancingId,
  selected,
  onSelect,
}: {
  tasks: TaskResponse[];
  showCountry: boolean;
  busy: boolean;
  sort: SortState<TaskSort>;
  onSort: (column: TaskSort) => void;
  onAdvance: (task: TaskResponse, status: TaskStatus) => void;
  advancingId: string | null;
  selected: ReadonlySet<string>;
  onSelect: (ids: string[], checked: boolean) => void;
}) {
  const selectedOnPage = tasks.filter((task) => selected.has(task.id)).length;
  const allSelected = tasks.length > 0 && selectedOnPage === tasks.length;
  return (
    <div className="table-scroll table-scroll-sticky" aria-busy={busy}>
      <table className="table table-rows table-stacked">
        <thead>
          <tr>
            <th scope="col" className="cell-select">
              <input
                type="checkbox"
                className="checkbox"
                aria-label={t().tasks.selectAll}
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = selectedOnPage > 0 && !allSelected;
                }}
                onChange={(event) => onSelect(tasks.map((task) => task.id), event.target.checked)}
              />
            </th>
            <SortHeader label={t().tasks.task} column="title" sort={sort} onSort={onSort} />
            <SortHeader label={t().tasks.status} column="status" sort={sort} onSort={onSort} />
            <SortHeader label={t().tasks.priority} column="priority" sort={sort} onSort={onSort} />
            {showCountry && <SortHeader label={t().tasks.country} column="country" sort={sort} onSort={onSort} />}
            <SortHeader label={t().tasks.location} column="location" sort={sort} onSort={onSort} />
            <SortHeader label={t().tasks.assignee} column="assignee" sort={sort} onSort={onSort} />
            <SortHeader label={t().tasks.due} column="due_date" sort={sort} onSort={onSort} />
            <SortHeader label={t().tasks.createdColumn} column="created_at" sort={sort} onSort={onSort} />
            <th scope="col" className="cell-actions">
              <span className="visually-hidden">{t().tasks.actions}</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => (
            <tr key={task.id} className={selected.has(task.id) ? "is-selected" : undefined}>
              <td className="cell-select">
                <input
                  type="checkbox"
                  className="checkbox"
                  aria-label={t().tasks.selectTask(task.title)}
                  checked={selected.has(task.id)}
                  onChange={(event) => onSelect([task.id], event.target.checked)}
                />
              </td>
              <td className="cell-primary">
                <Link to={`/tasks/${task.id}`} className="cell-title row-link">
                  {task.title}
                </Link>
                <TaskMeta task={task} />
              </td>
              <td data-label={t().tasks.status}>
                <StatusBadge status={task.status} />
              </td>
              <td data-label={t().tasks.priority}>
                <PriorityText priority={task.priority} />
              </td>
              {showCountry && (
                <td className="cell-muted cell-nowrap" data-label={t().tasks.country}>
                  {countryName(task.country)}
                </td>
              )}
              <td className="cell-muted cell-nowrap" data-label={t().tasks.location}>
                {task.location_name ?? "—"}
              </td>
              <td data-label={t().tasks.assignee}>
                <Person email={task.assigned_to_email} name={task.assigned_to_name} />
              </td>
              <td className="cell-nowrap" data-label={t().tasks.due}>
                <DueDate task={task} />
              </td>
              <td className="cell-muted cell-nowrap" data-label={t().tasks.createdColumn}>
                <RelativeDate value={task.created_at} />
              </td>
              <td className="cell-actions row-actions">
                <QuickAction task={task} pending={advancingId === task.id} onAdvance={onAdvance} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function QuickAction({
  task,
  pending,
  onAdvance,
}: {
  task: TaskResponse;
  pending: boolean;
  onAdvance: (task: TaskResponse, status: TaskStatus) => void;
}) {
  const next = nextStep(task);
  if (!next) return null;
  return (
    <button
      type="button"
      className="btn btn-secondary btn-small row-action"
      disabled={pending}
      aria-label={`${actionLabel(task.status, next)}: ${task.title}`}
      onClick={() => onAdvance(task, next)}
    >
      {pending ? t().common.saving : actionLabel(task.status, next)}
    </button>
  );
}

function TaskMeta({ task }: { task: TaskResponse }) {
  const parts: string[] = [];
  if (task.checklist_total > 0) parts.push(t().tasks.checklistProgress(task.checklist_done, task.checklist_total));
  if (task.photo_required) parts.push(task.photo_count > 0 ? t().tasks.photoAdded : t().tasks.photoRequired);
  if (task.rrule) parts.push(rruleLabel(task.rrule));
  if (parts.length === 0) return null;
  return <span className="cell-sub">{parts.join(" · ")}</span>;
}
