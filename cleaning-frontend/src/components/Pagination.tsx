import type { Pagination as PaginationInfo } from "../api/types";
import { t } from "../i18n/locale";

export function Pagination({
  info,
  shown,
  noun,
  onPageChange,
  pageSizes,
  onPageSizeChange,
}: {
  info: PaginationInfo;
  shown: number;
  noun: string;
  onPageChange: (page: number) => void;
  pageSizes?: readonly number[];
  onPageSizeChange?: (size: number) => void;
}) {
  const canGoBack = info.page > 1;
  const canGoForward = info.page < info.pages;

  return (
    <div className="list-footer">
      <span className="list-footer-count">
        {t().pagination.shown(shown, info.total, noun)}
      </span>
      <span className="list-footer-spacer" />
      {pageSizes && onPageSizeChange && (
        <div className="pager-group" role="group" aria-label={t().pagination.rowsPerPage}>
          <span className="pager-caption">{t().pagination.rows}</span>
          {pageSizes.map((size) => (
            <button
              key={size}
              type="button"
              className="pager-size"
              aria-pressed={info.limit === size}
              onClick={() => onPageSizeChange(size)}
            >
              {size}
            </button>
          ))}
        </div>
      )}
      <nav className="pager-group pager-nav" aria-label={t().pagination.label}>
        <button
          type="button"
          className="pager-step"
          aria-label={t().pagination.previous}
          disabled={!canGoBack}
          onClick={() => onPageChange(info.page - 1)}
        >
          ‹
        </button>
        <span className="pager-position" aria-live="polite">
          <span className="visually-hidden">{t().pagination.page}</span>
          {info.page} / {info.pages}
        </span>
        <button
          type="button"
          className="pager-step"
          aria-label={t().pagination.next}
          disabled={!canGoForward}
          onClick={() => onPageChange(info.page + 1)}
        >
          ›
        </button>
      </nav>
    </div>
  );
}
