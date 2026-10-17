import { useState, type DragEvent } from "react";
import { Link } from "react-router-dom";

import type { CalendarTask } from "../../api/types";
import { toDay } from "../../dates";
import { dateFormatter } from "../../i18n/format";
import { t } from "../../i18n/locale";

const MONTH_PREVIEW = 3;
const DRAG_TYPE = "application/x-task-id";
const LOCKED = new Set(["completed", "cancelled"]);

export interface CalendarGridProps {
  days: Date[];
  tasks: CalendarTask[];
  today: string;
  view: "month" | "week";
  month?: number;
  canMove: boolean;
  onMove: (task: CalendarTask, day: string) => void;
  onShowDay: (day: string) => void;
}

export function CalendarGrid({ days, tasks, today, view, month, canMove, onMove, onShowDay }: CalendarGridProps) {
  const byDay = new Map<string, CalendarTask[]>();
  for (const task of tasks) byDay.set(task.due_date, [...(byDay.get(task.due_date) ?? []), task]);
  const [target, setTarget] = useState<string | null>(null);
  const weekdays = days.slice(0, 7).map((day) => dateFormatter("weekday", { weekday: "short" }).format(day));
  const dayLabel = dateFormatter("planner-day", { weekday: "long", day: "numeric", month: "long" });

  const handleDrop = (event: DragEvent<HTMLLIElement>, day: string) => {
    event.preventDefault();
    setTarget(null);
    const task = tasks.find((candidate) => candidate.id === event.dataTransfer.getData(DRAG_TYPE));
    if (task && task.due_date !== day) onMove(task, day);
  };

  return (
    <div className={`planner planner-${view}`}>
      <div className="planner-weekdays" aria-hidden="true">
        {weekdays.map((name) => (
          <span key={name}>{name}</span>
        ))}
      </div>
      <ol className="planner-days">
        {days.map((date) => {
          const day = toDay(date);
          const dayTasks = byDay.get(day) ?? [];
          const shown = view === "month" ? dayTasks.slice(0, MONTH_PREVIEW) : dayTasks;
          const hidden = dayTasks.length - shown.length;
          const classes = [
            "planner-day",
            day === today ? "is-today" : "",
            month !== undefined && date.getMonth() !== month ? "is-outside" : "",
            target === day ? "is-target" : "",
          ];
          return (
            <li
              key={day}
              className={classes.filter(Boolean).join(" ")}
              aria-label={`${dayLabel.format(date)}, ${t().planner.taskCount(dayTasks.length)}`}
              onDragOver={
                canMove
                  ? (event) => {
                      event.preventDefault();
                      setTarget(day);
                    }
                  : undefined
              }
              onDragLeave={canMove ? () => setTarget(null) : undefined}
              onDrop={canMove ? (event) => handleDrop(event, day) : undefined}
            >
              <span className="planner-date" aria-hidden="true">
                <span className="planner-weekday">{weekdays[(date.getDay() + 6) % 7]} </span>
                {date.getDate()}
              </span>
              {shown.length > 0 && (
                <ul className="planner-tasks">
                  {shown.map((task) => (
                    <li key={task.id}>
                      <CalendarChip task={task} overdue={day < today} draggable={canMove && !LOCKED.has(task.status)} />
                    </li>
                  ))}
                </ul>
              )}
              {hidden > 0 && (
                <button type="button" className="link-button planner-more" onClick={() => onShowDay(day)}>
                  {t().planner.more(hidden)}
                </button>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function CalendarChip({ task, overdue, draggable }: { task: CalendarTask; overdue: boolean; draggable: boolean }) {
  const late = overdue && !LOCKED.has(task.status);
  const details = [t().status[task.status], task.assigned_to_email ?? t().common.unassigned];
  if (late) details.push(t().planner.overdue);
  return (
    <Link
      to={`/tasks/${task.id}`}
      className={`planner-chip tone-status-${task.status}${late ? " is-late" : ""}`}
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, task.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      title={`${task.title} · ${details.join(", ")}`}
    >
      <span className="status-dot" aria-hidden="true" />
      <span className="planner-chip-title">{task.title}</span>
      <span className="visually-hidden">, {details.join(", ")}</span>
    </Link>
  );
}
