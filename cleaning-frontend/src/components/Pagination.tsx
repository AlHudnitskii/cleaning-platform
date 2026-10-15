import type { Pagination as PaginationInfo } from "../api/types";

const WINDOW = 2;

function visiblePages(current: number, total: number): (number | "gap")[] {
  const pages: (number | "gap")[] = [];
  for (let page = 1; page <= total; page++) {
    if (page === 1 || page === total || Math.abs(page - current) <= WINDOW) pages.push(page);
    else if (pages[pages.length - 1] !== "gap") pages.push("gap");
  }
  return pages;
}

export function Pagination({ info, onChange }: { info: PaginationInfo; onChange: (page: number) => void }) {
  if (info.pages <= 1) return null;
  return (
    <nav className="pagination" aria-label="Pagination">
      <button
        type="button"
        className="btn btn-secondary"
        disabled={info.page <= 1}
        onClick={() => onChange(info.page - 1)}
      >
        Previous
      </button>
      {visiblePages(info.page, info.pages).map((page, index) =>
        page === "gap" ? (
          <span key={`gap-${index}`} className="pagination-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={page}
            type="button"
            className={page === info.page ? "btn btn-primary" : "btn btn-secondary"}
            aria-current={page === info.page ? "page" : undefined}
            aria-label={`Page ${page}`}
            onClick={() => onChange(page)}
          >
            {page}
          </button>
        ),
      )}
      <button
        type="button"
        className="btn btn-secondary"
        disabled={info.page >= info.pages}
        onClick={() => onChange(info.page + 1)}
      >
        Next
      </button>
    </nav>
  );
}
