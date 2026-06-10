/**
 * Сессия онлайн-комнаты: sessionStorage + зеркало в localStorage (LAN: камера на телефоне
 * часто убивает вкладку и sessionStorage пропадает, last-party в localStorage остаётся).
 */

import { saveLastOnlineParty } from './lastOnlineParty';
import { isWsOnlineTransport } from './onlineTransport';

const ONLINE_SESSION_KEY = 'updown_online_session';
const ONLINE_SESSION_BACKUP_KEY = 'updown_online_session_backup';
export const LOBBY_UI_OPEN_KEY = 'updown_lobby_ui_open';

export type OnlineSession = { roomId: string; deviceId: string };

function parseSession(raw: string | null): OnlineSession | null {
  if (!raw) return null;
  try {
    const p = JSON.parse(raw) as unknown;
    if (
      p &&
      typeof p === 'object' &&
      typeof (p as { roomId?: string }).roomId === 'string' &&
      typeof (p as { deviceId?: string }).deviceId === 'string'
    ) {
      return p as OnlineSession;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveOnlineSession(roomId: string, deviceId: string, code?: string | null) {
  const payload = JSON.stringify({ roomId, deviceId });
  try {
    sessionStorage.setItem(ONLINE_SESSION_KEY, payload);
  } catch {
    /* ignore */
  }
  if (isWsOnlineTransport()) {
    try {
      localStorage.setItem(
        ONLINE_SESSION_BACKUP_KEY,
        JSON.stringify({ roomId, deviceId, savedAt: Date.now() }),
      );
    } catch {
      /* ignore */
    }
  }
  if (code != null && String(code).trim() !== '') {
    saveLastOnlineParty(roomId, String(code).trim());
  }
}

export function clearOnlineSession() {
  try {
    sessionStorage.removeItem(ONLINE_SESSION_KEY);
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(ONLINE_SESSION_BACKUP_KEY);
  } catch {
    /* ignore */
  }
}

export function loadOnlineSession(): OnlineSession | null {
  try {
    const fromTab = parseSession(sessionStorage.getItem(ONLINE_SESSION_KEY));
    if (fromTab) return fromTab;
  } catch {
    /* ignore */
  }
  if (!isWsOnlineTransport()) return null;
  try {
    const raw = localStorage.getItem(ONLINE_SESSION_BACKUP_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as { roomId?: string; deviceId?: string; savedAt?: number };
    if (typeof p.roomId !== 'string' || typeof p.deviceId !== 'string') return null;
    const savedAt = typeof p.savedAt === 'number' ? p.savedAt : 0;
    if (savedAt > 0 && Date.now() - savedAt > 6 * 60 * 60 * 1000) return null;
    return { roomId: p.roomId, deviceId: p.deviceId };
  } catch {
    return null;
  }
}

export function markLobbyUiOpen(open: boolean): void {
  try {
    if (open) localStorage.setItem(LOBBY_UI_OPEN_KEY, '1');
    else localStorage.removeItem(LOBBY_UI_OPEN_KEY);
  } catch {
    /* ignore */
  }
}

export function wasLobbyUiOpen(): boolean {
  try {
    return localStorage.getItem(LOBBY_UI_OPEN_KEY) === '1';
  } catch {
    return false;
  }
}
