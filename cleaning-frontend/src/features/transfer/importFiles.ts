import { t } from "../../i18n/locale";

const MAX_BYTES = 5 * 1024 * 1024;

export const ACCEPTED = [".xlsx", ".csv"];

export function formatSize(bytes: number): string {
  if (bytes < 1024) return t().importing.bytes(bytes);
  if (bytes < 1024 * 1024) return t().importing.kb((bytes / 1024).toFixed(1));
  return t().importing.mb((bytes / (1024 * 1024)).toFixed(1));
}

export function fileProblem(file: File): string | null {
  if (!ACCEPTED.some((extension) => file.name.toLowerCase().endsWith(extension))) return t().importing.wrongType;
  if (file.size > MAX_BYTES) return t().importing.tooLarge;
  return null;
}
