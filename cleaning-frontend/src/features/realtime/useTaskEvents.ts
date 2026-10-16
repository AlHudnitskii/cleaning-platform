import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { refreshSession } from "../../api/client";
import { getAccessToken } from "../../auth/session";
import { config } from "../../config";
import { statsKeys } from "../stats/api";
import { taskKeys } from "../tasks/api";

const INITIAL_DELAY_MS = 2_000;
const MAX_DELAY_MS = 60_000;
const TASK_EVENTS = new Set(["task_created", "task_status_changed"]);

interface TaskEvent {
  type: string;
  data?: { task_id?: string };
}

function parseEvent(raw: string): TaskEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const event = value as Record<string, unknown>;
    if (typeof event.type !== "string") return null;
    const data = typeof event.data === "object" && event.data !== null ? (event.data as { task_id?: string }) : undefined;
    return { type: event.type, data };
  } catch {
    return null;
  }
}

export function useTaskEvents(enabled: boolean): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled || typeof EventSource === "undefined") return;

    let source: EventSource | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = INITIAL_DELAY_MS;
    let stopped = false;

    const connect = (token: string) => {
      source = new EventSource(`${config.sseUrl}?token=${encodeURIComponent(token)}`);
      source.onopen = () => {
        delay = INITIAL_DELAY_MS;
      };
      source.onmessage = (message: MessageEvent<string>) => {
        const event = parseEvent(message.data);
        if (!event || !TASK_EVENTS.has(event.type)) return;
        void queryClient.invalidateQueries({ queryKey: taskKeys.lists() });
        void queryClient.invalidateQueries({ queryKey: statsKeys.all });
        const taskId = event.data?.task_id;
        if (taskId) void queryClient.invalidateQueries({ queryKey: taskKeys.detail(taskId) });
      };
      source.onerror = () => {
        source?.close();
        source = null;
        if (!stopped) timer = setTimeout(reconnect, delay);
        delay = Math.min(delay * 2, MAX_DELAY_MS);
      };
    };

    const reconnect = () => {
      refreshSession()
        .then((session) => {
          if (!stopped) connect(session.access_token);
        })
        .catch(() => {
          if (!stopped) timer = setTimeout(reconnect, delay);
          delay = Math.min(delay * 2, MAX_DELAY_MS);
        });
    };

    const token = getAccessToken();
    if (token) connect(token);
    else reconnect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      source?.close();
    };
  }, [enabled, queryClient]);
}
