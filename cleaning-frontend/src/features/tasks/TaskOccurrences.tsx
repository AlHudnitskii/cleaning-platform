
import { ErrorState, Loading } from "../../components/Feedback";
import { useOccurrences } from "./api";
import { t } from "../../i18n/locale";
import { formatOccurrence } from "../../labels";

export function OccurrencesSection({ taskId }: { taskId: string }) {
  const occurrences = useOccurrences(taskId, true);
  return (
    <section className="card" aria-labelledby="occurrences-title">
      <h2 id="occurrences-title" className="section-title">
        {t().taskDetail.occurrences}
      </h2>
      <p className="field-hint">{t().taskDetail.occurrencesHint}</p>
      {occurrences.isPending ? (
        <Loading label={t().taskDetail.loadingSchedule} />
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
