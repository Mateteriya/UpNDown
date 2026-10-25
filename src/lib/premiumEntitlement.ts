/**
 * Entitlement Premium (web).
 * Пока без стора: env + allowlist user id + session override (dev-кнопка на #premium).
 */

const SESSION_OVERRIDE_KEY = 'updown_premium_test_override';

/** Fallback, если sessionStorage недоступен (vitest / privacy mode). */
let memorySessionOverride = false;

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

/** Глобально всем (удобно в .env.local): VITE_PREMIUM_HISTORY=true */
export function isPremiumHistoryEnvEnabled(): boolean {
  return envBool('VITE_PREMIUM_HISTORY', false);
}

/** Список uuid через запятую: VITE_PREMIUM_USER_IDS=id1,id2 */
export function parsePremiumUserIds(): Set<string> {
  const raw = (import.meta.env.VITE_PREMIUM_USER_IDS as string | undefined)?.trim() ?? '';
  if (!raw) return new Set();
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim())
      .filter(Boolean),
  );
}

export function isPremiumUserIdAllowlisted(userId?: string | null): boolean {
  if (!userId) return false;
  return parsePremiumUserIds().has(userId);
}

/** Показать кнопку «тестовый Premium» (DEV или VITE_PREMIUM_DEV_TOGGLE=1). */
export function isPremiumDevToggleVisible(): boolean {
  if (import.meta.env.DEV) return true;
  return envBool('VITE_PREMIUM_DEV_TOGGLE', false);
}

export function getPremiumSessionOverride(): boolean {
  if (typeof sessionStorage === 'undefined') return memorySessionOverride;
  try {
    return sessionStorage.getItem(SESSION_OVERRIDE_KEY) === '1';
  } catch {
    return memorySessionOverride;
  }
}

export function setPremiumSessionOverride(on: boolean): void {
  memorySessionOverride = on;
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (on) sessionStorage.setItem(SESSION_OVERRIDE_KEY, '1');
    else sessionStorage.removeItem(SESSION_OVERRIDE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Есть ли Premium у пользователя.
 * Позже: || subscriptionFromSupabase(userId).
 */
export function isPremiumEntitled(userId?: string | null): boolean {
  if (isPremiumHistoryEnvEnabled()) return true;
  if (getPremiumSessionOverride()) return true;
  if (isPremiumUserIdAllowlisted(userId)) return true;
  return false;
}
