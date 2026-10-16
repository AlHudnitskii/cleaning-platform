import { useState } from "react";

import { errorMessage } from "../api/errors";
import {
  COUNTRIES,
  SORT_ORDERS,
  TASK_PRIORITIES,
  TASK_SORTS,
  TASK_STATUSES,
  type Country,
  type SortOrder,
  type TaskPriority,
  type TaskResponse,
  type TaskSort,
  type TaskStatus,
} from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { Drawer } from "../components/Drawer";
import { EmptyState, ErrorState, ListSkeleton } from "../components/Feedback";
import { FilterControl } from "../components/Field";
import { Icon } from "../components/Icon";
import { optionList } from "../components/options";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { Select } from "../components/Select";
import { showToast } from "../components/toast";
import { useLocations } from "../features/locations/api";
import { useBulkStatus, useChangeStatus, useTasks, type TaskListParams } from "../features/tasks/api";
import { BulkBar } from "../features/tasks/BulkBar";
import { TaskForm } from "../features/tasks/TaskForm";
import { ActiveFilters, FilterMenu, SearchBox } from "../features/tasks/TaskFilters";
import { TaskTable } from "../features/tasks/TaskTable";
import { SORT_LABELS, STATUS_LABELS, countryName } from "../labels";
import { useShortcut } from "../shortcuts";
import { nextSort, type SortDirection, type SortState } from "../sorting";
import { PAGE_SIZES, readDate, readEnum, readId, readPage, readPageSize, useUrlState } from "../urlState";

const MAX_SEARCH = 200;
const NO_SELECTION: ReadonlySet<string> = new Set();
const DESCENDING_FIRST: readonly TaskSort[] = ["created_at", "priority"];

function naturalDirection(key: TaskSort): SortDirection {
  return DESCENDING_FIRST.includes(key) ? "desc" : "asc";
}

