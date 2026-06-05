/**
 * Единая точка входа для онлайн API: Supabase или WebSocket (VITE_ONLINE_TRANSPORT=ws).
 */

export * from './onlineGameSupabase';

import type { GameState } from '../game/GameEngine';
import * as sb from './onlineGameSupabase';
import * as ws from './onlineGameWs';
import { isWsOnlineTransport } from './onlineTransport';

const useWs = (): boolean => isWsOnlineTransport();

export const createRoom: typeof sb.createRoom = (...args) =>
  useWs() ? ws.wsCreateRoom(...args) : sb.createRoom(...args);

export const joinRoom: typeof sb.joinRoom = (...args) =>
  useWs() ? ws.wsJoinRoom(...args) : sb.joinRoom(...args);

export const recoverJoinByCode: typeof sb.recoverJoinByCode = (...args) =>
  useWs() ? ws.wsRecoverJoinByCode(...args) : sb.recoverJoinByCode(...args);

export const getRoom: typeof sb.getRoom = (...args) =>
  useWs() ? ws.wsGetRoom(...args) : sb.getRoom(...args);

export const getRoomQuick: typeof sb.getRoomQuick = (...args) =>
  useWs() ? ws.wsGetRoomQuick(...args) : sb.getRoomQuick(...args);

export const getRoomForSyncPoll: typeof sb.getRoomForSyncPoll = (...args) =>
  useWs() ? ws.wsGetRoomForSyncPoll(...args) : sb.getRoomForSyncPoll(...args);

export const updateRoomState: typeof sb.updateRoomState = (...args) =>
  useWs() ? ws.wsUpdateRoomState(...args) : sb.updateRoomState(...args);

export const updateRoomPlayerSlots: typeof sb.updateRoomPlayerSlots = (...args) =>
  useWs() ? ws.wsUpdateRoomPlayerSlots(...args) : sb.updateRoomPlayerSlots(...args);

/** Синхронизация имени игрока в комнате (слоты + game_state в партии). */
export async function pushPlayerDisplayName(
  roomId: string,
  playerId: string,
  displayName: string,
): Promise<{ error?: string; room?: sb.GameRoomRow }> {
  const trimmed = displayName.trim().slice(0, 17);
  if (useWs()) return ws.wsUpdateDisplayName(roomId, playerId, trimmed);
  const fresh = await sb.getRoom(roomId);
  if (!fresh?.id) return { error: 'Комната не найдена' };
  const slots = ((fresh.player_slots as sb.PlayerSlot[]) || []).slice();
  const idx = slots.findIndex((s) => s.userId === playerId);
  if (idx === -1) return { error: 'Слот не найден' };
  slots[idx] = { ...slots[idx], displayName: trimmed };
  const r = await sb.updateRoomPlayerSlots(roomId, slots);
  if (r.error) return r;
  if (fresh.status === 'playing' && fresh.game_state && typeof fresh.game_state === 'object') {
    const gs = fresh.game_state as GameState;
    const slot = slots.find((s) => s.userId === playerId);
    if (slot && typeof slot.slotIndex === 'number' && Array.isArray(gs.players)) {
      const players = gs.players.map((p, i) =>
        i === slot.slotIndex ? { ...p, name: trimmed } : p,
      );
      const st = await sb.updateRoomState(roomId, { ...gs, players }, slots);
      if (st.error) return { error: st.error };
      return { room: st.room };
    }
  }
  const room2 = await sb.getRoom(roomId);
  return { room: room2 ?? undefined };
}

export const subscribeToRoom: typeof sb.subscribeToRoom = (...args) =>
  useWs() ? ws.wsSubscribeToRoom(...args) : sb.subscribeToRoom(...args);

export const leaveRoom: typeof sb.leaveRoom = (...args) =>
  useWs() ? ws.wsLeaveRoom(...args) : sb.leaveRoom(...args);

export const peekRoomByCode: typeof sb.peekRoomByCode = (...args) =>
  useWs() ? ws.wsPeekRoomByCode(...args) : sb.peekRoomByCode(...args);

export const listPublicWaitingRooms: typeof sb.listPublicWaitingRooms = (...args) =>
  useWs() ? ws.wsListPublicWaitingRooms(...args) : sb.listPublicWaitingRooms(...args);

export const heartbeatPresence: typeof sb.heartbeatPresence = (...args) =>
  useWs() ? ws.wsHeartbeatPresence(...args) : sb.heartbeatPresence(...args);

export const hostPingRoom: typeof sb.hostPingRoom = (...args) =>
  useWs() ? ws.wsHostPingRoom(...args) : sb.hostPingRoom(...args);

export const returnSlotToPlayer: typeof sb.returnSlotToPlayer = (...args) =>
  useWs() ? ws.wsReturnSlotToPlayer(...args) : sb.returnSlotToPlayer(...args);

export const takePauseInRoom: typeof sb.takePauseInRoom = (...args) =>
  useWs() ? ws.wsTakePauseInRoom(...args) : sb.takePauseInRoom(...args);

export const transferHostRoom: typeof sb.transferHostRoom = (...args) =>
  useWs() ? ws.wsTransferHostRoom(...args) : sb.transferHostRoom(...args);

export const hostResolveAbsent: typeof sb.hostResolveAbsent = (...args) =>
  useWs() ? ws.wsHostResolveAbsent(...args) : sb.hostResolveAbsent(...args);
