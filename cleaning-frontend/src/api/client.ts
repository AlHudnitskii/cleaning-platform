import { expireSession, getAccessToken, saveProfile, setAccessToken, setSessionUser } from "../auth/session";
import { config } from "../config";
import { currentLocale } from "../i18n/locale";
import { networkError, responseError, toApiError } from "./errors";
import type { TokenResponse } from "./types";

type Params = Record<string, string | number | undefined>;

interface Request {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  params?: Params;
  body?: unknown;
}

const AUTH_PATHS = ["/auth/login", "/auth/refresh", "/auth/logout"];

let refreshInFlight: Promise<TokenResponse> | null = null;

export function applySession(session: TokenResponse): TokenResponse {
  setAccessToken(session.access_token);
  saveProfile(session.user);
  setSessionUser(session.user);
  return session;
}

export function refreshSession(): Promise<TokenResponse> {
  refreshInFlight ??= send({ method: "POST", path: "/auth/refresh" })
    .then(readJson)
    .then((session) => applySession(session as TokenResponse))
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

function buildUrl(path: string, params?: Params): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== "") query.set(key, String(value));
  }
  const search = query.toString();
  return `${config.apiBaseUrl}${path}${search ? `?${search}` : ""}`;
}

function encodeBody(body: unknown, headers: Headers): BodyInit | undefined {
  if (body === undefined) return undefined;
  if (body instanceof FormData) return body;
  headers.set("Content-Type", "application/json");
  return JSON.stringify(body);
}

async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

async function send(request: Request): Promise<Response> {
  const headers = new Headers({ "Accept-Language": currentLocale() });
  const token = getAccessToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const body = encodeBody(request.body, headers);
  let response: Response;
  try {
    response = await fetch(buildUrl(request.path, request.params), {
      method: request.method,
      headers,
      body,
      credentials: "include",
    });
  } catch {
    throw networkError();
  }
  if (!response.ok) throw responseError(response.status, await readJson(response).catch(() => null));
  return response;
}

async function authorized(request: Request): Promise<Response> {
  try {
    return await send(request);
  } catch (error) {
    const apiError = toApiError(error);
    if (apiError.kind !== "unauthorized" || AUTH_PATHS.some((path) => request.path.startsWith(path))) throw apiError;
    try {
      await refreshSession();
    } catch (refreshError) {
      if (toApiError(refreshError).kind === "unauthorized") expireSession();
      throw apiError;
    }
    return send(request);
  }
}

async function json<T>(request: Request): Promise<T> {
  return (await readJson(await authorized(request))) as T;
}

export const api = {
  get: <T>(path: string, params?: Params) => json<T>({ method: "GET", path, params }),
  post: <T = unknown>(path: string, body?: unknown, params?: Params) => json<T>({ method: "POST", path, body, params }),
  patch: <T = unknown>(path: string, body?: unknown) => json<T>({ method: "PATCH", path, body }),
  delete: (path: string) => json<unknown>({ method: "DELETE", path }),
  download: async (path: string, params?: Params) => {
    const response = await authorized({ method: "GET", path, params });
    return { blob: await response.blob(), headers: response.headers };
  },
};
