import { keepPreviousData, useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";

import { client, getJson } from "../../api/client";
import type {
  ChecklistItem,
  CommentResponse,
  Country,
  HistoryEntryResponse,
  OccurrencesResponse,
  PhotoResponse,
  TaskCreate,
  TaskUpdate,
  TaskPage,
  TaskPriority,
  TaskResponse,
  SortOrder,
  TaskSort,
  TaskStatus,
} from "../../api/types";
import { statsKeys } from "../stats/api";

export interface TaskListParams {
  page: number;
  limit: number;
  sort?: TaskSort;
  order?: SortOrder;
  status?: TaskStatus;
  priority?: TaskPriority;
  country?: Country;
  location_id?: string;
  date_from?: string;
  date_to?: string;
  search?: string;
  overdue?: "true";
}

export const taskKeys = {
  all: ["tasks"] as const,
  lists: () => [...taskKeys.all, "list"] as const,
  list: (params: TaskListParams) => [...taskKeys.lists(), params] as const,
  detail: (id: string) => [...taskKeys.all, "detail", id] as const,
  comments: (id: string) => [...taskKeys.detail(id), "comments"] as const,
  history: (id: string) => [...taskKeys.detail(id), "history"] as const,
  photos: (id: string) => [...taskKeys.detail(id), "photos"] as const,
  occurrences: (id: string) => [...taskKeys.detail(id), "occurrences"] as const,
  checklist: (id: string) => [...taskKeys.detail(id), "checklist"] as const,
};

export async function invalidateTaskData(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
    queryClient.invalidateQueries({ queryKey: statsKeys.all }),
  ]);
}

export function useTaskCount(status: TaskStatus, enabled = true) {
  return useQuery({
    queryKey: taskKeys.list({ page: 1, limit: 1, status }),
    queryFn: () => fetchTasks({ page: 1, limit: 1, status }),
    select: (page) => page.pagination.total,
    enabled,
  });
}

export function fetchTasks(params: TaskListParams): Promise<TaskPage> {
  return getJson<TaskPage>("/tasks", { ...params });
}

export function useTasks(params: TaskListParams) {
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => fetchTasks(params),
    placeholderData: keepPreviousData,
  });
}

export function useTask(id: string) {
  return useQuery({ queryKey: taskKeys.detail(id), queryFn: () => getJson<TaskResponse>(`/tasks/${id}`) });
}

export function useComments(id: string) {
  return useQuery({
    queryKey: taskKeys.comments(id),
    queryFn: () => getJson<CommentResponse[]>(`/tasks/${id}/comments`),
  });
}

export function useHistory(id: string) {
  return useQuery({
    queryKey: taskKeys.history(id),
    queryFn: () => getJson<HistoryEntryResponse[]>(`/tasks/${id}/history`),
  });
}

export function usePhotos(id: string) {
  return useQuery({ queryKey: taskKeys.photos(id), queryFn: () => getJson<PhotoResponse[]>(`/tasks/${id}/photos`) });
}

export function useOccurrences(id: string, enabled: boolean) {
  return useQuery({
    queryKey: taskKeys.occurrences(id),
    queryFn: () => getJson<OccurrencesResponse>(`/tasks/${id}/occurrences`),
    enabled,
  });
}

export function useCreateTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: TaskCreate) => (await client.post<TaskResponse>("/tasks", data)).data,
    onSuccess: () => invalidateTaskData(queryClient),
  });
}

export function useUpdateTask(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (changes: TaskUpdate) => (await client.patch<TaskResponse>(`/tasks/${id}`, changes)).data,
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void invalidateTaskData(queryClient);
    },
  });
}

export function useDeleteTask() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/tasks/${id}`);
      return id;
    },
    onSuccess: (id) => {
      queryClient.removeQueries({ queryKey: taskKeys.detail(id) });
      void invalidateTaskData(queryClient);
    },
  });
}

export async function patchStatus(id: string, status: TaskStatus): Promise<TaskResponse> {
  return (await client.patch<TaskResponse>(`/tasks/${id}/status`, { status })).data;
}

export function useChangeStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) => patchStatus(id, status),
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(task.id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.history(task.id) });
      void invalidateTaskData(queryClient);
    },
  });
}

export function useAddComment(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) => (await client.post<CommentResponse>(`/tasks/${id}/comments`, { text })).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.comments(id) }),
  });
}

export function useUploadPhoto() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const form = new FormData();
      form.append("photo", file);
      return (await client.post<PhotoResponse>(`/tasks/${id}/photos`, form)).data;
    },
    onSuccess: (photo) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: taskKeys.photos(photo.task_id) }),
        queryClient.invalidateQueries({ queryKey: taskKeys.detail(photo.task_id), exact: true }),
        invalidateTaskData(queryClient),
      ]),
  });
}

export function useReviewQuality(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (review: { score: number; comment?: string }) =>
      (await client.post<TaskResponse>(`/tasks/${id}/quality`, review)).data,
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(id), task);
      void invalidateTaskData(queryClient);
    },
  });
}

const BULK_CONCURRENCY = 5;

export interface BulkStatusResult {
  updated: number;
  failed: number;
  skipped: number;
}

export function useBulkStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ tasks, status }: { tasks: TaskResponse[]; status: TaskStatus }): Promise<BulkStatusResult> => {
      const eligible = tasks.filter((task) => task.allowed_statuses.includes(status));
      let updated = 0;
      let failed = 0;
      for (let start = 0; start < eligible.length; start += BULK_CONCURRENCY) {
        const batch = eligible.slice(start, start + BULK_CONCURRENCY);
        const results = await Promise.allSettled(batch.map((task) => patchStatus(task.id, status)));
        updated += results.filter((result) => result.status === "fulfilled").length;
        failed += results.filter((result) => result.status === "rejected").length;
      }
      return { updated, failed, skipped: tasks.length - eligible.length };
    },
    onSettled: () => Promise.all([queryClient.invalidateQueries({ queryKey: taskKeys.all }), invalidateTaskData(queryClient)]),
  });
}

export function useChecklist(taskId: string) {
  return useQuery({
    queryKey: taskKeys.checklist(taskId),
    queryFn: () => getJson<ChecklistItem[]>(`/tasks/${taskId}/checklist`),
  });
}

function refreshChecklist(queryClient: QueryClient, taskId: string): Promise<unknown> {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: taskKeys.checklist(taskId) }),
    queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId), exact: true }),
    invalidateTaskData(queryClient),
  ]);
}

export function useAddChecklistItem(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (text: string) =>
      (await client.post<ChecklistItem>(`/tasks/${taskId}/checklist`, { text })).data,
    onSettled: () => refreshChecklist(queryClient, taskId),
  });
}

export function useToggleChecklistItem(taskId: string) {
  const queryClient = useQueryClient();
  const key = taskKeys.checklist(taskId);
  return useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) =>
      (await client.patch<ChecklistItem>(`/tasks/${taskId}/checklist/${id}`, { done })).data,
    onMutate: async ({ id, done }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const previous = queryClient.getQueryData<ChecklistItem[]>(key);
      queryClient.setQueryData<ChecklistItem[]>(key, (items) =>
        items?.map((item) => (item.id === id ? { ...item, done } : item)),
      );
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(key, context.previous);
    },
    onSettled: () => refreshChecklist(queryClient, taskId),
  });
}

export function useDeleteChecklistItem(taskId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await client.delete(`/tasks/${taskId}/checklist/${id}`);
    },
    onSettled: () => refreshChecklist(queryClient, taskId),
  });
}
