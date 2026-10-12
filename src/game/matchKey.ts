/** Уникальный ключ партии для архива / claim / будущей склейки устройств. */

export function newMatchKey(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return `mk-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Общий ключ для всех за одним LAN/онлайн-столом. */
export function matchKeyForRoom(roomId: string): string {
  const id = roomId.trim();
  return id ? `room:${id}` : newMatchKey();
}
