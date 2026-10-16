import { t } from "../i18n/locale";
import type { ValidationDetail } from "./types";

export type ApiErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "too_large"
  | "server"
  | "network"
  | "unknown";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly details: ValidationDetail[];

  constructor(kind: ApiErrorKind, message: string, status: number | null = null, details: ValidationDetail[] = []) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
    this.details = details;
  }

  get isNetwork(): boolean {
    return this.kind === "network";
  }
}

function kindForStatus(status: number): ApiErrorKind {
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 400 || status === 415 || status === 422) return "validation";
  if (status === 409) return "conflict";
  if (status === 413) return "too_large";
  if (status === 503) return "network";
  if (status >= 500) return "server";
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readDetails(value: unknown): ValidationDetail[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is ValidationDetail =>
      isRecord(item) && typeof item.field === "string" && typeof item.message === "string",
  );
}

function readBody(data: unknown): { message: string | null; details: ValidationDetail[]; offline: boolean } {
  if (!isRecord(data)) return { message: null, details: [], offline: false };
  return {
    message: typeof data.error === "string" ? data.error : null,
    details: readDetails(data.details),
    offline: data.offline === true,
  };
}

export function responseError(status: number, data: unknown): ApiError {
  const body = readBody(data);
  const kind = body.offline ? "network" : kindForStatus(status);
  const messages = t().errors;
  const message = kind === "server" ? messages.server : (body.message ?? messages[kind]);
  return new ApiError(kind, message, status, body.details);
}

export function networkError(): ApiError {
  return new ApiError("network", t().errors.network);
}

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  return new ApiError("unknown", t().errors.unknown);
}

export function errorMessage(error: unknown): string {
  const apiError = toApiError(error);
  if (apiError.details.length === 0) return apiError.message;
  return apiError.details.map((d) => `${d.field}: ${d.message}`).join("; ");
}

export function isNetworkError(error: unknown): boolean {
  return toApiError(error).isNetwork;
}
