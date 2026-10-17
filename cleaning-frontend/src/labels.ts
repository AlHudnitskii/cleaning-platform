import type { Country } from "./api/types";
import { countryNames, dateFormatter, relativeFormatter } from "./i18n/format";
import { t } from "./i18n/locale";

export { countryNames };

export const RRULE_PRESETS = [
  "FREQ=DAILY",
  "FREQ=WEEKLY;BYDAY=MO",
  "FREQ=WEEKLY;BYDAY=MO,WE,FR",
  "FREQ=WEEKLY;BYDAY=MO,TH",
  "FREQ=WEEKLY",
  "FREQ=MONTHLY",
] as const;

export function rruleOptions(): { value: string; label: string }[] {
  return RRULE_PRESETS.map((value) => ({ value, label: rruleLabel(value) }));
}

export function rruleLabel(rrule: string): string {
  return t().repeat[rrule] ?? rrule;
}

export function countryName(country: Country | null): string {
  return country ? countryNames()[country] : t().common.none;
}

export function formatDateTime(value: string): string {
  return dateFormatter("datetime", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

export function formatDate(value: string): string {
  return dateFormatter("date", { dateStyle: "medium" }).format(new Date(value));
}

export function formatOccurrence(value: string): string {
  const options: Intl.DateTimeFormatOptions = {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  };
  return dateFormatter("occurrence", options).format(new Date(value));
}

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelative(value: string, now: number = Date.now()): string {
  const relative = relativeFormatter();
  const elapsed = now - new Date(value).getTime();
  if (elapsed < 0 || elapsed >= 7 * DAY) return formatDate(value);
  if (elapsed < MINUTE) return t().time.justNow;
  if (elapsed < HOUR) return relative.format(-Math.floor(elapsed / MINUTE), "minute");
  if (elapsed < DAY) return relative.format(-Math.floor(elapsed / HOUR), "hour");
  const label = relative.format(-Math.floor(elapsed / DAY), "day");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  if (minutes < 1) return t().time.underMinute;
  if (minutes < 60) return t().time.minutes(minutes);
  return t().time.hoursMinutes(Math.floor(minutes / 60), minutes % 60);
}

export function emailName(email: string): string {
  return email.split("@")[0] ?? email;
}
