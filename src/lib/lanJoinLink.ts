/**
 * Вход по ссылке от панели хоста: ?code=ABC&ws=ws://…&transport=ws
 * Позволяет гостям подключаться без .env.local (ссылка с панели на ПК в той же Wi‑Fi).
 */

const WS_OVERRIDE_KEY = 'updown_ws_url_override';
const TRANSPORT_OVERRIDE_KEY = 'updown_transport_override';

export function applyLanJoinParamsFromUrl(): { code: string | null } {
  if (typeof window === 'undefined') return { code: null };
  const p = new URLSearchParams(window.location.search);
  const ws = p.get('ws')?.trim();
  if (ws) {
    try {
      sessionStorage.setItem(WS_OVERRIDE_KEY, ws);
      sessionStorage.setItem(TRANSPORT_OVERRIDE_KEY, 'ws');
    } catch {
      /* ignore */
    }
  } else if (p.get('transport') === 'ws') {
    try {
      sessionStorage.setItem(TRANSPORT_OVERRIDE_KEY, 'ws');
    } catch {
      /* ignore */
    }
  }
  const code = p.get('code')?.trim().toUpperCase() ?? null;
  const autojoin = p.get('autojoin') === '1';
  return { code, autojoin };
}

/** Гость открыл ссылку с панели хоста (не хост-ПК). */
export function isLanGuestInvite(): boolean {
  return hasWsTransportOverride();
}

export function shouldAutoJoinFromLanLink(): boolean {
  if (typeof window === 'undefined') return false;
  const p = new URLSearchParams(window.location.search);
  return p.get('autojoin') === '1' && hasWsTransportOverride();
}

export function getWsUrlOverride(): string | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    return sessionStorage.getItem(WS_OVERRIDE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

export function hasWsTransportOverride(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(TRANSPORT_OVERRIDE_KEY) === 'ws' || !!getWsUrlOverride();
  } catch {
    return false;
  }
}

/** http://host:3001/host из ws://host:3001 */
export function hostPanelUrlFromWsUrl(wsUrl: string): string | null {
  try {
    const normalized = wsUrl.trim().replace(/^ws/i, 'http');
    const u = new URL(normalized);
    return `${u.protocol}//${u.host}/host`;
  } catch {
    return null;
  }
}
