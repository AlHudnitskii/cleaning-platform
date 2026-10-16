import { useMutation, useQueryClient } from "@tanstack/react-query";

import { client, cleanParams } from "../../api/client";
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

async function uploadImport(file: File, dryRun: boolean): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file);
  const params = dryRun ? { dry_run: "true" } : undefined;
  return (await client.post<ImportResult>("/import/tasks", form, { params })).data;
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
