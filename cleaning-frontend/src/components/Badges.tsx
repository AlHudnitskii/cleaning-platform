import type { ReactNode } from "react";

import type { LocationLevel, TaskPriority, TaskStatus, UserRole } from "../api/types";
import { LEVEL_LABELS, PRIORITY_LABELS, ROLE_LABELS, STATUS_LABELS } from "../labels";

export function Badge({ tone, dot, children }: { tone: string; dot?: boolean; children: ReactNode }) {
  return <span className={`badge tone-${tone}${dot ? " badge-dot" : ""}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge tone={`status-${status}`} dot>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={`priority-${priority}`}>{PRIORITY_LABELS[priority]}</Badge>;
}

export function PriorityText({ priority }: { priority: TaskPriority }) {
  return <span className={`priority-text priority-${priority}`}>{PRIORITY_LABELS[priority]}</span>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={`role-${role}`}>{ROLE_LABELS[role]}</Badge>;
}

export function LevelBadge({ level }: { level: LocationLevel }) {
  return <Badge tone={`level-${level}`}>{LEVEL_LABELS[level]}</Badge>;
}