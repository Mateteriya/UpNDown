/**
 * Тема оформления карт на мобильной/планшете: standard | dark | legacy | neo.
 * Визуал — в CardView; класс на html для ранней отрисовки и подсветки лампы.
 * Лаборатория: /demo/cards-dark
 */

export type CardTheme = 'standard' | 'dark' | 'legacy' | 'neo';

export const CARD_THEME_STORAGE_KEY = 'updown-card-theme';

/** @deprecated миграция с булева замка */
export const CARD_PALETTE_LOCK_STORAGE_KEY = 'updown-card-palette-lock';

const HTML_CLASS = 'updown-card-palette-lock';

export const CARD_THEME_CYCLE: CardTheme[] = ['standard', 'dark', 'legacy', 'neo'];

export const CARD_THEME_LABEL: Record<CardTheme, string> = {
  standard: 'Стандарт',
  dark: 'Тёмная',
  legacy: 'Легаси',
  neo: 'Нео',
};

function isCardTheme(v: string | null): v is CardTheme {
  return v === 'standard' || v === 'dark' || v === 'legacy' || v === 'neo';
}

export function readCardTheme(): CardTheme {
  if (typeof window === 'undefined') return 'standard';
  try {
    const stored = localStorage.getItem(CARD_THEME_STORAGE_KEY);
    if (isCardTheme(stored)) return stored;
    if (localStorage.getItem(CARD_PALETTE_LOCK_STORAGE_KEY) === '1') return 'dark';
  } catch {
    /* ignore */
  }
  return 'standard';
}

export function setCardPaletteLockEnabled(enabled: boolean): void {
  if (typeof document === 'undefined') return;
  const html = document.documentElement;
  if (enabled) html.classList.add(HTML_CLASS);
  else html.classList.remove(HTML_CLASS);
  try {
    localStorage.setItem(CARD_PALETTE_LOCK_STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    /* ignore */
  }
}

export function applyCardThemeToDocument(theme: CardTheme): void {
  setCardPaletteLockEnabled(theme !== 'standard');
  try {
    localStorage.setItem(CARD_THEME_STORAGE_KEY, theme);
  } catch {
    /* ignore */
  }
}

export function applyCardPaletteLockToDocument(enabled: boolean): void {
  applyCardThemeToDocument(enabled ? 'dark' : 'standard');
}

/** @deprecated используйте readCardTheme() !== 'standard' */
export function readCardPaletteLockEnabled(): boolean {
  return readCardTheme() !== 'standard';
}

export function cycleCardThemeStored(): CardTheme {
  const current = readCardTheme();
  const i = CARD_THEME_CYCLE.indexOf(current);
  const next = CARD_THEME_CYCLE[(i + 1) % CARD_THEME_CYCLE.length];
  applyCardThemeToDocument(next);
  return next;
}

/** @deprecated используйте cycleCardThemeStored */
export function toggleCardPaletteLockStored(): boolean {
  cycleCardThemeStored();
  return readCardTheme() !== 'standard';
}
