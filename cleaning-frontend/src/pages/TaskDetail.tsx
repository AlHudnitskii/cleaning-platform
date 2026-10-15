import { useState, type SubmitEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { errorMessage } from "../api/errors";
import type { TaskResponse, UserResponse } from "../api/types";
import { useCurrentUser } from "../auth/useAuth";
import { PriorityBadge, StatusBadge } from "../components/Badges";
import { EmptyState, ErrorState, Loading, NotFoundState, Notice } from "../components/Feedback";
import { Field } from "../components/Field";
import { PageHeader } from "../components/PageHeader";
import { StarDisplay, StarInput } from "../components/StarRating";
import { useOfflineSync } from "../features/offline/useOfflineSync";
import { useOccurrences, usePhotos, useReviewQuality, useTask } from "../features/tasks/api";
import { PhotoUpload } from "../features/tasks/PhotoUpload";
import { StatusActions } from "../features/tasks/StatusActions";
import { TaskActivity } from "../features/tasks/TaskActivity";
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

  if (task.isPending) return <Loading label="Loading task" />;
  if (task.isError) return <ErrorState error={task.error} onRetry={() => void task.refetch()} />;

  const data = task.data;
  const queued = offline.pending.some((change) => change.task_id === data.id);

  return (
    <>
      <Link to={backTo} className="back-link">
        ← Back to tasks
      </Link>
      <PageHeader
        title={data.title}
        description={
          <span className="badge-group">
            <StatusBadge status={data.status} />
            <PriorityBadge priority={data.priority} />
            {queued && <span className="badge tone-warning">Waiting to sync</span>}
          </span>
        }
      />
      {!offline.online && (
        <Notice tone="warning">You are offline. Status changes will be sent when the connection is back.</Notice>
      )}
      {offline.changeStatus.isError && <Notice tone="error">{errorMessage(offline.changeStatus.error)}</Notice>}

      <div className="detail-grid">
        <div className="stack">
          <section className="card" aria-labelledby="details-title">
            <h2 id="details-title" className="section-title">
              Details
            </h2>
            {data.description && <p>{data.description}</p>}
            <dl className="detail-list">
              <dt>Country</dt>
              <dd>{countryName(data.country)}</dd>
              <dt>Location</dt>
              <dd>{data.location_path.length > 0 ? data.location_path.join(" / ") : "Not set"}</dd>
              <dt>Assignee</dt>
              <dd>{data.assigned_to_email ?? "Unassigned"}</dd>
              <dt>Created</dt>
              <dd>{formatDateTime(data.created_at)}</dd>
              {data.rrule && (
                <>
                  <dt>Repeats</dt>
                  <dd>{rruleLabel(data.rrule)}</dd>
                </>
              )}
            </dl>
            <StatusActions
              task={data}
              disabled={offline.changeStatus.isPending}
              onChange={(status) => offline.changeStatus.mutate({ taskId: data.id, target: status })}
            />
          </section>

          <QualitySection task={data} user={user} />
          <PhotosSection taskId={data.id} online={offline.online} />
          {data.is_recurring && <OccurrencesSection taskId={data.id} />}
        </div>
        <TaskActivity taskId={data.id} online={offline.online} />
      </div>
    </>
  );
}

function QualitySection({ task, user }: { task: TaskResponse; user: UserResponse }) {
  const canReview = user.role !== "cleaner" && task.status === "completed";
  if (canReview) return <QualityReviewForm task={task} />;
  if (task.quality_score === null) return null;
  return (
    <section className="card" aria-labelledby="quality-title">
      <h2 id="quality-title" className="section-title">
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
    if (score > 0) review.mutate({ score, comment: comment.trim() || undefined });
  };

  return (
    <section className="card" aria-labelledby="review-title">
      <h2 id="review-title" className="section-title">
        Quality review
      </h2>
      {review.isSuccess && <Notice tone="success">Review saved.</Notice>}
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
        <EmptyState title="No photos yet" />
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
