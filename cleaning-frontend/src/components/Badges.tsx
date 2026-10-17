import type { ReactNode } from "react";

import type { LocationLevel, TaskPriority, TaskStatus, UserRole } from "../api/types";
import { t } from "../i18n/locale";

export function Badge({ tone, dot, children }: { tone: string; dot?: boolean; children: ReactNode }) {
  return <span className={`badge tone-${tone}${dot ? " badge-dot" : ""}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <Badge tone={`status-${status}`} dot>
      {t().status[status]}
    </Badge>
  );
}

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return <Badge tone={`priority-${priority}`}>{t().priority[priority]}</Badge>;
}

export function PriorityText({ priority }: { priority: TaskPriority }) {
  return <span className={`priority-text priority-${priority}`}>{t().priority[priority]}</span>;
}

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge tone={`role-${role}`}>{t().role[role]}</Badge>;
}

export function LevelBadge({ level }: { level: LocationLevel }) {
  return <Badge tone={`level-${level}`}>{t().level[level]}</Badge>;
}