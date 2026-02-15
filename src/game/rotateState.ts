/**
 * Ротация GameState для отображения: игрок с индексом mySlotIndex становится «я» (индекс 0).
 * Используется в онлайн-режиме: на сервере состояние в «каноническом» виде (слот 0 = хост и т.д.),
 * у каждого клиента свой mySlotIndex; для отрисовки вращаем состояние так, чтобы «я» всегда внизу.
 */

import type { GameState } from './GameEngine';

function rot(i: number, mySlot: number): number {
  return (i - mySlot + 4) % 4;
}
function invRot(i: number, mySlot: number): number {
  return (i + mySlot) % 4;
}

export function rotateStateForPlayer(state: GameState, mySlotIndex: number): GameState {
  if (mySlotIndex === 0) return state;
  const r = (i: number) => rot(i, mySlotIndex);
  return {
    ...state,
    players: [
      state.players[mySlotIndex],
      state.players[(mySlotIndex + 1) % 4],
      state.players[(mySlotIndex + 2) % 4],
      state.players[(mySlotIndex + 3) % 4],
    ],
    bids: [
      state.bids[mySlotIndex],
      state.bids[(mySlotIndex + 1) % 4],
      state.bids[(mySlotIndex + 2) % 4],
      state.bids[(mySlotIndex + 3) % 4],
    ],
    dealerIndex: r(state.dealerIndex),
    currentPlayerIndex: r(state.currentPlayerIndex),
    trickLeaderIndex: r(state.trickLeaderIndex),
    lastCompletedTrick: state.lastCompletedTrick
      ? {
          ...state.lastCompletedTrick,
          winnerIndex: r(state.lastCompletedTrick.winnerIndex),
          leaderIndex: r(state.lastCompletedTrick.leaderIndex),
        }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? {
          ...state.pendingTrickCompletion,
          winnerIndex: r(state.pendingTrickCompletion.winnerIndex),
          leaderIndex: r(state.pendingTrickCompletion.leaderIndex),
        }
      : null,
  };
}

/** Обратная ротация: из «отображаемого» состояния (я = 0) получить каноническое для отправки на сервер. */
export function unrotateStateToCanonical(state: GameState, mySlotIndex: number): GameState {
  if (mySlotIndex === 0) return state;
  const inv = (i: number) => invRot(i, mySlotIndex);
  return {
    ...state,
    players: [
      state.players[inv(0)],
      state.players[inv(1)],
      state.players[inv(2)],
      state.players[inv(3)],
    ],
    bids: [
      state.bids[inv(0)],
      state.bids[inv(1)],
      state.bids[inv(2)],
      state.bids[inv(3)],
    ],
    dealerIndex: inv(state.dealerIndex),
    currentPlayerIndex: inv(state.currentPlayerIndex),
    trickLeaderIndex: inv(state.trickLeaderIndex),
    lastCompletedTrick: state.lastCompletedTrick
      ? {
          ...state.lastCompletedTrick,
          winnerIndex: inv(state.lastCompletedTrick.winnerIndex),
          leaderIndex: inv(state.lastCompletedTrick.leaderIndex),
        }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? {
          ...state.pendingTrickCompletion,
          winnerIndex: inv(state.pendingTrickCompletion.winnerIndex),
          leaderIndex: inv(state.pendingTrickCompletion.leaderIndex),
        }
      : null,
  };
}
