/**
 * Таймауты сети Supabase.
 * Auth раньше шёл без таймаута → в самолёте getSession/refresh мог висеть минутами
 * и держать loading=true (или блокировать UI).
 *
 * 2026-10-07: проект Auth отвечает ~20–25с даже на простой password grant.
 * Рвать раньше + ретраить = «вход несколько минут». Лучше один длинный запрос.
 */
export const SUPABASE_REST_TIMEOUT_MS = 70_000;
/** Потолок для GoTrue (login / logout / user). */
export const SUPABASE_AUTH_TIMEOUT_MS = 20_000;
/** token (password + refresh): upstream сейчас часто 20–30с. */
export const SUPABASE_AUTH_REFRESH_TIMEOUT_MS = 35_000;
/** Жёсткий потолок всего signIn (UI не крутится вечно). */
export const SUPABASE_AUTH_SIGNIN_BUDGET_MS = 40_000;
/** Явный signOut remote: дальше всё равно local wipe. */
export const SUPABASE_AUTH_SIGNOUT_TIMEOUT_MS = 5_000;
/** Загрузка AuthProvider: не дольше этого ждём getSession. */
export const AUTH_BOOT_TIMEOUT_MS = 2_500;
/** Самолёт / LAN-party: почти сразу отпускаем UI — облако не блокирует офлайн. */
export const AUTH_BOOT_OFFLINE_MS = 400;
