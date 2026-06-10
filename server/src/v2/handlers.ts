/**
 * WS-обработчики протокола v2.
 */

import type { WebSocket } from 'ws';
import type { ClientMessage, GameRoomRow, ServerMessage } from '../protocol.js';
import type { RoomStore } from '../rooms.js';
import { V2CommandError } from './errors.js';
import { GameSessionManager } from './GameSessionManager.js';
import { V2_GAME_COMMANDS } from './protocol.js';
import type { GameStatePush } from './protocol.js';

export type V2HandlerDeps = {
  store: RoomStore;
  sessionManager: GameSessionManager;
  send: (ws: WebSocket, msg: ServerMessage) => void;
  reply: (ws: WebSocket, requestId: string | undefined, body: ServerMessage) => void;
  broadcastGameState: (subs: Set<WebSocket> | undefined, push: GameStatePush) => void;
  broadcastRoomMeta: (room: GameRoomRow) => void;
  getSubscribers: (roomId: string) => Set<WebSocket> | undefined;
};

export function isV2GameCommand(type: string): boolean {
  return V2_GAME_COMMANDS.has(type);
}

export function handleV2GameMessage(
  ws: WebSocket,
  msg: ClientMessage,
  deps: V2HandlerDeps,
): boolean {
  if (!isV2GameCommand(msg.type)) return false;

  const { requestId } = msg;
  const roomId = msg.roomId;
  if (!roomId) {
    deps.reply(ws, requestId, { type: 'command_result', ok: false, error: 'room_id_required' });
    return true;
  }

  const room = deps.store.getById(roomId);
  if (!room || room.protocol_version !== 2) {
    deps.reply(ws, requestId, {
      type: 'command_result',
      ok: false,
      error: room ? 'room_not_v2' : 'room_not_found',
    });
    return true;
  }

  const session = deps.sessionManager.getOrCreate(roomId);
  const subs = deps.getSubscribers(roomId);

  try {
    let commit;
    switch (msg.type) {
      case 'start_game': {
        if (!msg.playerId) throw new V2CommandError('player_required');
        commit = session.startGame(msg.playerId);
        break;
      }
      case 'place_bid': {
        if (!msg.playerId || typeof msg.seat !== 'number' || typeof msg.bid !== 'number') {
          throw new V2CommandError('player_required');
        }
        commit = session.placeBid(msg.seat, msg.bid, msg.playerId);
        break;
      }
      case 'play_card': {
        if (!msg.playerId || typeof msg.seat !== 'number' || !msg.card) {
          throw new V2CommandError('player_required');
        }
        commit = session.playCard(msg.seat, msg.card as import('../../../src/game/types.js').Card, msg.playerId);
        break;
      }
      case 'take_pause': {
        if (!msg.playerId) throw new V2CommandError('player_required');
        const updated = deps.store.takePauseV2(roomId, msg.playerId);
        if ('error' in updated) throw new V2CommandError('room_not_found', updated.error);
        deps.broadcastRoomMeta(updated);
        deps.reply(ws, requestId, { type: 'command_result', ok: true });
        return true;
      }
      case 'return_from_pause': {
        if (!msg.playerId) throw new V2CommandError('player_required');
        const updated = deps.store.returnFromPauseV2(roomId, msg.playerId);
        if ('error' in updated) throw new V2CommandError('room_not_found', updated.error);
        deps.broadcastRoomMeta(updated);
        deps.reply(ws, requestId, { type: 'command_result', ok: true });
        return true;
      }
      case 'host_return_slot': {
        if (!msg.hostId || typeof msg.seat !== 'number') throw new V2CommandError('player_required');
        const updated = deps.store.hostReturnSlotV2(roomId, msg.hostId, msg.seat);
        if ('error' in updated) throw new V2CommandError('not_host', updated.error);
        deps.broadcastRoomMeta(updated);
        deps.reply(ws, requestId, { type: 'command_result', ok: true });
        return true;
      }
      case 'transfer_host': {
        if (!msg.hostId || !msg.newHostUserId) throw new V2CommandError('player_required');
        const updated = deps.store.transferHostV2(roomId, msg.hostId, msg.newHostUserId);
        if ('error' in updated) throw new V2CommandError('not_host', updated.error);
        deps.broadcastRoomMeta(updated);
        deps.reply(ws, requestId, { type: 'command_result', ok: true });
        return true;
      }
      case 'host_resolve_absent': {
        if (!msg.playerId || !msg.choice) throw new V2CommandError('player_required');
        const updated = deps.store.hostResolveAbsentV2(roomId, msg.playerId, msg.choice);
        if ('error' in updated) throw new V2CommandError('not_host', updated.error);
        deps.broadcastRoomMeta(updated);
        deps.reply(ws, requestId, { type: 'command_result', ok: true });
        return true;
      }
      default:
        return false;
    }

    const push: GameStatePush = {
      type: 'game_state',
      roomId: commit.room.id,
      revision: commit.revision,
      state: commit.state,
      playerSlots: commit.room.player_slots,
      roomPhase: commit.room.room_phase ?? null,
    };
    deps.broadcastGameState(subs, push);
    deps.reply(ws, requestId, {
      type: 'command_result',
      ok: true,
      revision: commit.revision,
    });
    return true;
  } catch (e) {
    const code = e instanceof V2CommandError ? e.code : 'invalid_move';
    const message = e instanceof Error ? e.message : String(e);
    deps.reply(ws, requestId, { type: 'command_result', ok: false, error: code, conflict: false });
    console.warn('[v2]', msg.type, room?.code, message);
    return true;
  }
}
