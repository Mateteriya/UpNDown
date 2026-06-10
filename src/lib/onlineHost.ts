import { isWsOnlineConfigured } from './onlineTransport';

/** Панель хоста на ПК: host_user_id вида host-…, за столом никого нет — ведёт слот 0. */
export function isPanelDedicatedHostId(hostUserId?: string | null): boolean {
  const h = hostUserId?.trim();
  return !!h && h.startsWith('host-');
}

/** Кто может слать ходы ИИ и запускать следующую раздачу (хост комнаты). */
export function canDriveOnlineRoomHost(opts: {
  onlinePlayerId?: string;
  hostUserId?: string | null;
  myServerIndex?: number;
}): boolean {
  const uid = opts.onlinePlayerId?.trim();
  if (!uid) return false;
  const host = opts.hostUserId?.trim();
  if (host && isPanelDedicatedHostId(host)) {
    return (opts.myServerIndex ?? -1) === 0;
  }
  if (host) return uid === host;
  return (opts.myServerIndex ?? 0) === 0;
}

/** Кто нажимает «Начать игру» в лобби (ведущий за столом). */
export function canStartOnlineRoom(opts: { myServerIndex?: number }): boolean {
  return (opts.myServerIndex ?? -1) === 0;
}

export function isLanWsOnline(): boolean {
  return isWsOnlineConfigured();
}
