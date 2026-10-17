import type {
  ChecklistTemplate,
  LocationResponse,
  TaskPage,
  TaskResponse,
  TokenResponse,
  UserResponse,
} from "../api/types";

export function makeUser(overrides: Partial<UserResponse> = {}): UserResponse {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    email: "manager.de@cleaning.com",
    role: "manager",
    country: "DE",
    full_name: null,
    phone: null,
    avatar_url: null,
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
    assigned_to_name: null,
    rrule: null,
    is_recurring: false,
    parent_task_id: null,
    scheduled_for: null,
    priority: "normal",
    due_date: null,
    photo_required: false,
    checklist_done: 0,
    checklist_total: 0,
    photo_count: 0,
    review_blockers: [],
    quality_score: null,
    quality_comment: null,
    quality_reviewed_by: null,
    quality_reviewed_at: null,
    created_at: "2026-10-01T09:00:00+00:00",
    started_at: null,
    work_seconds: null,
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

export function makeLocation(overrides: Partial<LocationResponse> = {}): LocationResponse {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Germany",
    country: "DE",
    level: "country",
    parent_id: null,
    path: "77777777",
    full_name: "Germany",
    created_at: "2026-01-01T00:00:00+00:00",
    ...overrides,
  };
}

export function makeTemplate(overrides: Partial<ChecklistTemplate> = {}): ChecklistTemplate {
  return {
    id: "77777777-7777-4777-8777-777777777777",
    name: "Bathroom",
    country: "DE",
    items: ["Clean the sink", "Mop the floor"],
    created_at: "2026-10-01T09:00:00+00:00",
    ...overrides,
  };
}
