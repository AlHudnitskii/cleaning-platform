import type { TaskResponse, TaskStatus } from "../../api/types";
import { STATUS_ACTIONS } from "../../labels";

const NEXT_STEP: Partial<Record<TaskStatus, TaskStatus>> = {
  pending: "in_progress",
  in_progress: "on_review",
  on_review: "completed",
  on_hold: "in_progress",
};

export function nextStep(task: TaskResponse): TaskStatus | null {
  const next = NEXT_STEP[task.status];
  return next && task.allowed_statuses.includes(next) ? next : null;
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
