/**
 * Ротация GameState для отображения: игрок с индексом mySlotIndex становится «я» (индекс 0).
 * Используется в онлайн-режиме: на сервере состояние в «каноническом» виде (слот 0 = хост и т.д.),
 * у каждого клиента свой mySlotIndex; для отрисовки вращаем состояние так, чтобы «я» всегда внизу.
 *
 * В UI индекс 0 всегда отображается в позиции «Юг» (нижняя панель), независимо от того,
 * каким по счёту игрок присоединился к комнате — место пользователя всегда строго внизу (ИИ-Юг).
 */

import type { GameState } from './GameEngine';

const NEXT_LEFT = [2, 3, 1, 0] as const;

function canonToDisplayMap(mySlot: number): number[] {
  const m = new Array(4);
  m[mySlot] = 0;
  const l1 = NEXT_LEFT[mySlot];
  m[l1] = 2;
  const l2 = NEXT_LEFT[l1];
  m[l2] = 1;
  const l3 = NEXT_LEFT[l2];
  m[l3] = 3;
  return m;
}

function displayToCanonMap(mySlot: number): number[] {
  const m = canonToDisplayMap(mySlot);
  const inv = new Array(4);
  for (let i = 0; i < 4; i++) inv[m[i]] = i;
  return inv;
}

export function rotateStateForPlayer(state: GameState, mySlotIndex: number): GameState {
  if (mySlotIndex === 0) return state;
  const m = canonToDisplayMap(mySlotIndex);
  const inv = displayToCanonMap(mySlotIndex);
  return {
    ...state,
    players: [
      state.players[inv[0]],
      state.players[inv[1]],
      state.players[inv[2]],
      state.players[inv[3]],
    ],
    bids: [
      state.bids[inv[0]],
      state.bids[inv[1]],
      state.bids[inv[2]],
      state.bids[inv[3]],
    ],
    dealerIndex: m[state.dealerIndex],
    currentPlayerIndex: m[state.currentPlayerIndex],
    trickLeaderIndex: m[state.trickLeaderIndex],
    lastCompletedTrick: state.lastCompletedTrick
      ? {
          ...state.lastCompletedTrick,
          winnerIndex: m[state.lastCompletedTrick.winnerIndex],
          leaderIndex: m[state.lastCompletedTrick.leaderIndex],
        }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? {
          ...state.pendingTrickCompletion,
          winnerIndex: m[state.pendingTrickCompletion.winnerIndex],
          leaderIndex: m[state.pendingTrickCompletion.leaderIndex],
        }
      : null,
  };
}

export function unrotateStateToCanonical(state: GameState, mySlotIndex: number): GameState {
  if (mySlotIndex === 0) return state;
  const m = canonToDisplayMap(mySlotIndex);
  const inv = displayToCanonMap(mySlotIndex);
  return {
    ...state,
    players: [
      state.players[m[0]],
      state.players[m[1]],
      state.players[m[2]],
      state.players[m[3]],
    ],
    bids: [
      state.bids[m[0]],
      state.bids[m[1]],
      state.bids[m[2]],
      state.bids[m[3]],
    ],
    dealerIndex: inv[state.dealerIndex],
    currentPlayerIndex: inv[state.currentPlayerIndex],
    trickLeaderIndex: inv[state.trickLeaderIndex],
    lastCompletedTrick: state.lastCompletedTrick
      ? {
          ...state.lastCompletedTrick,
          winnerIndex: inv[state.lastCompletedTrick.winnerIndex],
          leaderIndex: inv[state.lastCompletedTrick.leaderIndex],
        }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? {
          ...state.pendingTrickCompletion,
          winnerIndex: inv[state.pendingTrickCompletion.winnerIndex],
          leaderIndex: inv[state.pendingTrickCompletion.leaderIndex],
        }
      : null,
  };
}
