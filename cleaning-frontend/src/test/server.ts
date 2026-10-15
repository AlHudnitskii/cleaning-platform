import { http, HttpResponse } from "msw";
import { setupServer } from "msw/node";

import type { LocationResponse, UserResponse } from "../api/types";
import { makeSession } from "./fixtures";

export const server = setupServer(
  http.get("*/api/locations", () => HttpResponse.json<LocationResponse[]>([])),
  http.get("*/api/users/assignees", () => HttpResponse.json([])),
);

export function sessionHandlers(user: UserResponse) {
  return [http.post("*/api/auth/refresh", () => HttpResponse.json(makeSession(user)))];
}
