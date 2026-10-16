import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { TaskResponse } from "../../api/types";
import { PriorityBadge, StatusBadge } from "../../components/Badges";
import { RelativeDate } from "../../components/People";
import { DueDate } from "./DueDate";
import { blockerText } from "./workflow";
import { countryName, rruleLabel } from "../../labels";
import { t } from "../../i18n/locale";

export function TaskCard({ task, actions, pending }: { task: TaskResponse; actions?: ReactNode; pending?: boolean }) {
  return (
    <article className="card task-card">
      <div className="task-card-header">
        <h2 className="task-card-title">
          <Link to={`/tasks/${task.id}`}>{task.title}</Link>
        </h2>
        <div className="badge-group">
          <StatusBadge status={task.status} />
          <PriorityBadge priority={task.priority} />
          {pending && <span className="badge tone-warning">{t().common.waitingToSync}</span>}
        </div>
      </div>
      {task.description && <p className="task-card-description">{task.description}</p>}
      <dl className="meta-list">
        <div>
          <dt>{t().taskCard.country}</dt>
          <dd>{countryName(task.country)}</dd>
        </div>
        {task.location_name && (
          <div>
            <dt>{t().taskCard.location}</dt>
            <dd>{task.location_name}</dd>
          </div>
        )}
        {task.checklist_total > 0 && (
          <div>
            <dt>{t().taskCard.checklist}</dt>
            <dd>
              {t().checklist.done(task.checklist_done, task.checklist_total)}
            </dd>
          </div>
        )}
        {task.due_date && (
          <div>
            <dt>{t().taskCard.due}</dt>
            <dd>
              <DueDate task={task} />
            </dd>
          </div>
        )}
        <div>
          <dt>{t().taskCard.created}</dt>
          <dd>
            <RelativeDate value={task.created_at} />
          </dd>
        </div>
        {task.rrule && (
          <div>
            <dt>{t().taskCard.repeats}</dt>
            <dd>{rruleLabel(task.rrule)}</dd>
          </div>
        )}
      </dl>
      {task.status === "in_progress" && task.review_blockers.length > 0 && (
        <p className="task-card-hint">{blockerText(task)}</p>
      )}
      {actions && <div className="task-card-actions">{actions}</div>}
    </article>
  );
}
