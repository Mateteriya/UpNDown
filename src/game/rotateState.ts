/**
 * Ротация GameState для онлайн: «вид из моего места».
 * Порядок на экране: 0=я (внизу), 1=напротив, 2=слева от меня, 3=справа от меня.
 * Геометрия стола как в GameEngine: Юг(0) внизу, Север(1) вверху, Запад(2) слева, Восток(3) справа;
 * следующий слева: 0→2→1→3→0 (NEXT_PLAYER_LEFT).
 */

import type { GameState } from './GameEngine';

// Геометрия стола (как в GameEngine): противоположные пары Юг–Север, Запад–Восток
const OPPOSITE = [1, 0, 3, 2] as const;
// Следующий по левую руку: Юг→Запад→Север→Восток→Юг
const NEXT_PLAYER_LEFT = [2, 3, 1, 0] as const;
// Сосед справа (у кого я слева)
const NEXT_PLAYER_RIGHT = [3, 2, 0, 1] as const;

/** Порядок слотов для отображения: [я, напротив, слева, справа] */
function displayOrder(mySlot: number): [number, number, number, number] {
  return [
    mySlot,
    OPPOSITE[mySlot],
    NEXT_PLAYER_LEFT[mySlot],
    NEXT_PLAYER_RIGHT[mySlot],
  ];
}

/** Индекс в canonical по display-индексу (для unrotate и подстановки имён из слотов). */
export function getCanonicalIndexForDisplay(displayIdx: number, myServerIndex: number): number {
  return displayOrder(myServerIndex)[displayIdx];
}
function canonicalIndex(displayIdx: number, mySlot: number): number {
  return displayOrder(mySlot)[displayIdx];
}

export function rotateStateForPlayer(state: GameState, myServerIndex: number): GameState {
  if (myServerIndex === 0) return state;
  const [d0, d1, d2, d3] = displayOrder(myServerIndex);
  const toDisplay = (canonicalIdx: number): number => {
    if (canonicalIdx === d0) return 0;
    if (canonicalIdx === d1) return 1;
    if (canonicalIdx === d2) return 2;
    return 3;
  };
  return {
    ...state,
    players: [state.players[d0], state.players[d1], state.players[d2], state.players[d3]],
    bids: [state.bids[d0], state.bids[d1], state.bids[d2], state.bids[d3]],
    dealerIndex: toDisplay(state.dealerIndex),
    currentPlayerIndex: toDisplay(state.currentPlayerIndex),
    trickLeaderIndex: toDisplay(state.trickLeaderIndex),
    lastCompletedTrick: state.lastCompletedTrick
      ? { ...state.lastCompletedTrick, winnerIndex: toDisplay(state.lastCompletedTrick.winnerIndex), leaderIndex: toDisplay(state.lastCompletedTrick.leaderIndex) }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? { ...state.pendingTrickCompletion, winnerIndex: toDisplay(state.pendingTrickCompletion.winnerIndex), leaderIndex: toDisplay(state.pendingTrickCompletion.leaderIndex) }
      : null,
  };
}

export function unrotateStateToCanonical(state: GameState, myServerIndex: number): GameState {
  if (myServerIndex === 0) return state;
  const toCanonical = (displayIdx: number) => canonicalIndex(displayIdx, myServerIndex);
  return {
    ...state,
    players: [state.players[toCanonical(0)], state.players[toCanonical(1)], state.players[toCanonical(2)], state.players[toCanonical(3)]],
    bids: [state.bids[toCanonical(0)], state.bids[toCanonical(1)], state.bids[toCanonical(2)], state.bids[toCanonical(3)]],
    dealerIndex: toCanonical(state.dealerIndex),
    currentPlayerIndex: toCanonical(state.currentPlayerIndex),
    trickLeaderIndex: toCanonical(state.trickLeaderIndex),
    lastCompletedTrick: state.lastCompletedTrick
      ? { ...state.lastCompletedTrick, winnerIndex: toCanonical(state.lastCompletedTrick.winnerIndex), leaderIndex: toCanonical(state.lastCompletedTrick.leaderIndex) }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? { ...state.pendingTrickCompletion, winnerIndex: toCanonical(state.pendingTrickCompletion.winnerIndex), leaderIndex: toCanonical(state.pendingTrickCompletion.leaderIndex) }
      : null,
  };
}
