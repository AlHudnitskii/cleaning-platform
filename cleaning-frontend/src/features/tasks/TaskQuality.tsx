import { useState, type SubmitEvent } from "react";

import { errorMessage } from "../../api/errors";
import type { TaskResponse, UserResponse } from "../../api/types";
import { Notice } from "../../components/Feedback";
import { Field } from "../../components/Field";
import { showToast } from "../../components/toast";
import { StarDisplay, StarInput } from "../../components/StarRating";
import { useReviewQuality } from "./api";
import { t } from "../../i18n/locale";
import { formatDateTime } from "../../labels";

export function QualitySection({ task, user }: { task: TaskResponse; user: UserResponse }) {
  const canReview = user.role !== "cleaner" && task.status === "completed";
  if (canReview) return <QualityReviewForm task={task} />;
  if (task.quality_score === null) return null;
  return (
    <section className="card property-card" aria-labelledby="quality-title">
      <h2 id="quality-title" className="subsection-title">
        {t().taskDetail.quality}
      </h2>
      <StarDisplay value={task.quality_score} />
      {task.quality_comment && <p>{task.quality_comment}</p>}
      {task.quality_reviewed_at && <p className="muted">{t().taskDetail.reviewed(formatDateTime(task.quality_reviewed_at))}</p>}
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
    review.mutate({ score, comment: comment.trim() || undefined }, { onSuccess: () => showToast(t().taskDetail.reviewSaved) });
  };

  return (
    <section className="card property-card" aria-labelledby="review-title">
      <h2 id="review-title" className="subsection-title">
        {t().taskDetail.quality}
      </h2>
      {review.isError && <Notice tone="error">{errorMessage(review.error)}</Notice>}
      <form className="stack" onSubmit={handleSubmit}>
        <StarInput legend={t().taskDetail.score} value={score} onChange={setScore} />
        <Field label={t().taskDetail.comment}>
          <textarea className="input" rows={3} maxLength={2000} value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
        <button className="btn btn-primary" type="submit" disabled={score === 0 || review.isPending}>
          {review.isPending ? t().common.saving : t().taskDetail.saveReview}
        </button>
        {score === 0 && <p className="field-hint">{t().taskDetail.chooseScore}</p>}
      </form>
    </section>
  );
}
