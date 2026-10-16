import { Link } from "react-router-dom";

import type { TaskResponse, TaskSort, TaskStatus } from "../../api/types";
import { PriorityText, StatusBadge } from "../../components/Badges";
import { Person, RelativeDate } from "../../components/People";
import { SortHeader } from "../../components/SortHeader";
import { countryName, rruleLabel } from "../../labels";
import type { SortState } from "../../sorting";
import { DueDate } from "./DueDate";
import { actionLabel, nextStep } from "./workflow";

export function TaskTable({
  tasks,
  firstNumber,
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
  firstNumber: number;
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
    <div className="table-scroll" aria-busy={busy}>
      <table className="table table-rows table-stacked">
        <thead>
          <tr>
            <th scope="col" className="cell-select">
              <input
                type="checkbox"
                className="checkbox"
                aria-label="Select all tasks on this page"
                checked={allSelected}
                ref={(input) => {
                  if (input) input.indeterminate = selectedOnPage > 0 && !allSelected;
                }}
                onChange={(event) => onSelect(tasks.map((task) => task.id), event.target.checked)}
              />
            </th>
            <th scope="col" className="cell-index">
              #
            </th>
            <SortHeader label="Task" column="title" sort={sort} onSort={onSort} />
            <SortHeader label="Status" column="status" sort={sort} onSort={onSort} />
            <SortHeader label="Priority" column="priority" sort={sort} onSort={onSort} />
            {showCountry && <SortHeader label="Country" column="country" sort={sort} onSort={onSort} />}
            <SortHeader label="Location" column="location" sort={sort} onSort={onSort} />
            <SortHeader label="Assignee" column="assignee" sort={sort} onSort={onSort} />
            <SortHeader label="Due" column="due_date" sort={sort} onSort={onSort} />
            <SortHeader label="Created" column="created_at" sort={sort} onSort={onSort} />
            <th scope="col" className="cell-actions">
              <span className="visually-hidden">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task, index) => (
            <tr key={task.id} className={selected.has(task.id) ? "is-selected" : undefined}>
              <td className="cell-select">
                <input
                  type="checkbox"
                  className="checkbox"
                  aria-label={`Select ${task.title}`}
                  checked={selected.has(task.id)}
                  onChange={(event) => onSelect([task.id], event.target.checked)}
                />
              </td>
              <td className="cell-index">{firstNumber + index}</td>
              <td className="cell-primary">
                <Link to={`/tasks/${task.id}`} className="cell-title row-link">
                  {task.title}
                </Link>
                {task.rrule && <span className="cell-sub">Repeats: {rruleLabel(task.rrule)}</span>}
              </td>
              <td data-label="Status">
                <StatusBadge status={task.status} />
              </td>
              <td data-label="Priority">
                <PriorityText priority={task.priority} />
              </td>
              {showCountry && (
                <td className="cell-muted" data-label="Country">
                  {countryName(task.country)}
                </td>
              )}
              <td className="cell-muted" data-label="Location">
                {task.location_name ?? "—"}
              </td>
              <td data-label="Assignee">
                <Person email={task.assigned_to_email} />
              </td>
              <td className="cell-nowrap" data-label="Due">
                <DueDate task={task} />
              </td>
              <td className="cell-muted cell-nowrap" data-label="Created">
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
      {pending ? "Saving…" : actionLabel(task.status, next)}
    </button>
  );
}
