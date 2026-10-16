import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export function readEnum<T extends string>(params: URLSearchParams, key: string, values: readonly T[]): T | undefined {
  const value = params.get(key);
  return value !== null && (values as readonly string[]).includes(value) ? (value as T) : undefined;
}

export function readPage(params: URLSearchParams): number {
  const page = Number(params.get("page"));
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export const PAGE_SIZES = [25, 50, 100] as const;

export function readPageSize(params: URLSearchParams): number {
  const size = Number(params.get("limit"));
  return (PAGE_SIZES as readonly number[]).includes(size) ? size : PAGE_SIZES[0];
}

export function readDate(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined;
}

export function readId(params: URLSearchParams, key: string): string | undefined {
  const value = params.get(key);
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
}

export function useUrlState() {
  const [params, setParams] = useSearchParams();

  const update = useCallback(
    (changes: Record<string, string | number | undefined>, resetPage = true) => {
      setParams(
        (previous) => {
          const next = new URLSearchParams(previous);
          for (const [key, value] of Object.entries(changes)) {
            if (value === undefined || value === "") next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage && !("page" in changes)) next.delete("page");
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  const clear = useCallback(() => setParams(new URLSearchParams(), { replace: true }), [setParams]);

  return { params, update, clear };
}
