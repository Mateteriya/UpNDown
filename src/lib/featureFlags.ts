/**
 * Флаги фич (подписка/премиум и т.д.).
 * Сейчас тестируем локально — персональный ИИ для ручной паузы доступен всем.
 * Перед продакшном: включать по подписке (только премиум).
 */

/** Персональный ИИ при ручной паузе — пока для всех; в продакшне: только для премиум-подписки. */
export function isPersonalAiReplacementEnabled(_userId?: string | null): boolean {
  return true;
  // В продакшне: return !!userSubscription?.isPremium;
}

/** Выбор аватарок ИИ за столом — премиум; пока для тестов доступно всем. */
export function isPremiumAiAvatarCustomizationEnabled(_userId?: string | null): boolean {
  return true;
  // В продакшне: return !!userSubscription?.isPremium;
}

/** Элитный стикер «Джокер» в редакторе аватарки — премиум; пока для тестов доступно всем. */
export function isPremiumAvatarJokerStickerEnabled(_userId?: string | null): boolean {
  return true;
  // В продакшне: return !!userSubscription?.isPremium;
}

/**
 * «Плашка снизу» на аватарке — только премиум в аккаунте.
 * Вне аккаунта (локальный профиль/гость) — недоступна полностью.
 * Пока для тестов: любой залогиненный; в прод — подписка.
 */
export function isPremiumAvatarNameBadgeEnabled(userId?: string | null): boolean {
  if (!userId) return false;
  return true;
  // В продакшне: return !!userSubscription?.isPremium;
}

/**
 * Косметика вех (рамка «Золото» и т.п.) — премиум.
 * Пока для тестов доступно всем; в прод — подписка.
 */
export function isMilestoneCosmeticPremiumEnabled(_userId?: string | null): boolean {
  return true;
  // В продакшне: return !!userSubscription?.isPremium;
}

/**
 * Локальный превью: плашки «снизу» у ИИ-оппонентов за столом
 * (как у premium+аккаунт с вариантом инициалов). Только DEV.
 */
export function isLocalAiNameBadgePreviewEnabled(): boolean {
  return import.meta.env.DEV === true;
}
