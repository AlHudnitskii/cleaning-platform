import { COUNTRIES, type Country } from "../api/types";
import { intlTag } from "./locale";

const cache = new Map<string, unknown>();

function memo<T>(key: string, make: (tag: string) => T): T {
  const tag = intlTag();
  const id = `${tag}|${key}`;
  if (cache.has(id)) return cache.get(id) as T;
  const created = make(tag);
  cache.set(id, created);
  return created;
}

export function dateFormatter(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  return memo(`date:${key}`, (tag) => new Intl.DateTimeFormat(tag, options));
}

export function relativeFormatter(): Intl.RelativeTimeFormat {
  return memo("relative", (tag) => new Intl.RelativeTimeFormat(tag, { numeric: "auto" }));
}

export function countryNames(): Record<Country, string> {
  return memo("countries", (tag) => {
    const names = new Intl.DisplayNames(tag, { type: "region" });
    return Object.fromEntries(COUNTRIES.map((code) => [code, names.of(code) ?? code])) as Record<Country, string>;
  });
}
