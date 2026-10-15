import { isAxiosError } from "axios";

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

const DEFAULT_MESSAGES: Record<ApiErrorKind, string> = {
  unauthorized: "Your session has expired. Please sign in again.",
  forbidden: "You do not have access to this action.",
  not_found: "Not found.",
  validation: "Please check the entered values.",
  conflict: "The action conflicts with the current state.",
  too_large: "The file is too large.",
  server: "The server failed to process the request. Try again later.",
  network: "No connection to the server.",
  unknown: "Something went wrong.",
};

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

export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) return error;
  if (isAxiosError(error)) {
    if (!error.response) return new ApiError("network", DEFAULT_MESSAGES.network);
    const status = error.response.status;
    const body = readBody(error.response.data);
    const kind = body.offline ? "network" : kindForStatus(status);
    const message = kind === "server" ? DEFAULT_MESSAGES.server : (body.message ?? DEFAULT_MESSAGES[kind]);
    return new ApiError(kind, message, status, body.details);
  }
  return new ApiError("unknown", DEFAULT_MESSAGES.unknown);
}

export function errorMessage(error: unknown): string {
  const apiError = toApiError(error);
  if (apiError.details.length === 0) return apiError.message;
  return apiError.details.map((d) => `${d.field}: ${d.message}`).join("; ");
}

export function isNetworkError(error: unknown): boolean {
  return toApiError(error).isNetwork;
}
