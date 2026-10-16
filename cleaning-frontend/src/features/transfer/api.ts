import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "../../api/client";
import type { Country, ImportResult } from "../../api/types";
import { invalidateTaskData } from "../tasks/api";

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
      const { blob, headers } = await api.download("/export/tasks", { ...params });
      const filename = exportFilename(params);
      saveBlob(blob, filename);
      return { filename, total: Number(headers.get("x-total-tasks") ?? 0) };
    },
  });
}

export function useDownloadTemplate() {
  return useMutation({
    mutationFn: async () => {
      const { blob } = await api.download("/import/template");
      saveBlob(blob, "import_template.xlsx");
    },
  });
}

async function uploadImport(file: File, dryRun: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const params = dryRun ? { dry_run: "true" } : undefined;
  return api.post<ImportResult>("/import/tasks", form, params);
}

export function useImportPreview() {
  return useMutation({ mutationFn: (file: File) => uploadImport(file, true) });
}

export function useImportTasks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadImport(file, false),
    onSuccess: (result) => {
      if (result.imported > 0) void invalidateTaskData(queryClient);
    },
  });
}
