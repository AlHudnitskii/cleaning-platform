import type { ReactNode } from "react";
import { Link } from "react-router-dom";

import type { TaskResponse } from "../../api/types";
import { PriorityBadge, StatusBadge } from "../../components/Badges";
import { RelativeDate } from "../../components/People";
import { DueDate } from "./DueDate";
import { countryName, rruleLabel } from "../../labels";

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
          {pending && <span className="badge tone-warning">Waiting to sync</span>}
        </div>
      </div>
      {task.description && <p className="task-card-description">{task.description}</p>}
      <dl className="meta-list">
        <div>
          <dt>Country</dt>
          <dd>{countryName(task.country)}</dd>
        </div>
        {task.location_name && (
          <div>
            <dt>Location</dt>
            <dd>{task.location_name}</dd>
          </div>
        )}
        <div>
          <dt>Assignee</dt>
          <dd>{task.assigned_to_email ?? "Unassigned"}</dd>
        </div>
        {task.due_date && (
          <div>
            <dt>Due</dt>
            <dd>
              <DueDate task={task} />
            </dd>
          </div>
        )}
        <div>
          <dt>Created</dt>
          <dd>
            <RelativeDate value={task.created_at} />
          </dd>
        </div>
        {task.rrule && (
          <div>
            <dt>Repeats</dt>
            <dd>{rruleLabel(task.rrule)}</dd>
          </div>
        )}
      </dl>
      {actions && <div className="task-card-actions">{actions}</div>}
    </article>
  );
}
