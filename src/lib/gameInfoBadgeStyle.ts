/** Стиль бейджа «Сейчас ход / Заказывает» (.game-info-left-section). Plasma — дефолт. */
export type GameInfoBadgeStyle = 'classic' | 'plasma';

const STORAGE_KEY = 'updown_game_info_badge_style';

export const GAME_INFO_BADGE_LONGPRESS_MS = 720;

export function loadGameInfoBadgeStyle(): GameInfoBadgeStyle {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'classic') return 'classic';
  } catch {
    /* ignore */
  }
  return 'plasma';
}

export function saveGameInfoBadgeStyle(style: GameInfoBadgeStyle): void {
  try {
    localStorage.setItem(STORAGE_KEY, style);
  } catch {
    /* ignore */
  }
}

export function gameInfoBadgeStyleLabel(style: GameInfoBadgeStyle): string {
  return style === 'plasma' ? 'космический hologram' : 'классический';
}

export function gameInfoBadgeStyleToastMessage(style: GameInfoBadgeStyle): string {
  return style === 'plasma' ? 'Бейдж: космический hologram' : 'Бейдж: классический стиль';
}

export function gameInfoBadgeLongPressHint(style: GameInfoBadgeStyle): string {
  return `Удержание ~0,7 с на бейдже хода — стиль оформления (сейчас: ${gameInfoBadgeStyleLabel(style)}). Классический ↔ плазменный. Кнопки «Раздача» и «Σ» — обычный тап.`;
}
