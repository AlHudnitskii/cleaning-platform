import { useMutation, useQueryClient } from "@tanstack/react-query";

import { client, cleanParams } from "../../api/client";
import type { Country, ImportResult } from "../../api/types";
import { taskKeys } from "../tasks/api";

export type ExportFormat = "excel" | "parquet";

export interface ExportParams {
  date_from: string;
  date_to: string;
  format: ExportFormat;
  country?: Country;
}

function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function exportFilename(params: ExportParams): string {
  return `tasks_${params.date_from}_${params.date_to}.${params.format === "excel" ? "xlsx" : "parquet"}`;
}

export function useExportTasks() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const response = await client.get<Blob>("/export/tasks", { params: cleanParams({ ...params }), responseType: "blob" });
      const filename = exportFilename(params);
      saveBlob(response.data, filename);
      return { filename, total: Number(response.headers["x-total-tasks"] ?? 0) };
    },
  });
}

export function useDownloadTemplate() {
  return useMutation({
    mutationFn: async () => {
      const response = await client.get<Blob>("/import/template", { responseType: "blob" });
      saveBlob(response.data, "import_template.xlsx");
    },
  });
}

export function useImportTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return (await client.post<ImportResult>("/import/tasks", form)).data;
    },
    onSuccess: (result) => {
      if (result.imported > 0) void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
    },
  });
}