export function Tasks() {
  const user = useCurrentUser();
  const isAdmin = user.role === "admin";
  const { params, update, clear } = useUrlState();
  const [creating, setCreating] = useState(false);
  useShortcut("n", () => setCreating(true));

  const filters: TaskListParams = {
    page: readPage(params),
    limit: readPageSize(params),
    sort: readEnum<TaskSort>(params, "sort", TASK_SORTS),
    order: readEnum<SortOrder>(params, "order", SORT_ORDERS),
    status: readEnum<TaskStatus>(params, "status", TASK_STATUSES),
    priority: readEnum<TaskPriority>(params, "priority", TASK_PRIORITIES),
    country: isAdmin ? readEnum<Country>(params, "country", COUNTRIES) : undefined,
    location_id: readId(params, "location_id"),
    date_from: readDate(params, "date_from"),
    date_to: readDate(params, "date_to"),
    search: params.get("search")?.trim().slice(0, MAX_SEARCH) || undefined,
    overdue: params.get("overdue") === "true" ? "true" : undefined,
  };
  const tasks = useTasks(filters);
  const changeStatus = useChangeStatus();
  const bulkStatus = useBulkStatus();
  const listKey = JSON.stringify(filters);
  const [selection, setSelection] = useState<{ key: string; ids: ReadonlySet<string> }>({ key: listKey, ids: NO_SELECTION });
  const selected = selection.key === listKey ? selection.ids : NO_SELECTION;
  const selectedTasks = (tasks.data?.data ?? []).filter((task) => selected.has(task.id));

  const select = (ids: string[], checked: boolean) => {
    const next = new Set(selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    setSelection({ key: listKey, ids: next });
  };

  const clearSelection = () => setSelection({ key: listKey, ids: NO_SELECTION });

  const applyBulk = (status: TaskStatus) => {
    bulkStatus.mutate(
      { tasks: selectedTasks, status },
      {
        onSuccess: (result) => {
          const parts = [`${result.updated} moved to ${STATUS_LABELS[status]}`];
          if (result.skipped > 0) parts.push(`${result.skipped} skipped`);
          if (result.failed > 0) parts.push(`${result.failed} failed`);
          showToast(parts.join(" · "), result.failed > 0 ? "error" : "success");
          clearSelection();
        },
        onError: (error) => showToast(errorMessage(error), "error"),
      },
    );
  };
  const advancingId = changeStatus.isPending ? changeStatus.variables.id : null;

  const advance = (task: TaskResponse, status: TaskStatus) => {
    changeStatus.mutate(
      { id: task.id, status },
      {
        onSuccess: (updated) => showToast(`“${updated.title}” moved to ${STATUS_LABELS[updated.status]}`),
        onError: (error) => showToast(errorMessage(error), "error"),
      },
    );
  };
  const locations = useLocations(filters.country);
  const locationList = locations.data ?? [];
  const hasFilters = [...params.keys()].some((key) => !["page", "sort", "order", "limit"].includes(key));
  const sortKey = filters.sort ?? "created_at";
  const sort: SortState<TaskSort> = { key: sortKey, direction: filters.order ?? naturalDirection(sortKey) };

  const applySort = (next: SortState<TaskSort>) => {
    update({
      sort: next.key === "created_at" ? undefined : next.key,
      order: next.direction === naturalDirection(next.key) ? undefined : next.direction,
    });
  };

  return (
    <>
      <PageHeader
        title="Tasks"
        description={isAdmin ? "All cleaning tasks across countries." : `Cleaning tasks in ${countryName(user.country)}.`}
        actions={
          <button type="button" className="btn btn-primary" aria-keyshortcuts="n" onClick={() => setCreating(true)}>
            <Icon name="plus" size={15} />
            Create task
          </button>
        }
      />

      {creating && (
        <Drawer title="New task" description="The assignee gets a notification right away." onClose={() => setCreating(false)}>
          <TaskForm
            user={user}
            onCancel={() => setCreating(false)}
            onSaved={(task) => {
              setCreating(false);
              showToast(`Task “${task.title}” created`);
            }}
          />
        </Drawer>
      )}

      <section className="list-card" aria-label="Task list">
        <div className="toolbar">
          <SearchBox value={filters.search ?? ""} onSearch={(search) => update({ search })} />
          <FilterMenu filters={filters} locations={locationList} showCountry={isAdmin} onChange={update} />
          <span className="toolbar-spacer" />
          <div className="toolbar-compact-sort">
            <FilterControl label="Sort">
              <Select
                variant="inline"
                value={sortKey}
                options={optionList(TASK_SORTS, SORT_LABELS)}
                onChange={(key) => applySort({ key, direction: naturalDirection(key) })}
              />
            </FilterControl>
          </div>
        </div>
        <ActiveFilters filters={filters} locations={locationList} onChange={update} onClear={clear} />

        {tasks.isPending ? (
          <ListSkeleton label="Loading tasks" columns={isAdmin ? 8 : 7} />
        ) : tasks.isError ? (
          <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
        ) : tasks.data.data.length === 0 ? (
          <EmptyState
            title={hasFilters ? "No tasks match these filters" : "No tasks yet"}
            hint={hasFilters ? "Try another search or remove some filters." : "Create the first task with the button above."}
          />
        ) : (
          <>
            <TaskTable
              tasks={tasks.data.data}
              firstNumber={(tasks.data.pagination.page - 1) * tasks.data.pagination.limit + 1}
              showCountry={isAdmin}
              busy={tasks.isFetching}
              sort={sort}
              onSort={(column) => applySort(nextSort(sort, column, naturalDirection))}
              onAdvance={advance}
              advancingId={advancingId}
              selected={selected}
              onSelect={select}
            />
            {selectedTasks.length > 0 && (
              <BulkBar
                tasks={selectedTasks}
                busy={bulkStatus.isPending}
                onChangeStatus={applyBulk}
                onClear={clearSelection}
              />
            )}
            <Pagination
              info={tasks.data.pagination}
              shown={tasks.data.data.length}
              noun="tasks"
              onPageChange={(page) => update({ page }, false)}
              pageSizes={PAGE_SIZES}
              onPageSizeChange={(limit) => update({ limit })}
            />
          </>
        )}
      </section>
    </>
  );
}
