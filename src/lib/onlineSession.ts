/**
 * Сессия онлайн-комнаты в sessionStorage (отдельный модуль — чтобы Fast Refresh не ругался
 * на смешение экспорта хелперов и React-компонентов в OnlineGameContext).
 */

const ONLINE_SESSION_KEY = 'updown_online_session';

export function saveOnlineSession(roomId: string, deviceId: string) {
  try {
    sessionStorage.setItem(ONLINE_SESSION_KEY, JSON.stringify({ roomId, deviceId }));
  } catch {
    /* ignore */
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
      return p as { roomId: string; deviceId: string };
    }
    return null;
  } catch {
    return null;
  }
}
