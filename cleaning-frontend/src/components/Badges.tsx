import type { ReactNode } from "react";

import type { LocationLevel, TaskPriority, TaskStatus, UserRole } from "../api/types";
import { LEVEL_LABELS, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from "../labels";

export function Badge({ tone, children }: { tone: string; children: ReactNode }) {
  return <span className={`badge tone-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return <Badge tone={`status-${status}`}>{STATUS_LABELS[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={`priority-${priority}`}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={`role-${role}`}>{ROLE_LABELS[role]}</Badge>;
}

export function LevelBadge({ level }: { level: LocationLevel }) {
  return <Badge tone={`level-${level}`}>{LEVEL_LABELS[level]}</Badge>;
}

export function ActiveBadge({ active }: { active: boolean }) {
  return <Badge tone={active ? "success" : "danger"}>{active ? "Active" : "Inactive"}</Badge>;
}
