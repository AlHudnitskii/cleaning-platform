import type { TaskResponse } from "../../api/types";
import { formatDay } from "../../dates";
import { dueLabel, dueState } from "./workflow";

export function DueDate({ task, empty = "—" }: { task: Pick<TaskResponse, "due_date" | "status">; empty?: string }) {
  if (!task.due_date) return <span className="due due-none">{empty}</span>;
  const state = dueState(task);
  if (!state) return <span className="due due-closed">{formatDay(task.due_date)}</span>;
  return (
    <span className={`due due-${state}`} title={formatDay(task.due_date)}>
      {dueLabel(task.due_date, state)}
    </span>
  );
}
