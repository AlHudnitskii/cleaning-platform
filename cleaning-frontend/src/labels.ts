import type { Country, LocationLevel, TaskPriority, TaskSort, TaskStatus, UserRole } from "./api/types";

export const STATUS_LABELS: Record<TaskStatus, string> = {
  pending: "Pending",
  in_progress: "In progress",
  on_review: "On review",
  completed: "Completed",
  on_hold: "On hold",
  cancelled: "Cancelled",
};

export const STATUS_ACTIONS: Record<TaskStatus, string> = {
  pending: "Move to pending",
  in_progress: "Start work",
  on_review: "Send to review",
  completed: "Approve",
  on_hold: "Put on hold",
  cancelled: "Cancel task",
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manager",
  cleaner: "Cleaner",
};

export const LEVEL_LABELS: Record<LocationLevel, string> = {
  country: "Country",
  city: "City",
  building: "Building",
  floor: "Floor",
  room: "Room",
};

export const SORT_LABELS: Record<TaskSort, string> = {
  created_at: "Newest first",
  priority: "Priority",
  status: "Status",
  title: "Title",
  country: "Country",
  location: "Location",
  assignee: "Assignee",
};

export const COUNTRY_NAMES: Record<Country, string> = {
  DE: "Germany",
  DK: "Denmark",
  IT: "Italy",
  AU: "Australia",
  US: "United States",
  GB: "United Kingdom",
  FR: "France",
  ES: "Spain",
  PL: "Poland",
  NL: "Netherlands",
  SE: "Sweden",
  NO: "Norway",
  FI: "Finland",
  CH: "Switzerland",
  AT: "Austria",
};

export const RRULE_PRESETS = [
  { value: "FREQ=DAILY", label: "Every day" },
  { value: "FREQ=WEEKLY;BYDAY=MO", label: "Every Monday" },
  { value: "FREQ=WEEKLY;BYDAY=MO,WE,FR", label: "Mon, Wed, Fri" },
  { value: "FREQ=WEEKLY;BYDAY=MO,TH", label: "Mon and Thu" },
  { value: "FREQ=WEEKLY", label: "Every week" },
  { value: "FREQ=MONTHLY", label: "Every month" },
] as const;

export function rruleLabel(rrule: string): string {
  return RRULE_PRESETS.find((preset) => preset.value === rrule)?.label ?? rrule;
}

export function countryName(country: Country | null): string {
  return country ? COUNTRY_NAMES[country] : "—";
}

const dateTimeFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const dateFormat = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
const occurrenceFormat = new Intl.DateTimeFormat("en-GB", {
  weekday: "long",
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDateTime(value: string): string {
  return dateTimeFormat.format(new Date(value));
}

export function formatDate(value: string): string {
  return dateFormat.format(new Date(value));
}

export function formatOccurrence(value: string): string {
  return occurrenceFormat.format(new Date(value));
}


const relativeFormat = new Intl.RelativeTimeFormat("en-GB", { numeric: "auto" });
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(value: string, now: number = Date.now()): string {
  const elapsed = now - new Date(value).getTime();
  if (elapsed < 0 || elapsed >= 7 * DAY) return formatDate(value);
  if (elapsed < MINUTE) return "Just now";
  if (elapsed < HOUR) return relativeFormat.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relativeFormat.format(-Math.floor(elapsed / HOUR), "hour");
  const label = relativeFormat.format(-Math.floor(elapsed / DAY), "day");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function emailName(email: string): string {
  return email.split("@")[0] ?? email;
}
