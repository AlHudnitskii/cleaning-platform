function readString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : fallback;
}

export const config = {
  apiBaseUrl: readString(import.meta.env.VITE_API_BASE_URL, "/api"),
  sseUrl: readString(import.meta.env.VITE_SSE_URL, "/events/stream"),
} as const;
