import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { Country, DashboardStats, ProfileStats, ReportStats } from "../../api/types";

export interface ReportParams {
  date_from: string;
  date_to: string;
  country?: Country;
}

export const statsKeys = {
  all: ["stats"] as const,
  dashboard: ["stats", "dashboard"] as const,
  report: (params: ReportParams) => ["stats", "report", params] as const,
  profile: ["stats", "profile"] as const,
};

export function useProfileStats() {
  return useQuery({ queryKey: statsKeys.profile, queryFn: () => api.get<ProfileStats>("/profile/stats") });
}

export function useDashboard() {
  return useQuery({ queryKey: statsKeys.dashboard, queryFn: () => api.get<DashboardStats>("/stats/dashboard") });
}

export function useReport(params: ReportParams) {
  return useQuery({
    queryKey: statsKeys.report(params),
    queryFn: () => api.get<ReportStats>("/stats/reports", { ...params }),
    placeholderData: keepPreviousData,
  });
}
