/**
 * Авто-ведение партии для комнат host_dedicated (панель хоста без игрока за столом на ПК).
 */

import { aiBid, aiPlay } from '../../src/game/ai.js';
import {
  completeTrick,
  placeBid,
  playCard,
  startNextDeal,
  type GameState,
} from '../../src/game/GameEngine.js';
import type { GameRoomRow, PlayerSlot } from './protocol.js';
import type { RoomStore } from './rooms.js';

const TICK_MS = 180;
const TRICK_COMPLETE_DELAY_MS = 2000;
const DEAL_NEXT_DELAY_MS = 4500;

function fullSlots(slots: PlayerSlot[]): PlayerSlot[] {
  const AI_NAMES = ['ИИ Север', 'ИИ Восток', 'ИИ Юг', 'ИИ Запад'] as const;
  const byIndex = new Map<number, PlayerSlot>();
  for (const s of slots) {
    if (typeof s.slotIndex === 'number' && s.slotIndex >= 0 && s.slotIndex <= 3) {
      byIndex.set(s.slotIndex, s);
    }
  }
  const out: PlayerSlot[] = [];
  for (let i = 0; i < 4; i++) {
    out.push(
      byIndex.get(i) ?? {
        slotIndex: i,
        displayName: AI_NAMES[i] ?? `ИИ ${i}`,
        userId: null,
      },
    );
  }
  return out;
}

function mayDriveAiSeat(slot: PlayerSlot | undefined): boolean {
  if (!slot || slot.absent === true) return false;
  const vacant = slot.userId == null || slot.userId === '';
  if (!vacant) return false;
  const manualPause =
    slot.pausedByUser === true &&
    slot.replacedUserId != null &&
    String(slot.replacedUserId).trim() !== '';
  return !manualPause;
}

function pendingKey(state: GameState): string {
  const p = state.pendingTrickCompletion;
  if (!p) return '';
  return `${p.leaderIndex}-${p.winnerIndex}-${p.cards.map((c) => `${c.suit}:${c.rank}`).join('|')}`;
}

type RoomTimers = {
  trickCompleteAt?: number;
  trickKey?: string;
  dealNextAt?: number;
  dealNumber?: number;
};

export class HostAutomation {
  private timers = new Map<string, RoomTimers>();

  constructor(
    private readonly store: RoomStore,
    private readonly onRoomUpdated: (room: GameRoomRow) => void,
  ) {}

  start(): void {
    setInterval(() => this.tick(), TICK_MS);
  }

  private pushState(roomId: string, next: GameState, slots?: PlayerSlot[]): void {
    const result = this.store.updateRoomState(roomId, next, slots);
    if (result.room && !result.error && !result.conflict) {
      this.onRoomUpdated(result.room);
    }
  }

  private tick(): void {
    for (const room of this.store.listDedicatedActive()) {
      try {
        this.tickRoom(room);
      } catch (e) {
        console.error('[host-automation]', room.code, e);
      }
    }
  }

  private tickRoom(room: GameRoomRow): void {
    if (room.status !== 'playing' || !room.game_state) return;
    const state = room.game_state as GameState;
    const slots = fullSlots(room.player_slots ?? []);
    let timers = this.timers.get(room.id);
    if (!timers) {
      timers = {};
      this.timers.set(room.id, timers);
    }

    if (state.pendingTrickCompletion) {
      const key = pendingKey(state);
      if (timers.trickKey !== key) {
        timers.trickKey = key;
        timers.trickCompleteAt = Date.now() + TRICK_COMPLETE_DELAY_MS;
      }
      if (timers.trickCompleteAt != null && Date.now() >= timers.trickCompleteAt) {
        timers.trickKey = undefined;
        timers.trickCompleteAt = undefined;
        const next = completeTrick(state);
        this.pushState(room.id, next, slots);
      }
      return;
    }

    timers.trickKey = undefined;
    timers.trickCompleteAt = undefined;

    if (state.phase === 'deal-complete') {
      if (timers.dealNumber !== state.dealNumber) {
        timers.dealNumber = state.dealNumber;
        timers.dealNextAt = Date.now() + DEAL_NEXT_DELAY_MS;
      }
      if (timers.dealNextAt != null && Date.now() >= timers.dealNextAt) {
        timers.dealNextAt = undefined;
        const next = startNextDeal(state);
        if (next) this.pushState(room.id, next, slots);
      }
      return;
    }

    timers.dealNumber = undefined;
    timers.dealNextAt = undefined;

    if (
      state.phase !== 'bidding' &&
      state.phase !== 'dark-bidding' &&
      state.phase !== 'playing'
    ) {
      return;
    }

    const idx = state.currentPlayerIndex;
    const slot = slots.find((s) => s.slotIndex === idx);
    if (!mayDriveAiSeat(slot)) return;

    let next: GameState | null = null;
    if (state.phase === 'bidding' || state.phase === 'dark-bidding') {
      const bid = aiBid(state, idx);
      next = placeBid(state, idx, bid);
    } else if (state.phase === 'playing') {
      const card = aiPlay(state, idx, 'amateur');
      if (card) next = playCard(state, idx, card);
    }
    if (next) this.pushState(room.id, next, slots);
  }

  clearRoom(roomId: string): void {
    this.timers.delete(roomId);
  }
}
