import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { api } from "../../api/client";
import { isNetworkError } from "../../api/errors";
import type { SyncResult, TaskPage, TaskResponse, TaskStatus } from "../../api/types";
import { patchStatus, taskKeys } from "../tasks/api";
import type { MyTasksResult } from "./useMyTasks";
import { pendingChanges, queueStatusChange, removeChanges, useOnlineStatus, usePendingChanges } from "./offlineStore";

function applyLocally(queryClient: QueryClient, taskId: string, status: TaskStatus): void {
  const update = (task: TaskResponse): TaskResponse =>
    task.id === taskId ? { ...task, status, allowed_statuses: [] } : task;
  queryClient.setQueryData<TaskResponse>(taskKeys.detail(taskId), (task) => (task ? update(task) : task));
  const updatePage = (page: TaskPage): TaskPage => ({ ...page, data: page.data.map(update) });
  queryClient.setQueriesData<TaskPage | MyTasksResult>({ queryKey: taskKeys.lists() }, (value) => {
    if (!value) return value;
    return "fromCache" in value ? { ...value, page: updatePage(value.page) } : updatePage(value);
  });
}

export function useOfflineSync(userId: string) {
  const queryClient = useQueryClient();
  const online = useOnlineStatus();
  const pending = usePendingChanges(userId);

  const sync = useMutation({
    mutationFn: async (): Promise<SyncResult> => {
      const changes = pendingChanges(userId);
      if (changes.length === 0) return { synced: 0, errors: [] };
      const result = await api.post<SyncResult>("/sync/batch", { changes });
      removeChanges(userId, changes);
      return result;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: taskKeys.all }),
  });
  const { mutate: syncNow } = sync;

  useEffect(() => {
    if (online && pendingChanges(userId).length > 0) syncNow();
  }, [online, userId, syncNow]);

  const status = useMutation({
    mutationFn: async ({ taskId, target }: { taskId: string; target: TaskStatus }) => {
      try {
        return { task: await patchStatus(taskId, target), queued: false };
      } catch (error) {
        if (!isNetworkError(error)) throw error;
        queueStatusChange(userId, { task_id: taskId, status: target });
        applyLocally(queryClient, taskId, target);
        return { task: null, queued: true };
      }
    },
    onSuccess: ({ task }) => {
      if (!task) return;
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
      void queryClient.invalidateQueries({ queryKey: taskKeys.history(task.id) });
    },
  });

  return {
    online,
    pending,
    sync,
    rejected: sync.data?.errors ?? [],
    changeStatus: status,
  };
}
