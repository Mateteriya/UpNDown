/** Стиль бейджа «Сейчас ход / Заказывает» (.game-info-left-section). Plasma — дефолт. */
export type GameInfoBadgeStyle = 'classic' | 'plasma';

/** Phone LS · тон экранчика plasma: prism (новый перелив) ↔ void (прежний cool cyan). */
export type PlasmaScreenTone = 'prism' | 'void';

const STORAGE_KEY = 'updown_game_info_badge_style';
const SCREEN_TONE_KEY = 'updown_plasma_screen_tone';

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

/** Дефолт — prism (яркий перелив); void — прежний cool-экран phone LS. */
export function loadPlasmaScreenTone(): PlasmaScreenTone {
  try {
    const raw = localStorage.getItem(SCREEN_TONE_KEY);
    if (raw === 'void') return 'void';
  } catch {
    /* ignore */
  }
  return 'prism';
}

export function savePlasmaScreenTone(tone: PlasmaScreenTone): void {
  try {
    localStorage.setItem(SCREEN_TONE_KEY, tone);
  } catch {
    /* ignore */
  }
}

export function gameInfoBadgeStyleLabel(style: GameInfoBadgeStyle): string {
  return style === 'plasma' ? 'космический hologram' : 'классический';
}

export function plasmaScreenToneLabel(tone: PlasmaScreenTone): string {
  return tone === 'prism' ? 'экран: спектр' : 'экран: void';
}

export function gameInfoBadgeStyleToastMessage(style: GameInfoBadgeStyle): string {
  return style === 'plasma' ? 'Бейдж: космический hologram' : 'Бейдж: классический стиль';
}

export function plasmaScreenToneToastMessage(tone: PlasmaScreenTone): string {
  return tone === 'prism' ? 'Экранчик: спектр (перелив)' : 'Экранчик: void (cool)';
}

export function gameInfoBadgeLongPressHint(style: GameInfoBadgeStyle, screenTone?: PlasmaScreenTone): string {
  if (screenTone) {
    return `Удержание ~0,7 с на бейдже — тон экранчика (сейчас: ${plasmaScreenToneLabel(screenTone)}). Спектр ↔ void. Кнопки «Раздача» и «Σ» — обычный тап.`;
  }
  return `Удержание ~0,7 с на бейдже хода — стиль оформления (сейчас: ${gameInfoBadgeStyleLabel(style)}). Классический ↔ плазменный. Кнопки «Раздача» и «Σ» — обычный тап.`;
}
