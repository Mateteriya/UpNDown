/**
 * Режим тёмного листа карт (долгое нажатие на лампу в игре): флаг в localStorage + класс на html.
 * Визуал карт — в CardView (cardPaletteLock из ThemeContext), без CSS filter/invert.
 * Лаборатория вариантов: /demo/cards-dark
 */

export const CARD_PALETTE_LOCK_STORAGE_KEY = 'updown-card-palette-lock';

const HTML_CLASS = 'updown-card-palette-lock';

export function readCardPaletteLockEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(CARD_PALETTE_LOCK_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
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

export function applyCardPaletteLockToDocument(enabled: boolean): void {
  setCardPaletteLockEnabled(enabled);
}

export function toggleCardPaletteLockStored(): boolean {
  const next = !readCardPaletteLockEnabled();
  setCardPaletteLockEnabled(next);
  return next;
}
