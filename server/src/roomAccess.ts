import type { GameRoomRow } from './protocol.js';
import type { WsAuthMode, WsSocketAuth } from './wsAuth.js';

export function isRoomMember(room: GameRoomRow, userId: string | null | undefined): boolean {
  const uid = userId?.trim();
  if (!uid) return false;
  if (room.host_user_id === uid) return true;
  return (room.player_slots ?? []).some(
    (s) => s.userId === uid || s.replacedUserId === uid,
  );
}

/**
 * required: только JWT-член комнаты (или dedicated host).
 * optional + authed: тоже только член.
 * off / optional-гость: LAN — без проверки (как раньше).
 */
export function canAccessRoom(room: GameRoomRow, auth: WsSocketAuth, mode: WsAuthMode): boolean {
  if (mode === 'off') return true;
  if (auth.authed && auth.userId) return isRoomMember(room, auth.userId);
  if (mode === 'required') return false;
  return true;
}
