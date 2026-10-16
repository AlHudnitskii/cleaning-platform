import { useState, type SubmitEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { errorMessage } from "../api/errors";
import type { TaskResponse, UserResponse } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { PriorityText, StatusBadge } from "../components/Badges";
import { ErrorState, ListSkeleton, Loading, NotFoundState, Notice } from "../components/Feedback";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Drawer } from "../components/Drawer";
import { Field } from "../components/Field";
import { Icon } from "../components/Icon";
import { Person, RelativeDate } from "../components/People";
import { showToast } from "../components/toast";
import { StarDisplay, StarInput } from "../components/StarRating";
import { useOfflineSync } from "../features/offline/useOfflineSync";
import { useDeleteTask, useOccurrences, usePhotos, useReviewQuality, useTask } from "../features/tasks/api";
import { DueDate } from "../features/tasks/DueDate";
import { PhotoUpload } from "../features/tasks/PhotoUpload";
import { StatusActions } from "../features/tasks/StatusActions";
import { TaskActivity } from "../features/tasks/TaskActivity";
import { TaskForm } from "../features/tasks/TaskForm";
import { countryName, formatDateTime, formatOccurrence, rruleLabel } from "../labels";

const UUID = /^[0-9a-f-]{36}$/i;

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function TaskDetail() {
  const { id = "" } = useParams();
  if (!UUID.test(id)) return <NotFoundState what="task" />;
  return <TaskDetailContent id={id} />;
}

function TaskDetailContent({ id }: { id: string }) {
  const user = useCurrentUser();
  const task = useTask(id);
  const offline = useOfflineSync(user.id);
  const backTo = user.role === "cleaner" ? "/my-tasks" : "/tasks";
  const canManage = user.role !== "cleaner";
  const navigate = useNavigate();
  const deleteTask = useDeleteTask();
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  if (task.isPending) return <ListSkeleton label="Loading task" rows={4} columns={3} />;
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />;

  const data = task.data;
  const queued = offline.pending.some((change) => change.task_id === data.id);

  return (
    <>
      <Link to={backTo} className="back-link">
        <Icon name="back" size={15} />
        Back to tasks
      </Link>
      <header className="task-header">
        <div className="task-header-main">
          <div className="badge-group">
            <StatusBadge status={data.status} />
            {data.is_recurring && <span className="badge tone-info">Recurring</span>}
            {queued && <span className="badge tone-warning">Waiting to sync</span>}
            {data.due_date && <DueDate task={data} />}
          </div>
          <h1 className="page-title task-title">{data.title}</h1>
        </div>
        <div className="task-header-actions">
          <StatusActions
            task={data}
            disabled={offline.changeStatus.isPending}
            onChange={(status) => offline.changeStatus.mutate({ taskId: data.id, target: status })}
          />
          {canManage && (
            <div className="button-row">
              <button type="button" className="btn btn-secondary" onClick={() => setEditing(true)}>
                <Icon name="edit" size={15} />
                Edit
              </button>
              <button
                type="button"
                className="icon-button icon-button-danger"
                aria-label={`Delete ${data.title}`}
                title="Delete task"
                onClick={() => setConfirmingDelete(true)}
              >
                <Icon name="trash" />
              </button>
            </div>
          )}
        </div>
      </header>
      {editing && (
        <Drawer title="Edit task" onClose={() => setEditing(false)}>
          <TaskForm
            user={user}
            task={data}
            onCancel={() => setEditing(false)}
            onSaved={(updated) => {
              setEditing(false);
              showToast(`“${updated.title}” saved`);
            }}
          />
        </Drawer>
      )}
      {confirmingDelete && (
        <ConfirmDialog
          title={`Delete “${data.title}”?`}
          confirmLabel="Delete task"
          busy={deleteTask.isPending}
          error={deleteTask.isError ? errorMessage(deleteTask.error) : null}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() =>
            deleteTask.mutate(data.id, {
              onSuccess: () => {
                showToast(`“${data.title}” deleted`);
                void navigate(backTo, { replace: true });
              },
            })
          }
        >
          <p>Its comments, status history and photos are deleted too. This cannot be undone.</p>
        </ConfirmDialog>
      )}
      {!offline.online && (
        <Notice tone="warning">You are offline. Status changes will be sent when the connection is back.</Notice>
      )}
      {offline.changeStatus.isError && <Notice tone="error">{errorMessage(offline.changeStatus.error)}</Notice>}

      <div className="task-layout">
        <div className="task-main">
          {data.description && (
            <section className="card" aria-labelledby="description-title">
              <h2 id="description-title" className="section-title">
                Description
              </h2>
              <p className="task-description">{data.description}</p>
            </section>
          )}
          <PhotosSection taskId={data.id} online={offline.online} />
          <TaskActivity taskId={data.id} online={offline.online} />
          {data.is_recurring && <OccurrencesSection taskId={data.id} />}
        </div>

        <aside className="task-aside" aria-label="Task properties">
          <section className="card property-card" aria-labelledby="properties-title">
            <h2 id="properties-title" className="subsection-title">
              Properties
            </h2>
            <dl className="property-list">
              <div>
                <dt>Priority</dt>
                <dd>
                  <PriorityText priority={data.priority} />
                </dd>
              </div>
              <div>
                <dt>Due date</dt>
                <dd>
                  <DueDate task={data} empty="Not set" />
                </dd>
              </div>
              <div>
                <dt>Assignee</dt>
                <dd>
                  <Person email={data.assigned_to_email} />
                </dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>
                  {data.location_path.length > 0 ? (
                    <span className="location-path">
                      {data.location_path.map((part, index) => (
                        <span key={`${part}-${index}`}>{part}</span>
                      ))}
                    </span>
                  ) : (
                    <span className="muted">Not set</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>Country</dt>
                <dd>{countryName(data.country)}</dd>
              </div>
              <div>
                <dt>Created</dt>
                <dd>
                  <RelativeDate value={data.created_at} />
                </dd>
              </div>
              {data.rrule && (
                <div>
                  <dt>Repeats</dt>
                  <dd>{rruleLabel(data.rrule)}</dd>
                </div>
              )}
            </dl>
          </section>
          <QualitySection task={data} user={user} />
        </aside>
      </div>
    </>
  );
}

function QualitySection({ task, user }: { task: TaskResponse; user: UserResponse }) {
  const canReview = user.role !== "cleaner" && task.status === "completed";
  if (canReview) return <QualityReviewForm task={task} />;
  if (task.quality_score === null) return null;
  return (
    <section className="card property-card" aria-labelledby="quality-title">
      <h2 id="quality-title" className="subsection-title">
        Quality review
      </h2>
      <StarDisplay value={task.quality_score} />
      {task.quality_comment && <p>{task.quality_comment}</p>}
      {task.quality_reviewed_at && <p className="muted">Reviewed {formatDateTime(task.quality_reviewed_at)}</p>}
    </section>
  );
}

function QualityReviewForm({ task }: { task: TaskResponse }) {
  const [score, setScore] = useState(task.quality_score ?? 0);
  const [comment, setComment] = useState(task.quality_comment ?? "");
  const review = useReviewQuality(task.id);

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (score === 0) return;
    review.mutate({ score, comment: comment.trim() || undefined }, { onSuccess: () => showToast("Review saved.") });
  };

  return (
    <section className="card property-card" aria-labelledby="review-title">
      <h2 id="review-title" className="subsection-title">
        Quality review
      </h2>
      {review.isError && <Notice tone="error">{errorMessage(review.error)}</Notice>}
      <form className="stack" onSubmit={handleSubmit}>
        <StarInput legend="Score" value={score} onChange={setScore} />
        <Field label="Comment (optional)">
          <textarea className="input" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <button className="btn btn-primary" type="submit" disabled={score === 0 || review.isPending}>
          {review.isPending ? "Saving…" : "Save review"}
        </button>
        {score === 0 && <p className="field-hint">Choose a score to save the review.</p>}
      </form>
    </section>
  );
}

