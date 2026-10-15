import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { client, getJson } from "../../api/client";
import type {
  CommentResponse,
  Country,
  HistoryEntryResponse,
  OccurrencesResponse,
  PhotoResponse,
  TaskCreate,
  TaskPage,
  TaskPriority,
  TaskResponse,
  TaskSort,
  TaskStatus,
} from "../../api/types";

export interface TaskListParams {
  page: number;
  limit: number;
  sort?: TaskSort;
  status?: TaskStatus;
  priority?: TaskPriority;
  country?: Country;
  location_id?: string;
  date_from?: string;
  date_to?: string;
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
};

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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: taskKeys.lists() }),
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
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
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
    onSuccess: (photo) => queryClient.invalidateQueries({ queryKey: taskKeys.photos(photo.task_id) }),
  });
}

export function useReviewQuality(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (review: { score: number; comment?: string }) =>
      (await client.post<TaskResponse>(`/tasks/${id}/quality`, review)).data,
    onSuccess: (task) => {
      queryClient.setQueryData(taskKeys.detail(id), task);
      void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
