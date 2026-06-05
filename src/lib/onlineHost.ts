import { isWsOnlineConfigured } from './onlineTransport';

/** Кто может слать ходы ИИ и запускать следующую раздачу (хост комнаты). */
export function canDriveOnlineRoomHost(opts: {
  onlinePlayerId?: string;
  hostUserId?: string | null;
  myServerIndex?: number;
}): boolean {
  const uid = opts.onlinePlayerId?.trim();
  if (!uid) return false;
  const host = opts.hostUserId?.trim();
  if (host) return uid === host;
  return (opts.myServerIndex ?? 0) === 0;
}

export function isLanWsOnline(): boolean {
  return isWsOnlineConfigured();
}
