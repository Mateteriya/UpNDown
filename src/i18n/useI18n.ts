import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { getLocale, setLocale, subscribeLocale } from './locale';
import { t, type TFunc } from './t';
import type { Locale } from './types';

export function useLocale(): Locale {
  return useSyncExternalStore(subscribeLocale, getLocale, () => 'ru');
}

export function useT(): TFunc {
  const locale = useLocale();
  return useMemo(() => {
    void locale;
    return t;
  }, [locale]);
}

export function useI18n(): { locale: Locale; setLocale: (next: Locale) => void; t: TFunc } {
  const locale = useLocale();
  const set = useCallback((next: Locale) => setLocale(next), []);
  const tr = useT();
  return { locale, setLocale: set, t: tr };
}
