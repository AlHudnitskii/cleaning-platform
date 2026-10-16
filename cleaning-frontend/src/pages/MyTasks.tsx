import { errorMessage } from "../api/errors";
import { TASK_STATUSES, type TaskSort, type TaskStatus } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { EmptyState, ErrorState, ListSkeleton, Notice } from "../components/Feedback";
import { FilterControl } from "../components/Field";
import { optionList, withEmpty } from "../components/options";
import { PageHeader } from "../components/PageHeader";
import { Pagination } from "../components/Pagination";
import { Select } from "../components/Select";
import { useMyTasks } from "../features/offline/useMyTasks";
import { useOfflineSync } from "../features/offline/useOfflineSync";
import { PhotoUpload } from "../features/tasks/PhotoUpload";
import { StatusActions } from "../features/tasks/StatusActions";
import { TaskCard } from "../features/tasks/TaskCard";
import { SORT_LABELS, STATUS_LABELS } from "../labels";
import { readEnum, readPage, useUrlState } from "../urlState";

const PAGE_SIZE = 20;
const MY_TASK_SORTS: readonly TaskSort[] = ["priority", "due_date", "created_at", "status"];

export function MyTasks() {
  const user = useCurrentUser();
  const { params, update } = useUrlState();
  const offline = useOfflineSync(user.id);

  const filters = {
    page: readPage(params),
    limit: PAGE_SIZE,
    status: readEnum<TaskStatus>(params, "status", TASK_STATUSES),
    sort: readEnum<TaskSort>(params, "sort", MY_TASK_SORTS) ?? "priority",
  };
  const tasks = useMyTasks(user.id, filters);
  const queuedIds = new Set(offline.pending.map((change) => change.task_id));

  return (
    <>
      <PageHeader title="My tasks" description="Tasks assigned to you. Status changes made offline sync automatically." />

      <SyncStatus offline={offline} fromCache={tasks.data?.fromCache ?? false} />

      <div className="toolbar toolbar-plain" role="group" aria-label="Filters">
        <FilterControl label="Status">
          <Select
            variant="inline"
            value={filters.status ?? ""}
            options={withEmpty("All", optionList(TASK_STATUSES, STATUS_LABELS))}
            onChange={(status) => update({ status })}
          />
        </FilterControl>
        <FilterControl label="Sort">
          <Select
            variant="inline"
            value={filters.sort}
            options={optionList(MY_TASK_SORTS, SORT_LABELS)}
            onChange={(sort) => update({ sort })}
          />
        </FilterControl>
        <span className="toolbar-spacer" />
        {tasks.data && <span className="toolbar-count">{tasks.data.page.pagination.total} total</span>}
      </div>

      {tasks.isPending ? (
        <ListSkeleton label="Loading your tasks" columns={4} />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.data.page.data.length === 0 ? (
        <EmptyState
          title={filters.status ? "No tasks with this status" : "No tasks assigned to you"}
          hint="New assignments appear here automatically."
        />
      ) : (
        <>
          <div className="card-list">
            {tasks.data.page.data.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                pending={queuedIds.has(task.id)}
                actions={
                  <>
                    <StatusActions
                      task={task}
                      disabled={offline.changeStatus.isPending}
                      onChange={(status) => offline.changeStatus.mutate({ taskId: task.id, target: status })}
                    />
                    <PhotoUpload taskId={task.id} online={offline.online} />
                  </>
                }
              />
            ))}
          </div>
          <Pagination
            info={tasks.data.page.pagination}
            shown={tasks.data.page.data.length}
            noun="tasks"
            onPageChange={(page) => update({ page }, false)}
          />
        </>
      )}
    </>
  );
}

function SyncStatus({ offline, fromCache }: { offline: ReturnType<typeof useOfflineSync>; fromCache: boolean }) {
  const pendingCount = offline.pending.length;
  return (
    <>
      {!offline.online && <Notice tone="warning">You are offline. Changes will sync when the connection is back.</Notice>}
      {fromCache && <Notice tone="info">Showing the last saved copy of your tasks.</Notice>}
      {offline.changeStatus.isError && <Notice tone="error">{errorMessage(offline.changeStatus.error)}</Notice>}
      {offline.online && pendingCount > 0 && (
        <Notice tone="info">
          {offline.sync.isPending ? "Syncing changes…" : `${pendingCount} change(s) waiting to sync.`}{" "}
          {!offline.sync.isPending && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => offline.sync.mutate()}>
              Sync now
            </button>
          )}
        </Notice>
      )}
      {offline.sync.isError && <Notice tone="error">Sync failed: {errorMessage(offline.sync.error)}</Notice>}
      {offline.rejected.length > 0 && (
        <Notice tone="error">
          <p>Some offline changes were rejected by the server:</p>
          <ul>
            {offline.rejected.map((rejection, index) => (
              <li key={`${rejection.task_id ?? "unknown"}-${index}`}>{rejection.error}</li>
            ))}
          </ul>
        </Notice>
      )}
    </>
  );
}
