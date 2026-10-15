import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { isNetworkError } from "../../api/errors";
import type { TaskPage } from "../../api/types";
import { fetchTasks, taskKeys, type TaskListParams } from "../tasks/api";
import { loadCachedTasks, saveCachedTasks } from "./offlineStore";

export interface MyTasksResult {
  page: TaskPage;
  fromCache: boolean;
}

export function useMyTasks(userId: string, params: TaskListParams) {
  return useQuery({
    queryKey: [...taskKeys.list(params), "offline-capable"],
    queryFn: async (): Promise<MyTasksResult> => {
      try {
        const page = await fetchTasks(params);
        saveCachedTasks(userId, page);
        return { page, fromCache: false };
      } catch (error) {
        const cached = isNetworkError(error) ? loadCachedTasks(userId) : null;
        if (!cached) throw error;
        return { page: cached, fromCache: true };
      }
    },
    placeholderData: keepPreviousData,
  });
}
