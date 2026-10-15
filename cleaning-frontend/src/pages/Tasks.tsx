import { useState } from "react";

import {
  COUNTRIES,
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
  type Country,
  type TaskPriority,
  type TaskSort,
  type TaskStatus,
} from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { EmptyState, ErrorState, Loading } from "../components/Feedback";
import { Field, Options } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { sortedByFullName, useLocations } from "../features/locations/api";
import { useTasks, type TaskListParams } from "../features/tasks/api";
import { TaskCard } from "../features/tasks/TaskCard";
import { TaskCreateForm } from "../features/tasks/TaskCreateForm";
import { COUNTRY_NAMES, PRIORITY_LABELS, SORT_LABELS, STATUS_LABELS, countryName } from "../labels";
import { readDate, readEnum, readId, readPage, useUrlState } from "../urlState";

const PAGE_SIZE = 12;

export function Tasks() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update, clear } = useUrlState();
  const [showForm, setShowForm] = useState(false);

  const filters: TaskListParams = {
    page: readPage(params),
    limit: PAGE_SIZE,
    sort: readEnum<TaskSort>(params, "sort", TASK_SORTS),
    status: readEnum<TaskStatus>(params, "status", TASK_STATUSES),
    priority: readEnum<TaskPriority>(params, "priority", TASK_PRIORITIES),
    country: isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined,
    location_id: readId(params, "location_id"),
    date_from: readDate(params, "date_from"),
    date_to: readDate(params, "date_to"),
  };
  const tasks = useTasks(filters);
  const locations = useLocations(filters.country);
  const hasFilters = [...params.keys()].some((key) => key !== "page" && key !== "sort");

  return (
    <>
      <PageHeader
        title="Tasks"
        description={isAdmin ? "All cleaning tasks across countries." : `Cleaning tasks in ${countryName(user.country)}.`}
        actions={
          <button type="button" className="btn btn-primary" aria-expanded={showForm} onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Close form" : "Create task"}
          </button>
        }
      />

      {showForm && <TaskCreateForm user={user} onCreated={() => setShowForm(false)} />}

      <section className="filters" aria-label="Filters">
        <Field label="Status">
          <select className="input" value={filters.status ?? ""} onChange={(e) => update({ status: e.target.value })}>
            <Options values={TASK_STATUSES} labels={STATUS_LABELS} empty="All statuses" />
          </select>
        </Field>
        <Field label="Priority">
          <select className="input" value={filters.priority ?? ""} onChange={(e) => update({ priority: e.target.value })}>
            <Options values={TASK_PRIORITIES} labels={PRIORITY_LABELS} empty="All priorities" />
          </select>
        </Field>
        {isAdmin && (
          <Field label="Country">
            <select
              className="input"
              value={filters.country ?? ""}
              onChange={(e) => update({ country: e.target.value, location_id: undefined })}
            >
              <Options values={COUNTRIES} labels={COUNTRY_NAMES} empty="All countries" />
            </select>
          </Field>
        )}
        <Field label="Location">
          <select className="input" value={filters.location_id ?? ""} onChange={(e) => update({ location_id: e.target.value })}>
            <option value="">All locations</option>
            {sortedByFullName(locations.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.full_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Created from">
          <input className="input" type="date" value={filters.date_from ?? ""} onChange={(e) => update({ date_from: e.target.value })} />
        </Field>
        <Field label="Created to">
          <input className="input" type="date" value={filters.date_to ?? ""} onChange={(e) => update({ date_to: e.target.value })} />
        </Field>
        <Field label="Sort by">
          <select className="input" value={filters.sort ?? "created_at"} onChange={(e) => update({ sort: e.target.value })}>
            <Options values={TASK_SORTS} labels={SORT_LABELS} />
          </select>
        </Field>
        <div className="filters-summary">
          {tasks.data && <span className="muted">Total: {tasks.data.pagination.total}</span>}
          {hasFilters && (
            <button type="button" className="btn btn-ghost" onClick={clear}>
              Clear filters
            </button>
          )}
        </div>
      </section>

      {tasks.isPending ? (
        <Loading label="Loading tasks" />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.data.data.length === 0 ? (
        <EmptyState
          title={hasFilters ? "No tasks match these filters" : "No tasks yet"}
          hint={hasFilters ? "Try clearing some filters." : "Create the first task with the button above."}
        />
      ) : (
        <>
          <div className="card-grid" aria-busy={tasks.isFetching}>
            {tasks.data.data.map((task) => (
              <TaskCard key={task.id} task={task} />
            ))}
          </div>
          <Pagination info={tasks.data.pagination} onChange={(page) => update({ page }, false)} />
        </>
      )}
    </>
  );
}
