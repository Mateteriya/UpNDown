/** Протокол v2 — server-authoritative команды. */

import type { GameState } from '../../../src/game/GameEngine.js';
import type { Card } from '../../../src/game/types.js';
import type { GameRoomRow, PlayerSlot } from '../protocol.js';

export const V2_GAME_COMMANDS = new Set([
  'start_game',
  'place_bid',
  'play_card',
  'take_pause',
  'return_from_pause',
  'host_return_slot',
  'transfer_host',
  'host_resolve_absent',
]);

export interface V2ClientMessage {
  type: string;
  requestId?: string;
  roomId?: string;
  playerId?: string;
  hostId?: string;
  seat?: number;
  bid?: number;
  card?: Card;
  newHostUserId?: string;
  choice?: 'finish' | 'wait' | 'replace_ai';
  protocolVersion?: number;
}

export interface GameStatePush {
  type: 'game_state';
  roomId: string;
  revision: number;
  state: GameState;
  playerSlots?: PlayerSlot[];
  roomPhase?: string | null;
}

export interface RoomMetaPush {
  type: 'room_meta';
  room: GameRoomRow;
}

export interface CommandResult {
  type: 'command_result';
  requestId?: string;
  ok: boolean;
  error?: string;
  revision?: number;
}

export type V2ServerPush = GameStatePush | RoomMetaPush | CommandResult;
