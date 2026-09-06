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
  opts?: { stripUnknownHands: boolean; keepAvatars?: boolean },
): GameRoomRow {
  const gs = room.game_state;
  let next: GameRoomRow = room;
  if (gs && typeof gs === 'object' && Array.isArray((gs as GameState).players)) {
    const seat = viewerSeatIndex(room, userId);
    if (seat != null || opts?.stripUnknownHands) {
      next = { ...room, game_state: projectGameState(gs as GameState, seat) };
    }
  }
  const keepAvatars = opts?.keepAvatars === true;
  if (!keepAvatars) {
    next = { ...next, player_slots: slimPlayerSlots(next.player_slots) ?? [] };
  }
  return next;
}

/** Снимок на диск без data-URL — иначе каждый ход stringify ~100KB и rename ломается. */
export function slimRoomForPersist(room: GameRoomRow): GameRoomRow {
  return {
    ...room,
    player_slots: slimPlayerSlots(room.player_slots) ?? room.player_slots,
  };
}

export function lobbyRoomPublic(room: GameRoomRow): GameRoomRow {
  return { ...room, game_state: null };
}

export function slotsOf(room: GameRoomRow): PlayerSlot[] {
  return room.player_slots ?? [];
}

/**
 * Живой game_state не таскает data-URL аватаров (до ~140KB × слот).
 * Иначе один ход — сотни КБ на каждого клиента, Wi‑Fi рвёт всех сразу.
 */
export function slimPlayerSlots(slots: PlayerSlot[] | undefined | null): PlayerSlot[] | undefined {
  if (!slots) return undefined;
  return slots.map((s) => {
    if (s.avatarDataUrl == null) return s;
    const { avatarDataUrl: _omit, ...rest } = s;
    return rest;
  });
}
