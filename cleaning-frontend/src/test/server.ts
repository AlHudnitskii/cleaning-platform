import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { LocationResponse, UserResponse } from "../api/types";
import { makePage, makeSession } from "./fixtures";

export const server = setupServer(
  http.get("*/api/locations", () => HttpResponse.json<LocationResponse[]>([])),
  http.get("*/api/users/assignees", () => HttpResponse.json([])),
  http.get("*/api/tasks", () => HttpResponse.json(makePage([]))),
  http.get("*/api/tasks/:id/checklist", () => HttpResponse.json([])),
  http.get("*/api/checklist-templates", () => HttpResponse.json([])),
  http.get("*/api/profile/stats", () =>
    HttpResponse.json({
      period_days: 30,
      completed: 0,
      open: 0,
      on_review: 0,
      overdue: 0,
      avg_quality: null,
      avg_work_seconds: null,
    }),
  ),
);

export function sessionHandlers(user: UserResponse) {
  return [http.post("*/api/auth/refresh", () => HttpResponse.json(makeSession(user)))];
}
