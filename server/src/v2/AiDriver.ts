/**
 * ИИ на пустых слотах — единственный драйвер для v2-комнат.
 */

import { aiBid, aiPlay } from '../../../src/game/ai.js';
import { placeBid, playCard, type GameState } from '../../../src/game/GameEngine.js';
import type { PlayerSlot } from '../protocol.js';

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

export function mayDriveAiSeat(slot: PlayerSlot | undefined): boolean {
  if (!slot || slot.absent === true) return false;
  const vacant = slot.userId == null || slot.userId === '';
  if (!vacant) return false;
  const manualPause =
    slot.pausedByUser === true &&
    slot.replacedUserId != null &&
    String(slot.replacedUserId).trim() !== '';
  return !manualPause;
}

/** Один шаг ИИ, если очередь на пустом слоте. */
export function tryAiStep(state: GameState, slots: PlayerSlot[]): GameState | null {
  if (state.pendingTrickCompletion) return null;
  if (
    state.phase !== 'bidding' &&
    state.phase !== 'dark-bidding' &&
    state.phase !== 'playing'
  ) {
    return null;
  }

  const idx = state.currentPlayerIndex;
  const full = fullSlots(slots);
  const slot = full.find((s) => s.slotIndex === idx);
  if (!mayDriveAiSeat(slot)) return null;

  if (state.phase === 'bidding' || state.phase === 'dark-bidding') {
    const bid = aiBid(state, idx);
    return placeBid(state, idx, bid);
  }

  if (state.phase === 'playing') {
    const card = aiPlay(state, idx, 'amateur');
    if (!card) return null;
    return playCard(state, idx, card);
  }

  return null;
}
