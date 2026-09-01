import { DEFAULT_LOCALE, LOCALES, LOCALE_STORAGE_KEY, type Locale } from './types';

function isLocale(value: string | null | undefined): value is Locale {
  return value != null && (LOCALES as readonly string[]).includes(value);
}

function readStoredLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);
    if (isLocale(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_LOCALE;
}

let locale: Locale = DEFAULT_LOCALE;
const listeners = new Set<() => void>();

export function getLocale(): Locale {
  return locale;
}

export function applyLocaleToDocument(next: Locale = locale): void {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = next;
}

export function subscribeLocale(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange);
  return () => {
    listeners.delete(onStoreChange);
  };
}

export function setLocale(next: Locale): void {
  if (next === locale) return;
  locale = next;
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
  applyLocaleToDocument(next);
  listeners.forEach((cb) => cb());
}

export function initLocale(): Locale {
  locale = readStoredLocale();
  applyLocaleToDocument(locale);
  return locale;
}

initLocale();