function PhotosSection({ taskId, online }: { taskId: string; online: boolean }) {
  const photos = usePhotos(taskId);
  return (
    <section className="card" aria-labelledby="photos-title">
      <h2 id="photos-title" className="section-title">
        Photos
      </h2>
      <PhotoUpload taskId={taskId} online={online} />
      {photos.isPending ? (
        <Loading label="Loading photos" />
      ) : photos.isError ? (
        <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />
      ) : photos.data.length === 0 ? (
        <p className="activity-empty">No photos yet. Photos show the result of the work.</p>
      ) : (
        <ul className="photo-grid">
          {photos.data.filter((photo) => isHttpUrl(photo.url)).map((photo) => (
            <li key={photo.id}>
              <a href={photo.url} target="_blank" rel="noopener noreferrer" className="photo-thumb">
                <img src={photo.url} alt={photo.filename} loading="lazy" />
                <span className="muted">{formatDateTime(photo.uploaded_at)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function OccurrencesSection({ taskId }: { taskId: string }) {
  const occurrences = useOccurrences(taskId, true);
  return (
    <section className="card" aria-labelledby="occurrences-title">
      <h2 id="occurrences-title" className="section-title">
        Next occurrences
      </h2>
      {occurrences.isPending ? (
        <Loading label="Loading schedule" />
      ) : occurrences.isError ? (
        <ErrorState error={occurrences.error} onRetry={() => void occurrences.refetch()} />
      ) : (
        <ol className="occurrence-list">
          {occurrences.data.next_occurrences.map((date) => (
            <li key={date}>
              <time dateTime={date}>{formatOccurrence(date)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
