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
import { t } from "../i18n/locale";
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
      <PageHeader title={t().myTasks.title} description={t().myTasks.description} />

      <SyncStatus offline={offline} fromCache={tasks.data?.fromCache ?? false} />

      <div className="toolbar toolbar-plain" role="group" aria-label={t().common.filters}>
        <FilterControl label={t().myTasks.status}>
          <Select
            variant="inline"
            value={filters.status ?? ""}
            options={withEmpty(t().common.all, optionList(TASK_STATUSES, t().status))}
            onChange={(status) => update({ status })}
          />
        </FilterControl>
        <FilterControl label={t().myTasks.sort}>
          <Select
            variant="inline"
            value={filters.sort}
            options={optionList(MY_TASK_SORTS, t().sort)}
            onChange={(sort) => update({ sort })}
          />
        </FilterControl>
        <span className="toolbar-spacer" />
        {tasks.data && <span className="toolbar-count">{t().myTasks.total(tasks.data.page.pagination.total)}</span>}
      </div>

      {tasks.isPending ? (
        <ListSkeleton label={t().myTasks.loading} columns={4} />
      ) : tasks.isError ? (
        <ErrorState error={tasks.error} onRetry={() => void tasks.refetch()} />
      ) : tasks.data.page.data.length === 0 ? (
        <EmptyState
          title={filters.status ? t().myTasks.noneWithStatus : t().myTasks.none}
          hint={t().myTasks.noneHint}
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
            noun={t().nouns.tasks(tasks.data.page.pagination.total)}
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
      {!offline.online && <Notice tone="warning">{t().myTasks.offline}</Notice>}
      {fromCache && <Notice tone="info">{t().myTasks.fromCache}</Notice>}
      {offline.changeStatus.isError && <Notice tone="error">{errorMessage(offline.changeStatus.error)}</Notice>}
      {offline.online && pendingCount > 0 && (
        <Notice tone="info">
          {offline.sync.isPending ? t().myTasks.syncing : t().myTasks.waiting(pendingCount)}{" "}
          {!offline.sync.isPending && (
            <button type="button" className="btn btn-secondary btn-small" onClick={() => offline.sync.mutate()}>
              {t().myTasks.syncNow}
            </button>
          )}
        </Notice>
      )}
      {offline.sync.isError && <Notice tone="error">{t().myTasks.syncFailed(errorMessage(offline.sync.error))}</Notice>}
      {offline.rejected.length > 0 && (
        <Notice tone="error">
          <p>{t().myTasks.rejected}</p>
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
