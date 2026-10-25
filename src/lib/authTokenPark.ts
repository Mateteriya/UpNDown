/**
 * На auth-callback.html при ?code= нельзя давать GoTrue _initialize → refresh
 * старой сессии: lock занят на 20–35с (ERR_CONNECTION_CLOSED) → exchange «висит».
 * Паркуем sb-*-auth-token до createClient; после успеха — discard; при ошибке — restore.
 *
 * Отдельный модуль (без supabase) — чтобы supabase.ts мог вызвать park до createClient.
 */

const PARKED_AUTH_TOKENS_KEY = 'updown_parked_auth_tokens';

export function parkAuthTokensForOAuthCallback(): void {
  if (typeof window === 'undefined') return;
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const u = new URL(window.location.href);
    const hash = u.hash.startsWith('#') ? u.hash.slice(1) : u.hash;
    const hp = new URLSearchParams(hash);
    const hasOAuthPayload =
      !!u.searchParams.get('code') ||
      !!hp.get('access_token') ||
      u.searchParams.get('vk_bridge') === '1' ||
      /vkid|vk_auth|payload=/i.test(u.href);
    if (!hasOAuthPayload) return;

    const parked: Array<{ key: string; value: string }> = [];
    const kill: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !/^sb-[\w-]+-auth-token$/.test(k)) continue;
      const v = localStorage.getItem(k);
      if (v) parked.push({ key: k, value: v });
      kill.push(k);
    }
    for (const k of kill) localStorage.removeItem(k);
    if (parked.length) {
      sessionStorage.setItem(PARKED_AUTH_TOKENS_KEY, JSON.stringify(parked));
    }
  } catch {
    /* ignore */
  }
}

export function restoreParkedAuthTokens(): void {
  if (typeof localStorage === 'undefined' || typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(PARKED_AUTH_TOKENS_KEY);
    if (!raw) return;
    sessionStorage.removeItem(PARKED_AUTH_TOKENS_KEY);
    const rows = JSON.parse(raw) as Array<{ key?: string; value?: string }>;
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row?.key && typeof row.value === 'string') {
        localStorage.setItem(row.key, row.value);
      }
    }
  } catch {
    /* ignore */
  }
}

export function discardParkedAuthTokens(): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(PARKED_AUTH_TOKENS_KEY);
  } catch {
    /* ignore */
  }
}
