const LS_HIDDEN_MSGS = 'upndown.tableChat.hiddenMsgIds.v1';
const LS_HIDDEN_USERS = 'upndown.tableChat.hiddenUserIds.v1';
const HIDDEN_IDS_MAX = 200;

type HiddenByRoom = Record<string, string[]>;

function readHiddenMap(lsKey: string): HiddenByRoom {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(lsKey);
    if (!raw) return {};
    const p = JSON.parse(raw) as unknown;
    if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
    const out: HiddenByRoom = {};
    for (const [roomId, ids] of Object.entries(p as Record<string, unknown>)) {
      if (!roomId || !Array.isArray(ids)) continue;
      const clean = ids.filter((x): x is string => typeof x === 'string' && x.length > 0);
      if (clean.length) out[roomId] = clean.slice(-HIDDEN_IDS_MAX);
    }
    return out;
  } catch {
    return {};
  }
}

function writeHiddenMap(lsKey: string, map: HiddenByRoom): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(lsKey, JSON.stringify(map));
  } catch {
    /* quota / private mode */
  }
}

function loadHiddenSet(lsKey: string, roomId: string): Set<string> {
  const ids = readHiddenMap(lsKey)[roomId] ?? [];
  return new Set(ids);
}

function persistHiddenSet(lsKey: string, roomId: string, ids: ReadonlySet<string>): void {
  const map = readHiddenMap(lsKey);
  const list = [...ids].slice(-HIDDEN_IDS_MAX);
  if (list.length === 0) delete map[roomId];
  else map[roomId] = list;
  writeHiddenMap(lsKey, map);
}

export function loadHiddenChatMessageIds(roomId: string): Set<string> {
  return loadHiddenSet(LS_HIDDEN_MSGS, roomId);
}

export function loadHiddenChatUserIds(roomId: string): Set<string> {
  return loadHiddenSet(LS_HIDDEN_USERS, roomId);
}

export function persistHiddenChatMessageIds(roomId: string, ids: ReadonlySet<string>): void {
  persistHiddenSet(LS_HIDDEN_MSGS, roomId, ids);
}

export function persistHiddenChatUserIds(roomId: string, ids: ReadonlySet<string>): void {
  persistHiddenSet(LS_HIDDEN_USERS, roomId, ids);
}

export function withHiddenId(prev: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(prev);
  next.add(id);
  return next;
}

export function withoutHiddenId(prev: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(prev);
  next.delete(id);
  return next;
}
