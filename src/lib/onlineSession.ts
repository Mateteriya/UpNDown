/**
 * Сессия онлайн-комнаты в sessionStorage (отдельный модуль — чтобы Fast Refresh не ругался
 * на смешение экспорта хелперов и React-компонентов в OnlineGameContext).
 */

import { saveLastOnlineParty } from './lastOnlineParty';

const ONLINE_SESSION_KEY = 'updown_online_session';
/**
 * Автовосстановление только для "свежей" вкладки/девайса.
 * Старая сессия через дни/недели не должна снова поднимать комнату.
 */
const ONLINE_SESSION_MAX_AGE_MS = 30 * 60 * 1000;

export function saveOnlineSession(roomId: string, deviceId: string, code?: string | null) {
  try {
    sessionStorage.setItem(
      ONLINE_SESSION_KEY,
      JSON.stringify({ roomId, deviceId, savedAt: Date.now() }),
    );
  } catch {
    /* ignore */
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
}

export function loadOnlineSession(): { roomId: string; deviceId: string } | null {
  try {
    const raw = sessionStorage.getItem(ONLINE_SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      p &&
      typeof p === 'object' &&
      typeof (p as { roomId?: string }).roomId === 'string' &&
      typeof (p as { deviceId?: string }).deviceId === 'string'
    ) {
      const savedAt = (p as { savedAt?: unknown }).savedAt;
      if (typeof savedAt !== 'number' || !Number.isFinite(savedAt)) {
        clearOnlineSession();
        return null;
      }
      if (Date.now() - savedAt > ONLINE_SESSION_MAX_AGE_MS) {
        clearOnlineSession();
        return null;
      }
      return p as { roomId: string; deviceId: string };
    }
    return null;
  } catch {
    return null;
  }
}
