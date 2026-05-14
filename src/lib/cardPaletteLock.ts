/**
 * Ручной «замок» палитры карт: под авто-темизацию WebView (Samsung Force Dark,
 * ночные режимы браузера и т.п.) масти/фон карт могут искажаться.
 * Включается только по жесту пользователя. Компенсация — invert на элементе html
 * (см. index.css), иначе на части дерева в некоторых WebView эффект не виден.
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
