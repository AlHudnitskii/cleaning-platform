import type { TaskResponse, TaskStatus } from "../../api/types";
import { daysBetween, formatDay, today } from "../../dates";
import { STATUS_ACTIONS } from "../../labels";

const NEXT_STEP: Partial<Record<TaskStatus, TaskStatus>> = {
  pending: "in_progress",
  in_progress: "on_review",
  on_review: "completed",
  on_hold: "in_progress",
};

export function nextStep(task: TaskResponse): TaskStatus | null {
  const next = NEXT_STEP[task.status];
  if (!next || !task.allowed_statuses.includes(next)) return null;
  return isBlocked(task, next) ? null : next;
}

export function isBlocked(task: Pick<TaskResponse, "review_blockers">, target: TaskStatus): boolean {
  return target === "on_review" && task.review_blockers.length > 0;
}

export function blockerText(task: Pick<TaskResponse, "review_blockers" | "checklist_done" | "checklist_total">): string {
  const parts: string[] = [];
  if (task.review_blockers.includes("photo")) parts.push("upload a photo of the result");
  if (task.review_blockers.includes("checklist")) {
    parts.push(`finish the checklist (${task.checklist_done} of ${task.checklist_total} done)`);
  }
  return parts.length > 0 ? `To send for review, ${parts.join(" and ")}.` : "";
}

const REOPEN_FROM: readonly TaskStatus[] = ["completed", "cancelled"];

export function actionLabel(from: TaskStatus, to: TaskStatus): string {
  if (to === "in_progress") {
    if (REOPEN_FROM.includes(from)) return "Reopen";
    if (from === "on_review") return "Return for rework";
    if (from === "on_hold") return "Resume";
  }
  return STATUS_ACTIONS[to];
}

export type DueState = "overdue" | "today" | "soon" | "later";

const CLOSED: readonly TaskStatus[] = ["completed", "cancelled"];
const SOON_DAYS = 3;

export function dueState(task: Pick<TaskResponse, "due_date" | "status">, todayValue: string = today()): DueState | null {
  if (!task.due_date || CLOSED.includes(task.status)) return null;
  const days = daysBetween(todayValue, task.due_date);
  if (days === null) return null;
  if (days < 0) return "overdue";
  if (days === 0) return "today";
  return days <= SOON_DAYS ? "soon" : "later";
}

export function dueLabel(dueDate: string, state: DueState | null, todayValue: string = today()): string {
  const days = daysBetween(todayValue, dueDate) ?? 0;
  if (state === "overdue") return days === -1 ? "Overdue by 1 day" : `Overdue by ${-days} days`;
  if (state === "today") return "Due today";
  if (days === 1 && state === "soon") return "Due tomorrow";
  return `Due ${formatDay(dueDate)}`;
}
