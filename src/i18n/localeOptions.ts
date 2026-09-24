import type { Locale } from './types';
import { LOCALES } from './types';

/** Карточка языка для UI-переключателя (расширяется вместе с LOCALES). */
export type LocaleOption = {
  id: Locale;
  /** Короткий код на ушке / в сегменте */
  short: string;
  /** Полное имя на родном языке (эндоним) */
  nativeName: string;
};

/**
 * Порядок = порядок в списке выбора.
 * Новый язык: добавить в LOCALES + сюда + словари i18n.
 */
export const LOCALE_OPTIONS: readonly LocaleOption[] = [
  { id: 'ru', short: 'RU', nativeName: 'Русский' },
  { id: 'en', short: 'EN', nativeName: 'English' },
] as const;

const byId = Object.fromEntries(LOCALE_OPTIONS.map((o) => [o.id, o])) as Record<Locale, LocaleOption>;

export function getLocaleOption(id: Locale): LocaleOption {
  return byId[id];
}

/** Защита от рассинхрона LOCALES ↔ LOCALE_OPTIONS */
if (import.meta.env?.DEV) {
  for (const id of LOCALES) {
    if (!byId[id]) {
      console.warn(`[i18n] LOCALE_OPTIONS missing entry for "${id}"`);
    }
  }
}
