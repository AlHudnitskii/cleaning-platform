import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
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
  return useQuery({ queryKey: userKeys.list(filters), queryFn: () => api.get<UserResponse[]>("/users", { ...filters }) });
}

export function useAssignees(country: Country | undefined, enabled = true) {
  return useQuery({
    queryKey: userKeys.assignees(country),
    queryFn: () => api.get<AssigneeResponse[]>("/users/assignees", { country }),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: UserCreate) => api.post<UserResponse>("/users", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useToggleActive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.patch<UserResponse>(`/users/${userId}/toggle-active`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: userKeys.all }),
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: (data: { old_password: string; new_password: string }) =>
      api.patch<TokenResponse>("/users/me/password", data),
  });
}
