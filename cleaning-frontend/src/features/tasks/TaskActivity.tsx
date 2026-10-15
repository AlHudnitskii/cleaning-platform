import { useId, useState, type SubmitEvent, type KeyboardEvent } from "react";

import { errorMessage } from "../../api/errors";
import { RoleBadge, StatusBadge } from "../../components/Badges";
import { EmptyState, ErrorState, Loading, Notice } from "../../components/Feedback";
import { formatDateTime } from "../../labels";
import { useAddComment, useComments, useHistory } from "./api";

type Tab = "comments" | "history";
const TABS: Tab[] = ["comments", "history"];

export function TaskActivity({ taskId, online }: { taskId: string; online: boolean }) {
  const [tab, setTab] = useState<Tab>("comments");
  const baseId = useId();
  const comments = useComments(taskId);
  const history = useHistory(taskId);

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    const next = TABS[(TABS.indexOf(tab) + (event.key === "ArrowRight" ? 1 : TABS.length - 1)) % TABS.length] ?? tab;
    setTab(next);
    document.getElementById(`${baseId}-${next}-tab`)?.focus();
  };

  const label = (t: Tab) =>
    t === "comments" ? `Comments (${comments.data?.length ?? 0})` : `History (${history.data?.length ?? 0})`;

  return (
    <section className="card">
      <div className="tabs" role="tablist" aria-label="Task activity">
        {TABS.map((t) => (
          <button
            key={t}
            id={`${baseId}-${t}-tab`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === t}
            aria-controls={`${baseId}-${t}-panel`}
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={handleKeyDown}
          >
            {label(t)}
          </button>
        ))}
      </div>
      <div id={`${baseId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${baseId}-${tab}-tab`}>
        {tab === "comments" ? <Comments taskId={taskId} online={online} query={comments} /> : <History query={history} />}
      </div>
    </section>
  );
}

function Comments({
  taskId,
  online,
  query,
}: {
  taskId: string;
  online: boolean;
  query: ReturnType<typeof useComments>;
}) {
  const [text, setText] = useState("");
  const addComment = useAddComment(taskId);
  const textId = useId();

  const handleSubmit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!text.trim()) return;
    addComment.mutate(text.trim(), { onSuccess: () => setText("") });
  };

  return (
    <>
      {query.isPending ? (
        <Loading label="Loading comments" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <EmptyState title="No comments yet" />
      ) : (
        <ul className="comment-list">
          {query.data.map((comment) => (
            <li key={comment.id} className="comment">
              <div className="comment-header">
                <span className="comment-author">{comment.user_email}</span>
                <RoleBadge role={comment.user_role} />
                <time className="muted" dateTime={comment.created_at}>
                  {formatDateTime(comment.created_at)}
                </time>
              </div>
              <p className="comment-text">{comment.text}</p>
            </li>
          ))}
        </ul>
      )}
      <form className="stack" onSubmit={handleSubmit}>
        {addComment.isError && <Notice tone="error">{errorMessage(addComment.error)}</Notice>}
        <label className="field-label" htmlFor={textId}>
          New comment
        </label>
        <textarea
          id={textId}
          className="input"
          rows={3}
          maxLength={2000}
          value={text}
          disabled={!online}
          placeholder={online ? undefined : "Comments are unavailable offline"}
          onChange={(e) => setText(e.target.value)}
        />
        <button className="btn btn-primary" type="submit" disabled={!online || !text.trim() || addComment.isPending}>
          {addComment.isPending ? "Sending…" : "Send"}
        </button>
      </form>
    </>
  );
}

function History({ query }: { query: ReturnType<typeof useHistory> }) {
  if (query.isPending) return <Loading label="Loading history" />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) return <EmptyState title="No status changes yet" />;
  return (
    <ol className="timeline">
      {query.data.map((entry) => (
        <li key={entry.id} className="timeline-item">
          <div className="badge-group">
            {entry.old_status && (
              <>
                <StatusBadge status={entry.old_status} />
                <span aria-label="changed to">→</span>
              </>
            )}
            <StatusBadge status={entry.new_status} />
          </div>
          <div className="muted">
            {entry.changed_by_email ?? "System"} ·{" "}
            <time dateTime={entry.changed_at}>{formatDateTime(entry.changed_at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
