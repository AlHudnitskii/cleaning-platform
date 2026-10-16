import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { getJson } from "../../api/client";
import type { Country, DashboardStats, ReportStats } from "../../api/types";

export interface ReportParams {
  date_from: string;
  date_to: string;
  country?: Country;
}

export const statsKeys = {
  all: ["stats"] as const,
  dashboard: ["stats", "dashboard"] as const,
  report: (params: ReportParams) => ["stats", "report", params] as const,
};

export function useDashboard() {
  return useQuery({ queryKey: statsKeys.dashboard, queryFn: () => getJson<DashboardStats>("/stats/dashboard") });
}

export function useReport(params: ReportParams) {
  return useQuery({
    queryKey: statsKeys.report(params),
    queryFn: () => getJson<ReportStats>("/stats/reports", { ...params }),
    placeholderData: keepPreviousData,
  });
}
