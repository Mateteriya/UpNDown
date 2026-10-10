/**
 * Вход по ссылке от панели хоста: ?code=ABC&ws=ws://…&transport=ws
 * + deep link updown://join?code= / #join?code=
 * Позволяет гостям подключаться без .env.local (ссылка с панели на ПК в той же Wi‑Fi).
 */

import {
  parseJoinDeepLink,
  readJoinDeepLinkFromLocation,
  type JoinDeepLink,
} from './deepLinkJoin';

const WS_OVERRIDE_KEY = 'updown_ws_url_override';
const TRANSPORT_OVERRIDE_KEY = 'updown_transport_override';
const WS_PROTOCOL_OVERRIDE_KEY = 'updown_ws_protocol_override';

function applyJoinDeepLinkSideEffects(link: JoinDeepLink): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    if (link.ws) {
      sessionStorage.setItem(WS_OVERRIDE_KEY, link.ws);
      sessionStorage.setItem(TRANSPORT_OVERRIDE_KEY, 'ws');
    } else if (link.transport === 'ws') {
      sessionStorage.setItem(TRANSPORT_OVERRIDE_KEY, 'ws');
    }
    if (link.wsProtocol === 'v2') sessionStorage.setItem(WS_PROTOCOL_OVERRIDE_KEY, 'v2');
    if (link.wsProtocol === 'v1') sessionStorage.removeItem(WS_PROTOCOL_OVERRIDE_KEY);
  } catch {
    /* ignore */
  }
}

/**
 * Игра с того же порта, что и сервер (/play/) — WS и протокол v2 без ?ws= в URL.
 * Вызывать до первого рендера React (main.tsx).
 */
export function bootstrapLanPlayFromServer(): void {
  if (typeof window === 'undefined') return;
  const path = window.location.pathname;
  if (path !== '/play' && !path.startsWith('/play/')) return;
  try {
    sessionStorage.setItem(TRANSPORT_OVERRIDE_KEY, 'ws');
    sessionStorage.setItem(WS_PROTOCOL_OVERRIDE_KEY, 'v2');
    if (!sessionStorage.getItem(WS_OVERRIDE_KEY)) {
      const ws =
        (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host;
      sessionStorage.setItem(WS_OVERRIDE_KEY, ws);
    }
  } catch {
    /* ignore */
  }
}

export function applyLanJoinParamsFromUrl(): { code: string | null; autojoin?: boolean } {
  if (typeof window === 'undefined') return { code: null };
  const link = readJoinDeepLinkFromLocation(window.location);
  applyJoinDeepLinkSideEffects(link);
  return { code: link.code, autojoin: link.autojoin || undefined };
}

/** Применить join из произвольной строки (Capacitor appUrlOpen, share). */
export function applyJoinDeepLinkRaw(raw: string): { code: string | null; autojoin?: boolean } {
  const link = parseJoinDeepLink(raw);
  applyJoinDeepLinkSideEffects(link);
  return { code: link.code, autojoin: link.autojoin || undefined };
}

export function getWsProtocolOverride(): 'v1' | 'v2' | null {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const v = sessionStorage.getItem(WS_PROTOCOL_OVERRIDE_KEY)?.trim().toLowerCase();
    if (v === 'v2' || v === '2') return 'v2';
    if (v === 'v1' || v === '1') return 'v1';
    return null;
  } catch {
    return null;
  }
}

/** Гость открыл ссылку с панели хоста (не хост-ПК). */
export function isLanGuestInvite(): boolean {
  return hasWsTransportOverride();
}

export function shouldAutoJoinFromLanLink(): boolean {
  if (typeof window === 'undefined') return false;
  const link = readJoinDeepLinkFromLocation(window.location);
  if (link.autojoin && (link.code || hasWsTransportOverride())) return true;
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
