import { useId, useState, type SubmitEvent, type KeyboardEvent } from "react";

import { errorMessage } from "../../api/errors";
import { RoleBadge, StatusBadge } from "../../components/Badges";
import { ErrorState, Loading, Notice } from "../../components/Feedback";
import { formatDateTime } from "../../labels";
import { t } from "../../i18n/locale";
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

  const label = (item: Tab) =>
    item === "comments"
      ? t().activity.comments(comments.data?.length ?? 0)
      : t().activity.history(history.data?.length ?? 0);

  return (
    <section className="card">
      <div className="tabs" role="tablist" aria-label={t().activity.label}>
        {TABS.map((item) => (
          <button
            key={item}
            id={`${baseId}-${item}-tab`}
            type="button"
            role="tab"
            className="tab"
            aria-selected={tab === item}
            aria-controls={`${baseId}-${item}-panel`}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={handleKeyDown}
          >
            {label(item)}
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
        <Loading label={t().activity.loadingComments} />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : query.data.length === 0 ? (
        <p className="activity-empty">{t().activity.noComments}</p>
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
      <form className="stack comment-form" onSubmit={handleSubmit}>
        {addComment.isError && <Notice tone="error">{errorMessage(addComment.error)}</Notice>}
        <label className="field-label" htmlFor={textId}>
          {t().activity.newComment}
        </label>
        <textarea
          id={textId}
          className="input"
          rows={2}
          maxLength={2000}
          value={text}
          disabled={!online}
          placeholder={online ? undefined : t().activity.offline}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="form-actions form-actions-end">
          <button className="btn btn-primary btn-small" type="submit" disabled={!online || !text.trim() || addComment.isPending}>
            {addComment.isPending ? t().activity.sending : t().activity.send}
          </button>
        </div>
      </form>
    </>
  );
}

function History({ query }: { query: ReturnType<typeof useHistory> }) {
  if (query.isPending) return <Loading label={t().activity.loadingHistory} />;
  if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (query.data.length === 0) return <p className="activity-empty">{t().activity.noHistory}</p>;
  return (
    <ol className="timeline">
      {query.data.map((entry) => (
        <li key={entry.id} className="timeline-item">
          <div className="badge-group">
            {entry.old_status && (
              <>
                <StatusBadge status={entry.old_status} />
                <span aria-label={t().activity.changedTo}>→</span>
              </>
            )}
            <StatusBadge status={entry.new_status} />
          </div>
          <div className="muted">
            {entry.changed_by_email ?? t().activity.system} ·{" "}
            <time dateTime={entry.changed_at}>{formatDateTime(entry.changed_at)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
