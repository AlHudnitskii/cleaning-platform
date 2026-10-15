import axios, { type AxiosRequestConfig, type InternalAxiosRequestConfig } from "axios";

import { expireSession, getAccessToken, saveProfile, setAccessToken } from "../auth/session";
import { config } from "../config";
import { toApiError } from "./errors";
import type { TokenResponse } from "./types";

const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout", "/auth/register"];

export const client = axios.create({
  baseURL: config.apiBaseUrl,
  withCredentials: true,
});

let refreshInFlight: Promise<TokenResponse> | null = null;

export function applySession(session: TokenResponse): TokenResponse {
  setAccessToken(session.access_token);
  saveProfile(session.user);
  return session;
}

export function refreshSession(): Promise<TokenResponse> {
  refreshInFlight ??= axios
    .post<TokenResponse>(`${config.apiBaseUrl}/auth/refresh`, null, { withCredentials: true })
    .then((response) => applySession(response.data))
    .catch((error: unknown) => {
      throw toApiError(error);
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

client.interceptors.request.use((request) => {
  const token = getAccessToken();
  if (token) request.headers.Authorization = `Bearer ${token}`;
  return request;
});

interface RetriableConfig extends InternalAxiosRequestConfig {
  retried?: boolean;
}

client.interceptors.response.use(undefined, async (error: unknown) => {
  const apiError = toApiError(error);
  const request = axios.isAxiosError(error) ? (error.config as RetriableConfig | undefined) : undefined;
  const isAuthCall = AUTH_PATHS.some((path) => request?.url?.startsWith(path));

  if (apiError.kind !== "unauthorized" || !request || request.retried || isAuthCall) {
    throw apiError;
  }

  request.retried = true;
  try {
    await refreshSession();
  } catch (refreshError) {
    if (toApiError(refreshError).kind === "unauthorized") expireSession();
    throw apiError;
  }
  return client(request as AxiosRequestConfig);
});

export async function getJson<T>(url: string, params?: Record<string, string | number | undefined>): Promise<T> {
  const response = await client.get<T>(url, { params: cleanParams(params) });
  return response.data;
}

export function cleanParams(
  params?: Record<string, string | number | undefined>,
): Record<string, string | number> | undefined {
  if (!params) return undefined;
  return Object.fromEntries(
    Object.entries(params).filter((entry): entry is [string, string | number] => entry[1] !== undefined && entry[1] !== ""),
  );
}
