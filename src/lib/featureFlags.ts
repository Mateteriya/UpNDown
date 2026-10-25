/**
 * Флаги фич (подписка/премиум и т.д.).
 * Косметика и история — через isPremiumEntitled (см. premiumEntitlement.ts).
 */

import { isPremiumEntitled } from './premiumEntitlement';

/** Персональный ИИ при ручной паузе — пока для всех (не в витрине Premium v1). */
export function isPersonalAiReplacementEnabled(_userId?: string | null): boolean {
  return true;
}

/** Выбор аватарок ИИ за столом — Premium. */
export function isPremiumAiAvatarCustomizationEnabled(userId?: string | null): boolean {
  return isPremiumEntitled(userId);
}

/** Элитный стикер «Джокер» в редакторе аватарки — Premium. */
export function isPremiumAvatarJokerStickerEnabled(userId?: string | null): boolean {
  return isPremiumEntitled(userId);
}

/**
 * «Плашка снизу» на аватарке — Premium + нужен аккаунт.
 */
export function isPremiumAvatarNameBadgeEnabled(userId?: string | null): boolean {
  if (!userId) return false;
  return isPremiumEntitled(userId);
}

/** Косметика вех (рамка «Золото» и т.п.) — Premium. */
export function isMilestoneCosmeticPremiumEnabled(userId?: string | null): boolean {
  return isPremiumEntitled(userId);
}

/**
 * Локальный превью: плашки «снизу» у ИИ-оппонентов за столом
 * (как у premium+аккаунт с вариантом инициалов). Только DEV.
 */
export function isLocalAiNameBadgePreviewEnabled(): boolean {
  return import.meta.env.DEV === true;
}
