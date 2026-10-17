import type { SortState } from "../sorting";

const ARIA_SORT = { asc: "ascending", desc: "descending" } as const;

export function SortHeader<K extends string>({
  label,
  column,
  sort,
  onSort,
  className,
}: {
  label: string;
  column: K;
  sort: SortState<K>;
  onSort: (column: K) => void;
  className?: string;
}) {
  const active = sort.key === column;
  return (
    <th scope="col" className={className} aria-sort={active ? ARIA_SORT[sort.direction] : undefined}>
      <button type="button" className={`th-sort${active ? " is-active" : ""}`} onClick={() => onSort(column)}>
        {label}
        <svg className="th-sort-icon" width="10" height="14" viewBox="0 0 10 14" aria-hidden="true">
          <path className={active && sort.direction === "asc" ? "is-on" : ""} d="M5 1.5 8.5 5.5h-7z" />
          <path className={active && sort.direction === "desc" ? "is-on" : ""} d="M5 12.5 1.5 8.5h7z" />
        </svg>
      </button>
    </th>
  );
}
