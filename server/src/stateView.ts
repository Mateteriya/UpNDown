/**
 * Проекция game_state: чужие руки не уходят на сокет.
 */

import type { GameState } from '../../src/game/GameEngine.js';
import type { GameRoomRow, PlayerSlot } from './protocol.js';

export function viewerSeatIndex(room: Pick<GameRoomRow, 'player_slots'>, userId: string | null | undefined): number | null {
  const uid = userId?.trim();
  if (!uid) return null;
  const slot = (room.player_slots ?? []).find((s) => s.userId === uid);
  return typeof slot?.slotIndex === 'number' ? slot.slotIndex : null;
}

export function projectGameState(state: GameState, viewerSeat: number | null): GameState {
  return {
    ...state,
    players: state.players.map((p, i) => {
      if (viewerSeat != null && i === viewerSeat) return p;
      return { ...p, hand: [] };
    }),
  };
}

export function projectRoomForViewer(
  room: GameRoomRow,
  userId: string | null | undefined,
  opts?: { stripUnknownHands: boolean },
): GameRoomRow {
  const gs = room.game_state;
  if (!gs || typeof gs !== 'object') return room;
  const state = gs as GameState;
  if (!Array.isArray(state.players)) return room;
  const seat = viewerSeatIndex(room, userId);
  if (seat == null && !opts?.stripUnknownHands) return room;
  return { ...room, game_state: projectGameState(state, seat) };
}

export function lobbyRoomPublic(room: GameRoomRow): GameRoomRow {
  return { ...room, game_state: null };
}

export function slotsOf(room: GameRoomRow): PlayerSlot[] {
  return room.player_slots ?? [];
}
