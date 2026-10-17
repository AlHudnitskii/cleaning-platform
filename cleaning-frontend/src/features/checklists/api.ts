import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type {
  ChecklistTemplate,
  ChecklistTemplateCreate,
  ChecklistTemplateUpdate,
  Country,
} from "../../api/types";

export const templateKeys = {
  all: ["checklist-templates"] as const,
  list: (country?: Country) => [...templateKeys.all, "list", { country }] as const,
};

export function useChecklistTemplates(country?: Country, enabled = true) {
  return useQuery({
    queryKey: templateKeys.list(country),
    queryFn: () => api.get<ChecklistTemplate[]>("/checklist-templates", { country }),
    enabled,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: ChecklistTemplateCreate) => api.post<ChecklistTemplate>("/checklist-templates", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useUpdateTemplate(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (changes: ChecklistTemplateUpdate) =>
      api.patch<ChecklistTemplate>(`/checklist-templates/${id}`, changes),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.all }),
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/checklist-templates/${id}`);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: templateKeys.all }),
  });
}
