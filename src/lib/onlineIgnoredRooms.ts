/**
 * Комнаты, к которым не применяем тихое автовосстановление сессии при F5.
 * sessionStorage — только в пределах вкладки; не трогает продолжение активной партии,
 * пока пользователь сам не занесёт id сюда через stopAutoRestoreForCurrentRoom.
 */

const KEY = 'updown_ignored_room_ids';

function parseList(): string[] {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as unknown;
    if (!Array.isArray(p)) return [];
    return p.filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  } catch {
    return [];
  }
}

function writeList(ids: string[]) {
  try {
    const uniq = [...new Set(ids.map((s) => s.trim()).filter(Boolean))];
    if (uniq.length === 0) sessionStorage.removeItem(KEY);
    else sessionStorage.setItem(KEY, JSON.stringify(uniq));
  } catch {
    /* ignore */
  }
}

export function isRoomIgnoredForAutoRestore(roomId: string): boolean {
  if (!roomId || typeof sessionStorage === 'undefined') return false;
  const n = roomId.trim().toLowerCase();
  return parseList().some((id) => id.trim().toLowerCase() === n);
}

export function addIgnoredRoomForAutoRestore(roomId: string): void {
  if (!roomId?.trim()) return;
  const ids = parseList();
  const n = roomId.trim();
  if (!ids.some((id) => id.trim().toLowerCase() === n.toLowerCase())) ids.push(n);
  writeList(ids);
}

export function removeIgnoredRoomForAutoRestore(roomId: string): void {
  if (!roomId?.trim()) return;
  const n = roomId.trim().toLowerCase();
  const next = parseList().filter((id) => id.trim().toLowerCase() !== n);
  writeList(next);
}
