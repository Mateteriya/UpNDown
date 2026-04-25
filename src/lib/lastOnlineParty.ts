/**
 * Подсказка «последняя онлайн-комната» в localStorage — переживает обновление вкладки
 * и случаи, когда sessionStorage-сессия очищена, а комната на сервере ещё жива.
 */

const LAST_ONLINE_PARTY_KEY = 'updown_last_online_party';

export type LastOnlineParty = { roomId: string; code: string; savedAt: number };

export function saveLastOnlineParty(roomId: string, code: string) {
  const c = code.trim().toUpperCase();
  if (!roomId || !c) return;
  try {
    const payload: LastOnlineParty = { roomId, code: c, savedAt: Date.now() };
    localStorage.setItem(LAST_ONLINE_PARTY_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadLastOnlineParty(): LastOnlineParty | null {
  try {
    const raw = localStorage.getItem(LAST_ONLINE_PARTY_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as unknown;
    if (
      p &&
      typeof p === 'object' &&
      typeof (p as { roomId?: string }).roomId === 'string' &&
      typeof (p as { code?: string }).code === 'string'
    ) {
      const roomId = (p as { roomId: string }).roomId.trim();
      const code = (p as { code: string }).code.trim().toUpperCase();
      if (!roomId || !code) return null;
      const savedAt =
        typeof (p as { savedAt?: number }).savedAt === 'number' && Number.isFinite((p as { savedAt: number }).savedAt)
          ? (p as { savedAt: number }).savedAt
          : 0;
      return { roomId, code, savedAt };
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLastOnlineParty() {
  try {
    localStorage.removeItem(LAST_ONLINE_PARTY_KEY);
  } catch {
    /* ignore */
  }
}
