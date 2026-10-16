import { useSyncExternalStore } from "react";

import { en, type Messages } from "./en";
import { ru } from "./ru";

export type Locale = "en" | "ru";

export const LOCALES: readonly Locale[] = ["en", "ru"];

const STORAGE_KEY = "cleaning-locale";
const MESSAGES: Record<Locale, Messages> = { en, ru };
const INTL_TAGS: Record<Locale, string> = { en: "en-GB", ru: "ru-RU" };
const listeners = new Set<() => void>();

function storedLocale(): Locale | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === "en" || value === "ru" ? value : null;
  } catch {
    return null;
  }
}

function browserLocale(): Locale {
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("ru") ? "ru" : "en";
}

let current: Locale = storedLocale() ?? browserLocale();

function persist(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    return;
  }
}

export function applyLocale(): void {
  document.documentElement.lang = current;
}

export function setLocale(locale: Locale): void {
  if (locale === current) return;
  current = locale;
  persist(locale);
  applyLocale();
  listeners.forEach((listener) => listener());
}

export function currentLocale(): Locale {
  return current;
}

export function intlTag(): string {
  return INTL_TAGS[current];
}

export function t(): Messages {
  return MESSAGES[current];
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useLocale(): Locale {
  return useSyncExternalStore(subscribe, () => current);
}
