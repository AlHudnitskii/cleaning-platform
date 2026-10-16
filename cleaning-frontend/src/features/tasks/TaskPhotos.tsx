
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
      <PhotoUpload taskId={taskId} online={online} />
      {photos.isPending ? (
        <Loading label={t().taskDetail.loadingPhotos} />
      ) : photos.isError ? (
        <ErrorState error={photos.error} onRetry={() => void photos.refetch()} />
      ) : photos.data.length === 0 ? (
        <p className="activity-empty">{t().taskDetail.noPhotos}</p>
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
