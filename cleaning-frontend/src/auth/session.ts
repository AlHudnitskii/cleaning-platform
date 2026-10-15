import { COUNTRIES, USER_ROLES, type UserResponse } from "../api/types";

const PROFILE_KEY = "profile";

type ExpiredListener = () => void;

let accessToken: string | null = null;
const expiredListeners = new Set<ExpiredListener>();

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function onSessionExpired(listener: ExpiredListener): () => void {
  expiredListeners.add(listener);
  return () => expiredListeners.delete(listener);
}

export function expireSession(): void {
  accessToken = null;
  expiredListeners.forEach((listener) => {
    listener();
  });
}

function isProfile(value: unknown): value is UserResponse {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.email === "string" &&
    typeof v.role === "string" &&
    (USER_ROLES as readonly string[]).includes(v.role) &&
    (v.country === null || (typeof v.country === "string" && (COUNTRIES as readonly string[]).includes(v.country))) &&
    typeof v.is_active === "boolean" &&
    typeof v.created_at === "string"
  );
}

export function loadProfile(): UserResponse | null {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isProfile(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveProfile(profile: UserResponse | null): void {
  try {
    if (profile) localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
    else localStorage.removeItem(PROFILE_KEY);
  } catch {
    return;
  }
}
