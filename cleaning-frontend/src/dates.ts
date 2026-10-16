import { dateFormatter } from "./i18n/format";

const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseDay(value: string): Date | null {
  const match = ISO_DAY.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return toDay(date) === value ? date : null;
}

export function toDay(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

export function today(): string {
  return toDay(new Date());
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

export function addMonths(date: Date, months: number): Date {
  const target = new Date(date.getFullYear(), date.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  return new Date(target.getFullYear(), target.getMonth(), Math.min(date.getDate(), lastDay));
}

export function daysAgo(days: number): string {
  return toDay(addDays(new Date(), -days));
}

export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = addDays(first, -mondayIndex(first));
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function formatDay(value: string): string {
  const date = parseDay(value);
  return date ? dateFormatter("day", { day: "numeric", month: "short", year: "numeric" }).format(date) : value;
}

export function daysBetween(from: string, to: string): number | null {
  const start = parseDay(from);
  const end = parseDay(to);
  if (!start || !end) return null;
  return Math.round((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
}

export function startOfMonth(): string {
  const now = new Date();
  return toDay(new Date(now.getFullYear(), now.getMonth(), 1));
}

export function startOfYear(): string {
  return toDay(new Date(new Date().getFullYear(), 0, 1));
}
