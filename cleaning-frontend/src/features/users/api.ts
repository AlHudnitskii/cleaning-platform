import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { client, getJson } from "../../api/client";
import type { AssigneeResponse, Country, TokenResponse, UserCreate, UserResponse, UserRole } from "../../api/types";

export interface UserFilters {
  role?: UserRole;
  country?: Country;
}

export const userKeys = {
  all: ["users"] as const,
  list: (filters: UserFilters) => [...userKeys.all, "list", filters] as const,
  assignees: (country?: Country) => [...userKeys.all, "assignees", { country }] as const,
};

export function useUsers(filters: UserFilters) {
  return useQuery({ queryKey: userKeys.list(filters), queryFn: () => getJson<UserResponse[]>("/users", { ...filters }) });
}

export function useAssignees(country: Country | undefined, enabled = true) {
  return useQuery({
    queryKey: userKeys.assignees(country),
    queryFn: () => getJson<AssigneeResponse[]>("/users/assignees", { country }),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: UserCreate) => (await client.post<UserResponse>("/users", data)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useToggleActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => (await client.patch<UserResponse>(`/users/${userId}/toggle-active`)).data,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (data: { old_password: string; new_password: string }) =>
      (await client.patch<TokenResponse>("/users/me/password", data)).data,
  });
}
