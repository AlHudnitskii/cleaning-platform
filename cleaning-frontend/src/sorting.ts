export type SortDirection = "asc" | "desc";

export interface SortState<K extends string> {
  key: K;
  direction: SortDirection;
}

export function nextSort<K extends string>(
  current: SortState<K>,
  clicked: K,
  naturalDirection: (key: K) => SortDirection,
): SortState<K> {
  if (current.key !== clicked) return { key: clicked, direction: naturalDirection(clicked) };
  return { key: clicked, direction: current.direction === "asc" ? "desc" : "asc" };
}

export function compareText(a: string | null, b: string | null): number {
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a.localeCompare(b, undefined, { sensitivity: "base", numeric: true });
}
