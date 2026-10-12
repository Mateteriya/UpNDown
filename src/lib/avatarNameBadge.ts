/**
 * «Плашка снизу» на аватарке — отдельный элемент (не вшивается в PNG).
 * Хранится на аккаунт (userId); отображается только при входе + premium-флаг.
 */

import {
  AVATAR_BADGE_FONT_STACK,
  defaultAvatarBadgeText,
  normalizeAvatarBadgeText,
  type AvatarInitialsStyle,
} from './avatarEditorTemplates';

const STORAGE_KEY = 'updown_avatar_name_badge';

export type AvatarNameBadgePref = {
  userId: string;
  enabled: boolean;
  text: string;
  color: string;
  updatedAt: string;
};

function readAll(): AvatarNameBadgePref | null {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as Partial<AvatarNameBadgePref>;
    if (!p || typeof p.userId !== 'string' || !p.userId) return null;
    return {
      userId: p.userId,
      enabled: Boolean(p.enabled),
      text: typeof p.text === 'string' ? normalizeAvatarBadgeText(p.text) : '',
      color: typeof p.color === 'string' && p.color.startsWith('#') ? p.color : '#ecfeff',
      updatedAt: typeof p.updatedAt === 'string' ? p.updatedAt : new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

/** Pref текущего аккаунта (или null). */
export function getAvatarNameBadgePref(userId?: string | null): AvatarNameBadgePref | null {
  if (!userId) return null;
  const p = readAll();
  if (!p || p.userId !== userId) return null;
  return p;
}

export function saveAvatarNameBadgePref(
  userId: string,
  next: { enabled: boolean; text?: string; color?: string; displayName?: string },
): void {
  if (!userId || typeof localStorage === 'undefined') return;
  try {
    const prev = getAvatarNameBadgePref(userId);
    const text =
      normalizeAvatarBadgeText(next.text ?? prev?.text ?? '') ||
      defaultAvatarBadgeText(next.displayName ?? '');
    const pref: AvatarNameBadgePref = {
      userId,
      enabled: Boolean(next.enabled),
      text,
      color: next.color ?? prev?.color ?? '#ecfeff',
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pref));
  } catch {
    /* quota */
  }
}

export function clearAvatarNameBadgePref(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

/** Стиль инициалов для редактора: badge только из pref аккаунта. */
export function initialsStyleFromNameBadgePref(
  userId: string | null | undefined,
  fallback: AvatarInitialsStyle = 'off',
): AvatarInitialsStyle {
  const p = getAvatarNameBadgePref(userId);
  if (p?.enabled) return 'badge';
  return fallback === 'badge' ? 'off' : fallback;
}

/**
 * Геометрия плашки для UI (меню / стол / ЛК).
 * Контейнер обнимает текст; кегль целиком внутри (не вылезает за края).
 */
export function measurePlayerAvatarNameBadgeLayout(
  sizePx: number,
  text: string,
): { x: number; y: number; w: number; h: number; fontPx: number; text: string } {
  const size = Math.max(16, sizePx);
  const t = normalizeAvatarBadgeText(text) || '?';
  const len = Math.max(1, [...t].length);
  const h = Math.max(12, Math.round(size * (size < 56 ? 0.28 : size < 90 ? 0.25 : 0.23)));
  const padX = Math.max(4, Math.round(size * 0.045));
  const maxW = size * (len >= 8 ? 1.28 : len >= 6 ? 1.18 : 1.1);

  /* Кегль ≤ ~78% высоты — с clip/border не обрезается и не торчит */
  let fontPx = Math.max(
    10,
    Math.min(Math.round(h * 0.78), Math.round(size * (len >= 8 ? 0.24 : 0.28))),
  );

  const probe =
    typeof document !== 'undefined' ? document.createElement('canvas').getContext('2d') : null;
  let textW = fontPx * len * 0.5;
  if (probe) {
    const minFont = Math.max(9, Math.round(h * 0.62));
    while (fontPx > minFont) {
      probe.font = `700 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
      textW = probe.measureText(t).width;
      if (textW + padX * 2 <= maxW) break;
      fontPx -= 1;
    }
    probe.font = `700 ${fontPx}px ${AVATAR_BADGE_FONT_STACK}`;
    textW = probe.measureText(t).width;
  }

  const w = Math.min(maxW, Math.max(textW + padX * 2, h * 1.75));
  const x = (size - w) / 2;
  const y = size - h * 0.55;
  return { x, y, w, h, fontPx, text: t };
}
