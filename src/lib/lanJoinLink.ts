/**
 * Вход по ссылке от панели хоста: ?code=ABC&ws=ws://…&transport=ws
 * Позволяет гостям подключаться без .env.local (ссылка с панели на ПК в той же Wi‑Fi).
 */

const WS_OVERRIDE_KEY = 'updown_ws_url_override';
const TRANSPORT_OVERRIDE_KEY = 'updown_transport_override';
const WS_PROTOCOL_OVERRIDE_KEY = 'updown_ws_protocol_override';

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
  const wsProtocol = p.get('wsProtocol')?.trim().toLowerCase();
  if (wsProtocol === 'v2' || wsProtocol === '2') {
    try {
      sessionStorage.setItem(WS_PROTOCOL_OVERRIDE_KEY, 'v2');
    } catch {
      /* ignore */
    }
  } else if (wsProtocol === 'v1' || wsProtocol === '1') {
    try {
      sessionStorage.removeItem(WS_PROTOCOL_OVERRIDE_KEY);
    } catch {
      /* ignore */
    }
  }
  const code = p.get('code')?.trim().toUpperCase() ?? null;
  const autojoin = p.get('autojoin') === '1';
  return { code, autojoin };
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
