import type { TaskPage, TaskResponse, TokenResponse, UserResponse } from "../api/types";

export function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "manager.de@cleaning.com",
    role: "manager",
    country: "DE",
    is_active: true,
    created_at: "2026-01-01T10:00:00+00:00",
    ...overrides,
  };
}

export const MANAGER = makeUser();
export const ADMIN = makeUser({
  id: "22222222-2222-4222-8222-222222222222",
  email: "admin@cleaning.com",
  role: "admin",
  country: null,
});
export const CLEANER = makeUser({
  id: "33333333-3333-4333-8333-333333333333",
  email: "cleaner1@cleaning.com",
  role: "cleaner",
});

export function makeSession(user: UserResponse, token = `token-${user.role}`): TokenResponse {
  return { access_token: token, token_type: "bearer", user };
}

export function makeTask(overrides: Partial<TaskResponse> = {}): TaskResponse {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    title: "Clean lobby",
    description: null,
    status: "pending",
    country: "DE",
    location_id: null,
    location_name: null,
    location_path: [],
    assigned_to: CLEANER.id,
    assigned_to_email: CLEANER.email,
    rrule: null,
    is_recurring: false,
    scheduled_for: null,
    priority: "normal",
    quality_score: null,
    quality_comment: null,
    quality_reviewed_by: null,
    quality_reviewed_at: null,
    created_at: "2026-10-01T09:00:00+00:00",
    allowed_statuses: ["in_progress", "on_hold", "cancelled"],
    ...overrides,
  };
}

export function makePage(tasks: TaskResponse[], overrides: Partial<TaskPage["pagination"]> = {}): TaskPage {
  return {
    data: tasks,
    pagination: { page: 1, limit: 12, total: tasks.length, pages: 1, ...overrides },
  };
}
