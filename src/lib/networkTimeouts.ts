/**
 * Таймауты сети Supabase.
 * Auth раньше шёл без таймаута → в самолёте getSession/refresh мог висеть минутами
 * и держать loading=true (или блокировать UI).
 */
export const SUPABASE_REST_TIMEOUT_MS = 70_000;
/** Короткий потолок для GoTrue: офлайн = быстрый отказ, UI не ждёт. */
export const SUPABASE_AUTH_TIMEOUT_MS = 12_000;
/** Загрузка AuthProvider: не дольше этого ждём getSession. */
export const AUTH_BOOT_TIMEOUT_MS = 2_500;
