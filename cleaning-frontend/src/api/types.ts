export const TASK_STATUSES = ["pending", "in_progress", "on_review", "completed", "on_hold", "cancelled"] as const;
export const TASK_PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export const USER_ROLES = ["admin", "manager", "cleaner"] as const;
export const LOCATION_LEVELS = ["country", "city", "building", "floor", "room"] as const;
export const COUNTRIES = ["DE", "DK", "IT", "AU", "US", "GB", "FR", "ES", "PL", "NL", "SE", "NO", "FI", "CH", "AT"] as const;
export const TASK_SORTS = [
  "created_at",
  "priority",
  "status",
  "title",
  "country",
  "location",
  "assignee",
  "due_date",
] as const;
export const SORT_ORDERS = ["asc", "desc"] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = (typeof TASK_PRIORITIES)[number];
export type UserRole = (typeof USER_ROLES)[number];
export type LocationLevel = (typeof LOCATION_LEVELS)[number];
export type Country = (typeof COUNTRIES)[number];
export type TaskSort = (typeof TASK_SORTS)[number];
export type SortOrder = (typeof SORT_ORDERS)[number];

export interface UserResponse {
  id: string;
  email: string;
  role: UserRole;
  country: Country | null;
  is_active: boolean;
  created_at: string;
}

export interface AssigneeResponse {
  id: string;
  email: string;
  country: Country | null;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
  user: UserResponse;
}

export interface TaskResponse {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  country: Country;
  location_id: string | null;
  location_name: string | null;
  location_path: string[];
  assigned_to: string | null;
  assigned_to_email: string | null;
  rrule: string | null;
  is_recurring: boolean;
  parent_task_id: string | null;
  scheduled_for: string | null;
  priority: TaskPriority;
  due_date: string | null;
  photo_required: boolean;
  checklist_done: number;
  checklist_total: number;
  photo_count: number;
  review_blockers: ReviewBlocker[];
  quality_score: number | null;
  quality_comment: string | null;
  quality_reviewed_by: string | null;
  quality_reviewed_at: string | null;
  created_at: string;
  started_at: string | null;
  work_seconds: number | null;
  allowed_statuses: TaskStatus[];
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface TaskPage {
  data: TaskResponse[];
  pagination: Pagination;
}

export interface TaskCreate {
  title: string;
  country: Country;
  description?: string;
  location_id?: string;
  assigned_to?: string;
  rrule?: string;
  priority: TaskPriority;
  due_date?: string;
  photo_required?: boolean;
  checklist?: string[];
}

export type ReviewBlocker = "photo" | "checklist";

export interface ChecklistItem {
  id: string;
  task_id: string;
  position: number;
  text: string;
  done: boolean;
  done_by: string | null;
  done_at: string | null;
}

export interface ChecklistTemplate {
  id: string;
  name: string;
  country: Country;
  items: string[];
  created_at: string;
}

export interface ChecklistTemplateCreate {
  name: string;
  country?: Country;
  items: string[];
}

export interface ChecklistTemplateUpdate {
  name?: string;
  items?: string[];
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  location_id?: string | null;
  assigned_to?: string | null;
  rrule?: string | null;
  priority?: TaskPriority;
  due_date?: string | null;
  photo_required?: boolean;
}

export interface CommentResponse {
  id: string;
  task_id: string;
  user_id: string;
  user_email: string;
  user_role: UserRole;
  text: string;
  created_at: string;
}

export interface HistoryEntryResponse {
  id: string;
  task_id: string;
  old_status: TaskStatus | null;
  new_status: TaskStatus;
  changed_by: string | null;
  changed_by_email: string | null;
  changed_at: string;
}

export interface PhotoResponse {
  id: string;
  task_id: string;
  url: string;
  filename: string;
  uploaded_at: string;
}

export interface OccurrencesResponse {
  task_id: string;
  rrule: string;
  next_occurrences: string[];
}

export interface LocationResponse {
  id: string;
  name: string;
  country: Country;
  level: LocationLevel;
  parent_id: string | null;
  path: string;
  full_name: string;
  created_at: string;
}

export interface LocationCreate {
  name: string;
  country: Country;
  level: LocationLevel;
  parent_id?: string;
}

export interface UserCreate {
  email: string;
  password: string;
  role: UserRole;
  country?: Country;
}

export interface UserUpdate {
  email: string;
  role: UserRole;
  country: Country | null;
}

export interface CountryCount {
  country: Country;
  count: number;
}

export interface DailyCount {
  date: string;
  count: number;
}

export interface WeeklyCount {
  week: string;
  count: number;
}

export interface TopLocation {
  id: string;
  name: string;
  level: LocationLevel;
  count: number;
}

export interface DashboardStats {
  status_stats: Record<TaskStatus, number>;
  priority_stats: Record<TaskPriority, number>;
  country_stats: CountryCount[];
  daily_stats: DailyCount[];
  top_locations: TopLocation[];
  avg_quality: number | null;
  reviewed_count: number;
  recurring_count: number;
  overdue_count: number;
  total_users: number;
  total_tasks: number;
}

export interface QualityStats {
  avg: number | null;
  min: number | null;
  max: number | null;
  reviewed_count: number;
}

export interface TopCleaner {
  email: string;
  country: Country | null;
  task_count: number;
  completed_count: number;
  completion_rate: number;
}

export interface CleanerWorkTime {
  email: string;
  task_count: number;
  avg_seconds: number;
}

export interface LocationWorkTime {
  id: string;
  name: string;
  task_count: number;
  avg_seconds: number;
}

export interface WorkTimeStats {
  avg_seconds: number | null;
  task_count: number;
  by_cleaner: CleanerWorkTime[];
  by_location: LocationWorkTime[];
}

export interface ReportStats {
  period: { date_from: string; date_to: string };
  total_tasks: number;
  status_stats: Record<TaskStatus, number>;
  priority_stats: Record<TaskPriority, number>;
  country_stats: CountryCount[];
  daily_stats: DailyCount[];
  weekly_stats: WeeklyCount[];
  quality_stats: QualityStats;
  top_cleaners: TopCleaner[];
  work_time: WorkTimeStats;
}

export interface ImportPreviewRow {
  row: number;
  title: string;
  country: Country;
  priority: TaskPriority;
  location_name: string | null;
  assignee_email: string | null;
  rrule: string | null;
}

export interface ImportResult {
  imported: number;
  valid_rows: number;
  total_rows: number;
  errors: string[];
  preview: ImportPreviewRow[];
  dry_run: boolean;
}

export interface SyncStatusChange {
  type: "status_change";
  task_id: string;
  status: TaskStatus;
  timestamp: string;
}

export interface SyncError {
  task_id: string | null;
  error: string;
}

export interface SyncResult {
  synced: number;
  errors: SyncError[];
}

export interface ValidationDetail {
  field: string;
  message: string;
}

export interface ErrorBody {
  error: string;
  details?: ValidationDetail[];
}
