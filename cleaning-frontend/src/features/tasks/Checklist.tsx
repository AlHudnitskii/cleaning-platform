import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import type { TaskResponse } from "../../api/types";
import { Loading, Notice } from "../../components/Feedback";
import { Icon } from "../../components/Icon";
import { showToast } from "../../components/toast";
import { useAddChecklistItem, useChecklist, useDeleteChecklistItem, useToggleChecklistItem } from "./api";

const LOCKED = ["completed", "cancelled"];

export function Checklist({ task, canTick, canEdit }: { task: TaskResponse; canTick: boolean; canEdit: boolean }) {
  const checklist = useChecklist(task.id);
  const toggle = useToggleChecklistItem(task.id);
  const add = useAddChecklistItem(task.id);
  const remove = useDeleteChecklistItem(task.id);
  const [text, setText] = useState("");
  const locked = LOCKED.includes(task.status);
  const items = checklist.data ?? [];
  const done = items.filter((item) => item.done).length;

  if (!checklist.isPending && items.length === 0 && (!canEdit || locked)) return null;

  const handleAdd = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const value = text.trim();
    if (!value) return;
    add.mutate(value, {
      onSuccess: () => setText(""),
      onError: (error) => showToast(errorMessage(error), "error"),
    });
  };

  return (
    <section className="card" aria-labelledby="checklist-title">
      <div className="section-header">
        <h2 id="checklist-title" className="section-title">
          Checklist
        </h2>
        {items.length > 0 && (
          <span className={`checklist-count${done === items.length ? " is-complete" : ""}`}>
            {done} of {items.length} done
          </span>
        )}
      </div>
      {items.length > 0 && (
        <div
          className="checklist-progress"
          role="progressbar"
          aria-label="Checklist progress"
          aria-valuemin={0}
          aria-valuemax={items.length}
          aria-valuenow={done}
        >
          <span style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      {checklist.isPending ? (
        <Loading label="Loading checklist" />
      ) : checklist.isError ? (
        <Notice tone="error">
          <span>Could not load the checklist: {errorMessage(checklist.error)}</span>
          <button type="button" className="btn btn-secondary btn-small" onClick={() => void checklist.refetch()}>
            Try again
          </button>
        </Notice>
      ) : (
        <ul className="checklist">
          {items.map((item) => (
            <li key={item.id} className={`checklist-item${item.done ? " is-done" : ""}`}>
              <label className="checklist-label">
                <input
                  type="checkbox"
                  className="checkbox"
                  checked={item.done}
                  disabled={!canTick || locked}
                  onChange={(event) =>
                    toggle.mutate(
                      { id: item.id, done: event.target.checked },
                      { onError: (error) => showToast(errorMessage(error), "error") },
                    )
                  }
                />
                <span className="checklist-text">{item.text}</span>
              </label>
              {canEdit && !locked && (
                <button
                  type="button"
                  className="icon-button checklist-remove"
                  aria-label={`Remove “${item.text}”`}
                  onClick={() =>
                    remove.mutate(item.id, { onError: (error) => showToast(errorMessage(error), "error") })
                  }
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canEdit && !locked && (
        <form className="checklist-add" onSubmit={handleAdd}>
          <input
            className="input"
            value={text}
            maxLength={255}
            placeholder="Add a step, for example “Empty the bins”"
            aria-label="New checklist item"
            onChange={(event) => setText(event.target.value)}
          />
          <button type="submit" className="btn btn-secondary" disabled={!text.trim() || add.isPending}>
            Add
          </button>
        </form>
      )}
    </section>
  );
}
