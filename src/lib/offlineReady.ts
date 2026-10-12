/**
 * Полный офлайн: игра без интернета (локальный профиль + ИИ + LAN-party).
 * Облако (Supabase) — опционально; при отсутствии сети не должно блокировать UI.
 */

/** Браузер явно offline (самолёт / нет сети). */
export function isBrowserOffline(): boolean {
  if (typeof navigator === 'undefined') return false;
  return navigator.onLine === false;
}

/**
 * LAN-party /play/ с хоста: облако не требуется.
 * Не путать с «нет Wi‑Fi» — здесь есть локальная сеть к хосту.
 */
export function isLanPartyClient(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const path = window.location.pathname || '';
    if (path === '/play' || path.startsWith('/play/')) return true;
    if (sessionStorage.getItem('updown_transport_override') === 'ws') return true;
    if (sessionStorage.getItem('updown_ws_url_override')) return true;
  } catch {
    /* ignore */
  }
  return false;
}

/** Не ждать облако при старте: офлайн браузера или уже в LAN-режиме. */
export function shouldSkipCloudBootWait(): boolean {
  return isBrowserOffline() || isLanPartyClient();
}
