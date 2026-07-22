/**
 * Ротация GameState для онлайн: «вид из моего места».
 * Порядок на экране: 0=я (внизу), 1=напротив, 2=слева от меня, на четверых 3=справа.
 *
 * Тот же контракт, что у четверых: слева всегда сосед «по левую руку» = следующий по ходу.
 * На троих — те же роли без Востока (слоты 0..2). Круг хода не здесь: он в GameEngine
 * (0→2→1→3→0 / на троих 0→2→1→0).
 */

import type { GameState } from './GameEngine';
import type { DealResult } from './GameEngine';
import type { PlayerCount } from './GameEngine';
import { playerAtLeftFrom } from './GameEngine';

// Геометрия четверых: Юг(0), Север(1), Запад(2), Восток(3)
const OPPOSITE_4 = [1, 0, 3, 2] as const;
const NEXT_PLAYER_LEFT_4 = [2, 3, 1, 0] as const;
const NEXT_PLAYER_RIGHT_4 = [3, 2, 0, 1] as const;
/** На троих без Востока — тот же круг, что в GameEngine.NEXT_PLAYER_LEFT_3 */
const NEXT_PLAYER_LEFT_3 = [2, 0, 1] as const;

/**
 * [я, напротив, слева] (+ справа на 4).
 * Слева = следующий по часовой (стандартные правила), как панель Запада у Юга на четверых.
 */
function displayOrder(mySlot: number, playerCount: PlayerCount): number[] {
  if (playerCount === 3) {
    const left = NEXT_PLAYER_LEFT_3[mySlot % 3]!;
    const across = ([0, 1, 2] as const).find((i) => i !== mySlot && i !== left)!;
    return [mySlot, across, left];
  }
  return [
    mySlot,
    OPPOSITE_4[mySlot]!,
    NEXT_PLAYER_LEFT_4[mySlot]!,
    NEXT_PLAYER_RIGHT_4[mySlot]!,
  ];
}

/** Индекс в canonical по display-индексу (аватары / слоты комнаты). */
export function getCanonicalIndexForDisplay(
  displayIdx: number,
  myServerIndex: number,
  playerCount: PlayerCount = 4,
): number {
  return displayOrder(myServerIndex, playerCount)[displayIdx] ?? -1;
}

function canonicalIndex(displayIdx: number, mySlot: number, playerCount: PlayerCount): number {
  return displayOrder(mySlot, playerCount)[displayIdx]!;
}

/**
 * После rotate display-индексы образуют тот же круг, что канон у Юга:
 * 4: 0→2→1→3→0, 3: 0→2→1→0 — поэтому playerAtLeftFrom по display работает как в офлайне.
 */
export function getDisplayTrickPlayerIndex(
  trickLeaderDisplayIndex: number,
  cardIndex: number,
  _myServerIndex: number,
  playerCount: PlayerCount,
): number {
  return playerAtLeftFrom(trickLeaderDisplayIndex, cardIndex, playerCount);
}

export function rotateStateForPlayer(state: GameState, myServerIndex: number): GameState {
  if (myServerIndex === 0) return state;
  const playerCount: PlayerCount = state.players.length === 3 ? 3 : 4;
  const order = displayOrder(myServerIndex, playerCount);
  const toDisplay = (canonicalIdx: number): number => {
    const d = order.indexOf(canonicalIdx);
    return d >= 0 ? d : 0;
  };
  const mapDealRow = (deal: DealResult): DealResult => ({
    ...deal,
    bids: order.map((i) => deal.bids[i]!),
    points: order.map((i) => deal.points[i]!),
    ...(deal.takens ? { takens: order.map((i) => deal.takens![i]!) } : {}),
  });
  return {
    ...state,
    players: order.map((i) => state.players[i]!),
    bids: order.map((i) => state.bids[i]!),
    dealHistory: (state.dealHistory ?? []).map(mapDealRow),
    dealerIndex: toDisplay(state.dealerIndex),
    currentPlayerIndex: toDisplay(state.currentPlayerIndex),
    trickLeaderIndex: toDisplay(state.trickLeaderIndex),
    lastCompletedTrick: state.lastCompletedTrick
      ? {
          ...state.lastCompletedTrick,
          winnerIndex: toDisplay(state.lastCompletedTrick.winnerIndex),
          leaderIndex: toDisplay(state.lastCompletedTrick.leaderIndex),
        }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? {
          ...state.pendingTrickCompletion,
          winnerIndex: toDisplay(state.pendingTrickCompletion.winnerIndex),
          leaderIndex: toDisplay(state.pendingTrickCompletion.leaderIndex),
        }
      : null,
  };
}

export function unrotateStateToCanonical(state: GameState, myServerIndex: number): GameState {
  if (myServerIndex === 0) return state;
  const playerCount: PlayerCount = state.players.length === 3 ? 3 : 4;
  const order = displayOrder(myServerIndex, playerCount);
  const toCanonical = (displayIdx: number) => canonicalIndex(displayIdx, myServerIndex, playerCount);
  const players: GameState['players'] = Array.from({ length: playerCount }, () => state.players[0]!);
  const bids: GameState['bids'] = Array.from({ length: playerCount }, () => null);
  for (let d = 0; d < order.length; d++) {
    const c = order[d]!;
    players[c] = state.players[d]!;
    bids[c] = state.bids[d]!;
  }
  const mapDealRowBack = (deal: DealResult): DealResult => {
    const outBids = Array.from({ length: playerCount }, () => 0);
    const outPoints = Array.from({ length: playerCount }, () => 0);
    const outTakens = deal.takens ? Array.from({ length: playerCount }, () => 0) : undefined;
    for (let d = 0; d < order.length; d++) {
      const c = order[d]!;
      outBids[c] = deal.bids[d]!;
      outPoints[c] = deal.points[d]!;
      if (outTakens && deal.takens) outTakens[c] = deal.takens[d]!;
    }
    return {
      ...deal,
      bids: outBids,
      points: outPoints,
      ...(outTakens ? { takens: outTakens } : {}),
    };
  };
  return {
    ...state,
    players,
    bids,
    dealHistory: (state.dealHistory ?? []).map(mapDealRowBack),
    dealerIndex: toCanonical(state.dealerIndex),
    currentPlayerIndex: toCanonical(state.currentPlayerIndex),
    trickLeaderIndex: toCanonical(state.trickLeaderIndex),
    lastCompletedTrick: state.lastCompletedTrick
      ? {
          ...state.lastCompletedTrick,
          winnerIndex: toCanonical(state.lastCompletedTrick.winnerIndex),
          leaderIndex: toCanonical(state.lastCompletedTrick.leaderIndex),
        }
      : null,
    pendingTrickCompletion: state.pendingTrickCompletion
      ? {
          ...state.pendingTrickCompletion,
          winnerIndex: toCanonical(state.pendingTrickCompletion.winnerIndex),
          leaderIndex: toCanonical(state.pendingTrickCompletion.leaderIndex),
        }
      : null,
  };
}
