/**
 * Одна v2-комната: валидация команд и применение GameEngine.
 */

import {
  completeTrick,
  createGameOnline,
  placeBid,
  playCard,
  startDeal,
  startNextDeal,
  type GameState,
} from '../../../src/game/GameEngine.js';
import type { Card } from '../../../src/game/types.js';
import type { GameRoomRow, PlayerSlot } from '../protocol.js';
import type { RoomStore } from '../rooms.js';
import { V2CommandError } from './errors.js';

const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;

function fullSlots(slots: PlayerSlot[]): PlayerSlot[] {
  const byIndex = new Map<number, PlayerSlot>();
  for (const s of slots ?? []) {
    if (typeof s.slotIndex === 'number' && s.slotIndex >= 0 && s.slotIndex <= 3) {
      byIndex.set(s.slotIndex, s);
    }
  }
  const out: PlayerSlot[] = [];
  for (let i = 0; i < 4; i++) {
    const existing = byIndex.get(i);
    out.push(
      existing ?? {
        slotIndex: i,
        displayName: AI_NAMES[i] ?? `ИИ ${i}`,
        userId: null,
      },
    );
  }
  return out;
}

function cardEqual(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

export type GameStateCommit = {
  room: GameRoomRow;
  revision: number;
  state: GameState;
};

export class GameSession {
  trickCompleteAt: number | null = null;
  trickKey = '';
  dealNextAt: number | null = null;
  dealNumber: number | null = null;

  constructor(
    readonly roomId: string,
    private readonly store: RoomStore,
  ) {}

  private room(): GameRoomRow {
    const r = this.store.getById(this.roomId);
    if (!r) throw new V2CommandError('room_not_found');
    return r;
  }

  private state(): GameState {
    const r = this.room();
    if (!r.game_state || typeof r.game_state !== 'object') {
      throw new V2CommandError('game_not_started');
    }
    return r.game_state as GameState;
  }

  private seatForPlayer(playerId: string): number {
    const slots = fullSlots(this.room().player_slots ?? []);
    const slot = slots.find((s) => s.userId === playerId);
    if (!slot || typeof slot.slotIndex !== 'number') {
      throw new V2CommandError('seat_mismatch');
    }
    return slot.slotIndex;
  }

  private assertHost(playerId: string): void {
    const r = this.room();
    if (r.host_user_id !== playerId) throw new V2CommandError('not_host');
  }

  private commit(next: GameState, slots?: PlayerSlot[], roomPhase?: string): GameStateCommit {
    const result = this.store.commitGameStateV2(this.roomId, next, slots, roomPhase);
    if (result.error || !result.room) {
      throw new V2CommandError('room_not_found', result.error);
    }
    return {
      room: result.room,
      revision: result.room.game_state_revision ?? 0,
      state: next,
    };
  }

  startGame(playerId: string): GameStateCommit {
    const room = this.room();
    if (room.status === 'playing') {
      return {
        room,
        revision: room.game_state_revision ?? 0,
        state: this.state(),
      };
    }
    const seat = this.seatForPlayer(playerId);
    if (seat !== 0) throw new V2CommandError('not_host');

    const sourceSlots = fullSlots(room.player_slots ?? []);
    const names: [string, string, string, string] = [
      sourceSlots[0].displayName,
      sourceSlots[1].displayName,
      sourceSlots[2].displayName,
      sourceSlots[3].displayName,
    ];
    let state = createGameOnline(names);
    state = {
      ...state,
      settlementMode: (room.settlement_mode as GameState['settlementMode']) ?? 'accuracy_bonus',
      buyIn: room.buy_in ?? undefined,
    };
    state = startDeal(state);
    this.resetTimers();
    return this.commit(state, sourceSlots, 'playing');
  }

  placeBid(seat: number, bid: number, playerId: string): GameStateCommit {
    const playerSeat = this.seatForPlayer(playerId);
    if (playerSeat !== seat) throw new V2CommandError('seat_mismatch');

    const state = this.state();
    if (state.phase !== 'bidding' && state.phase !== 'dark-bidding') {
      throw new V2CommandError('wrong_phase');
    }
    if (state.currentPlayerIndex !== seat) throw new V2CommandError('not_your_turn');
    if (state.pendingTrickCompletion) throw new V2CommandError('wrong_phase');

    const next = placeBid(state, seat, bid);
    if (next === state) throw new V2CommandError('invalid_bid');
    return this.commit(next);
  }

  playCard(seat: number, card: Card, playerId: string): GameStateCommit {
    const playerSeat = this.seatForPlayer(playerId);
    if (playerSeat !== seat) throw new V2CommandError('seat_mismatch');

    const state = this.state();
    if (state.phase !== 'playing') throw new V2CommandError('wrong_phase');
    if (state.currentPlayerIndex !== seat) throw new V2CommandError('not_your_turn');
    if (state.pendingTrickCompletion) throw new V2CommandError('wrong_phase');

    const next = playCard(state, seat, card);
    if (next === state) throw new V2CommandError('invalid_card');

    if (next.pendingTrickCompletion) {
      const p = next.pendingTrickCompletion;
      const key = `${p.leaderIndex}-${p.winnerIndex}-${p.cards.map((c) => `${c.suit}:${c.rank}`).join('|')}`;
      this.trickKey = key;
      this.trickCompleteAt = Date.now() + 2000;
    }

    if (next.phase === 'deal-complete') {
      this.dealNumber = next.dealNumber;
      this.dealNextAt = Date.now() + 4500;
    }

    return this.commit(next);
  }

  runCompleteTrick(): GameStateCommit | null {
    const state = this.state();
    if (!state.pendingTrickCompletion) {
      this.trickCompleteAt = null;
      this.trickKey = '';
      return null;
    }
    const next = completeTrick(state);
    this.trickCompleteAt = null;
    this.trickKey = '';

    if (next.phase === 'deal-complete') {
      this.dealNumber = next.dealNumber;
      this.dealNextAt = Date.now() + 4500;
    }

    return this.commit(next);
  }

  runStartNextDeal(): GameStateCommit | null {
    const state = this.state();
    if (state.phase !== 'deal-complete') {
      this.dealNextAt = null;
      return null;
    }
    const next = startNextDeal(state);
    this.dealNextAt = null;
    this.dealNumber = null;
    if (!next) {
      const room = this.room();
      room.status = 'finished';
      room.room_phase = 'finished';
      room.updated_at = new Date().toISOString();
      return null;
    }
    return this.commit(next);
  }

  applyAiMove(next: GameState): GameStateCommit {
    if (next.pendingTrickCompletion) {
      const p = next.pendingTrickCompletion;
      const key = `${p.leaderIndex}-${p.winnerIndex}-${p.cards.map((c) => `${c.suit}:${c.rank}`).join('|')}`;
      this.trickKey = key;
      this.trickCompleteAt = Date.now() + 2000;
    }
    if (next.phase === 'deal-complete') {
      this.dealNumber = next.dealNumber;
      this.dealNextAt = Date.now() + 4500;
    }
    return this.commit(next);
  }

  resetTimers(): void {
    this.trickCompleteAt = null;
    this.trickKey = '';
    this.dealNextAt = null;
    this.dealNumber = null;
  }

  /** Синхронизация таймеров при tick (если pending уже есть). */
  syncTrickTimer(state: GameState): void {
    if (!state.pendingTrickCompletion) {
      this.trickCompleteAt = null;
      this.trickKey = '';
      return;
    }
    const p = state.pendingTrickCompletion;
    const key = `${p.leaderIndex}-${p.winnerIndex}-${p.cards.map((c) => `${c.suit}:${c.rank}`).join('|')}`;
    if (this.trickKey !== key) {
      this.trickKey = key;
      this.trickCompleteAt = Date.now() + 2000;
    }
  }

  syncDealTimer(state: GameState): void {
    if (state.phase !== 'deal-complete') {
      this.dealNextAt = null;
      this.dealNumber = null;
      return;
    }
    if (this.dealNumber !== state.dealNumber) {
      this.dealNumber = state.dealNumber;
      this.dealNextAt = Date.now() + 4500;
    }
  }

  static cardsMatch(a: Card[], b: Card[]): boolean {
    if (a.length !== b.length) return false;
    return a.every((c, i) => cardEqual(c, b[i]));
  }
}
