import { PHOTO_KINDS, type PhotoKind, type PhotoResponse } from "../../api/types";
import { ErrorState, Loading } from "../../components/Feedback";
import { usePhotos } from "./api";
import { PhotoUpload } from "./PhotoUpload";
import { t } from "../../i18n/locale";
import { formatDateTime } from "../../labels";

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value, window.location.origin);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function PhotosSection({ taskId, online }: { taskId: string; online: boolean }) {
  const photos = usePhotos(taskId);
  return (
    <section className="card" aria-labelledby="photos-title">
      <h2 id="photos-title" className="section-title">
        {t().taskDetail.photos}
      </h2>
      {photos.isPending ? (
        <Loading label={t().taskDetail.loadingPhotos} />
      ) : photos.isError ? (
        <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />
      ) : (
        <div className="photo-compare" role="group" aria-label={t().photos.compare}>
          {PHOTO_KINDS.map((kind) => (
            <PhotoColumn
              key={kind}
              taskId={taskId}
              kind={kind}
              online={online}
              photos={photos.data.filter((photo) => photo.kind === kind && isHttpUrl(photo.url))}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function PhotoColumn({
  taskId,
  kind,
  online,
  photos,
}: {
  taskId: string;
  kind: PhotoKind;
  online: boolean;
  photos: PhotoResponse[];
}) {
  const titleId = `photos-${kind}`;
  return (
    <section className="photo-column" aria-labelledby={titleId}>
      <h3 id={titleId} className="subsection-title">
        {t().photos.kind[kind]} <span className="muted">· {photos.length}</span>
      </h3>
      {photos.length === 0 ? (
        <p className="activity-empty">{t().photos.none[kind]}</p>
      ) : (
        <ul className="photo-grid">
          {photos.map((photo) => (
            <li key={photo.id}>
              <a href={photo.url} target="_blank" rel="noopener noreferrer" className="photo-thumb">
                <img src={photo.url} alt={`${t().photos.kind[kind]}: ${photo.filename}`} loading="lazy" />
                <span className="muted">{formatDateTime(photo.uploaded_at)}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      <PhotoUpload taskId={taskId} kind={kind} online={online} />
    </section>
  );
}
