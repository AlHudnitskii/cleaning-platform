import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { Country, LocationCreate, LocationResponse } from "../../api/types";

export const locationKeys = {
  all: ["locations"] as const,
  list: (country?: Country) => [...locationKeys.all, { country }] as const,
};

export function useLocations(country?: Country) {
  return useQuery({
    queryKey: locationKeys.list(country),
    queryFn: () => api.get<LocationResponse[]>("/locations", { country }),
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateLocation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: LocationCreate) => api.post<LocationResponse>("/locations", data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: locationKeys.all }),
  });
}

export interface LocationNode extends LocationResponse {
  children: LocationNode[];
}

export function buildTree(locations: LocationResponse[]): LocationNode[] {
  const nodes = new Map<string, LocationNode>();
  for (const location of locations) nodes.set(location.id, { ...location, children: [] });

  const roots: LocationNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parent_id ? nodes.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const byName = (a: LocationNode, b: LocationNode) => a.name.localeCompare(b.name);
  const sortDeep = (list: LocationNode[]) => {
    list.sort(byName);
    list.forEach((node) => {
      sortDeep(node.children);
    });
  };
  sortDeep(roots);
  return roots;
}

export function sortedByFullName(locations: LocationResponse[]): LocationResponse[] {
  return [...locations].sort((a, b) => a.full_name.localeCompare(b.full_name));
}

export function filterTree(nodes: LocationNode[], query: string): LocationNode[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return nodes;
  return nodes.flatMap((node) => {
    const children = filterTree(node.children, needle);
    if (node.name.toLowerCase().includes(needle) || children.length > 0) return [{ ...node, children }];
    return [];
  });
}
