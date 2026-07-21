/**
 * Игровой движок Up&Down
 * Управляет ходом игры: раздача, заказы, розыгрыш
 *
 * Расположение (вид сверху): Юг(0, вы), Север(1), Запад(2), Восток(3).
 * 4 игрока, слева: 0→2→1→3→0. 3 игрока (без Востока): 0→2→1→0.
 */

import type { AIDifficulty, Card, GamePhase, Player, Suit } from './types';
import type { SettlementMode } from './partySettlement';
import { offlineAiDifficultyForNewBotId } from './aiSettings';
import { createDeck, shuffleDeck, dealCards } from './deck';
import { calculateDealPoints } from './scoring';
import { isValidBidSum, getTrickWinner, isValidPlay } from './rules';

export type PlayerCount = 3 | 4;

const NEXT_PLAYER_LEFT_4 = [2, 3, 1, 0] as const;
const NEXT_PLAYER_LEFT_3 = [2, 0, 1] as const;

function nextPlayerLeft(i: number, playerCount: PlayerCount = 4): number {
  if (playerCount === 3) return NEXT_PLAYER_LEFT_3[i % 3]!;
  return NEXT_PLAYER_LEFT_4[i % 4]!;
}

export function playerCountOf(state: { players: { length: number } }): PlayerCount {
  return state.players.length === 3 ? 3 : 4;
}

function emptyBids(n: PlayerCount): (number | null)[] {
  return Array.from({ length: n }, () => null);
}

export function playerAtLeftFrom(base: number, steps: number, playerCount: PlayerCount = 4): number {
  let cur = base;
  for (let k = 0; k < steps; k++) cur = nextPlayerLeft(cur, playerCount);
  return cur;
}

/** Абсолютный индекс игрока, выигравшего взятку с картами по порядку хода от trickLeaderIndex. */
export function absoluteTrickWinnerPlayerIndex(
  trickLeaderIndex: number,
  trick: Card[],
  trump: Suit | null,
  playerCount: PlayerCount = 4
): number {
  if (trick.length === 0) return trickLeaderIndex;
  const offset = getTrickWinner(trick, trick[0]!.suit, trump ?? undefined);
  return playerAtLeftFrom(trickLeaderIndex, offset, playerCount);
}

export interface LastCompletedTrick {
  cards: Card[];
  winnerIndex: number;
  /** Индекс игрока, который ходил первым в этой взятке */
  leaderIndex: number;
}

/** Взятка ждёт визуального отображения карт в слотах перед завершением */
export interface PendingTrickCompletion {
  cards: Card[];
  winnerIndex: number;
  leaderIndex: number;
  allPlayed: boolean;
}

/** Результат одной раздачи: заказы и очки по игрокам [Юг, Север, Запад, (Восток)] */
export interface DealResult {
  dealNumber: number;
  bids: number[];
  points: number[];
  /** Фактические взятки по игрокам (нужно отличать +5 за 0/0 от +5 при переборе и т.п.) */
  takens?: number[];
}

export interface GameState {
  phase: GamePhase;
  players: Player[];
  dealerIndex: number;
  currentPlayerIndex: number;
  trump: Suit | null;
  tricksInDeal: number;
  currentTrick: Card[];
  trickLeaderIndex: number;
  bids: (number | null)[];
  dealNumber: number;
  /** Козырьная карта для отображения (последняя в колоде перед сдачей) */
  trumpCard: Card | null;
  /** Последняя взятая взятка — для просмотра и паузы после завершения */
  lastCompletedTrick: LastCompletedTrick | null;
  /** Взятка полная — карты в слотах, ждём задержку перед завершением */
  pendingTrickCompletion: PendingTrickCompletion | null;
  /** История завершённых раздач для таблицы результатов (мобильная модалка) */
  dealHistory: DealResult[];
  /** Онлайн: режим итога из комнаты (дублируется в game_state для restore) */
  settlementMode?: SettlementMode;
  /** Онлайн: взнос в банк (prize_pool) */
  buyIn?: number;
}

export type GameMode = 'classical' | 'extended';
export type { AIDifficulty } from './types';

/** Максимальная длина имени игрока (включая пробелы) */
export const MAX_PLAYER_NAME_LENGTH = 17;

function trimPlayerName(name: string): string {
  if (name.length <= MAX_PLAYER_NAME_LENGTH) return name;
  return name.slice(0, MAX_PLAYER_NAME_LENGTH);
}

export function maxCardsPerPlayer(playerCount: PlayerCount): number {
  return playerCount === 3 ? 12 : 9;
}

/** Раздач в партии для данного числа игроков (4 → 28, 3 → 31). */
export function dealsPerMatch(playerCount: PlayerCount = 4): number {
  const max = maxCardsPerPlayer(playerCount);
  const n = playerCount;
  return max + (n - 1) + (max - 1) + n + n;
}

/** Раздач в одной полной партии на 4 игроков (алиас для лаб/старых вызовов). */
export const DEALS_PER_MATCH = dealsPerMatch(4);

/**
 * Карт в раздаче по номеру.
 * 4: вверх 1→9, плато 9×4, вниз 8→1, бескозырка×4, тёмная×4.
 * 3: вверх 1→12, плато 12×3, вниз 11→1, бескозырка×3, тёмная×3.
 */
export function getTricksInDeal(dealNumber: number, playerCount: PlayerCount = 4): number {
  const max = maxCardsPerPlayer(playerCount);
  const n = playerCount;
  if (dealNumber <= max) return dealNumber;
  const plateauEnd = max + (n - 1);
  if (dealNumber <= plateauEnd) return max;
  const downEnd = plateauEnd + (max - 1);
  if (dealNumber <= downEnd) return max - (dealNumber - plateauEnd);
  const ntEnd = downEnd + n;
  if (dealNumber <= ntEnd) return max;
  const darkEnd = ntEnd + n;
  if (dealNumber <= darkEnd) return max;
  return 1;
}

/** Тип раздачи по номеру */
export function getDealType(
  dealNumber: number,
  playerCount: PlayerCount = 4
): 'normal' | 'no-trump' | 'dark' {
  const max = maxCardsPerPlayer(playerCount);
  const n = playerCount;
  const plateauEnd = max + (n - 1);
  const downEnd = plateauEnd + (max - 1);
  const ntEnd = downEnd + n;
  const darkEnd = ntEnd + n;
  if (dealNumber <= downEnd) return 'normal';
  if (dealNumber <= ntEnd) return 'no-trump';
  if (dealNumber <= darkEnd) return 'dark';
  return 'normal';
}

export function createGame(
  playerCount: PlayerCount,
  _mode: GameMode,
  humanPlayerName = 'Вы'
): GameState {
  const players: Player[] = [
    {
      id: 'human',
      name: trimPlayerName(humanPlayerName),
      hand: [],
      bid: undefined,
      tricksTaken: 0,
      score: 0,
    },
    {
      id: 'ai1',
      name: 'ИИ Север',
      hand: [],
      bid: undefined,
      tricksTaken: 0,
      score: 0,
      aiDifficulty: offlineAiDifficultyForNewBotId('ai1'),
    },
    {
      id: 'ai2',
      name: playerCount === 3 ? 'ИИ Запад' : 'ИИ супердлинноеим',
      hand: [],
      bid: undefined,
      tricksTaken: 0,
      score: 0,
      aiDifficulty: offlineAiDifficultyForNewBotId('ai2'),
    },
  ];
  if (playerCount === 4) {
    players.push({
      id: 'ai3',
      name: 'Семнадцать символ',
      hand: [],
      bid: undefined,
      tricksTaken: 0,
      score: 0,
      aiDifficulty: offlineAiDifficultyForNewBotId('ai3'),
    });
  }

  const firstDealer = Math.floor(Math.random() * playerCount);
  return {
    phase: 'bidding',
    players,
    dealerIndex: firstDealer,
    currentPlayerIndex: 0,
    trump: null,
    tricksInDeal: 1,
    currentTrick: [],
    trickLeaderIndex: 0,
    bids: emptyBids(playerCount),
    dealNumber: 1,
    trumpCard: null,
    lastCompletedTrick: null,
    pendingTrickCompletion: null,
    dealHistory: [],
  };
}

/** Создать игру для 4 онлайн-игроков (имена по слотам). */
export function createGameOnline(playerNames: [string, string, string, string]): GameState {
  const players: Player[] = playerNames.map((name, i) => ({
    id: `online-${i}`,
    name: trimPlayerName(name),
    hand: [],
    bid: undefined,
    tricksTaken: 0,
    score: 0,
  }));
  const firstDealer = Math.floor(Math.random() * 4);
  return {
    phase: 'bidding',
    players,
    dealerIndex: firstDealer,
    currentPlayerIndex: 0,
    trump: null,
    tricksInDeal: 1,
    currentTrick: [],
    trickLeaderIndex: 0,
    bids: emptyBids(4),
    dealNumber: 1,
    trumpCard: null,
    lastCompletedTrick: null,
    pendingTrickCompletion: null,
    dealHistory: [],
  };
}

export function startDeal(state: GameState): GameState {
  const n = playerCountOf(state);
  const dealType = getDealType(state.dealNumber, n);
  if (dealType === 'dark') return startDarkBidding(state);

  const tricksInDeal = getTricksInDeal(state.dealNumber, n);
  const deck = shuffleDeck(createDeck());
  const dealerIndex = state.dealerIndex % n;
  const firstReceiver = nextPlayerLeft(dealerIndex, n);
  const hands = dealCards(deck, n, tricksInDeal, firstReceiver);

  const cardsDealt = tricksInDeal * n;
  const trumpCard: Card | null =
    dealType === 'no-trump'
      ? null
      : cardsDealt < 36
        ? deck[cardsDealt]!
        : deck[35]!;
  const trump = trumpCard ? trumpCard.suit : null;

  const players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i] ?? [],
    bid: undefined,
    tricksTaken: 0,
  }));

  const firstBidder = firstReceiver;

  return {
    ...state,
    phase: 'bidding',
    players,
    dealerIndex,
    currentPlayerIndex: firstBidder,
    trump,
    trumpCard,
    tricksInDeal,
    currentTrick: [],
    trickLeaderIndex: firstBidder,
    bids: emptyBids(n),
    lastCompletedTrick: null,
    pendingTrickCompletion: null,
  };
}

/** Старт тёмной раздачи: заказ до раздачи, карт ещё нет */
export function startDarkBidding(state: GameState): GameState {
  const n = playerCountOf(state);
  const dealerIndex = state.dealerIndex % n;
  const firstBidder = nextPlayerLeft(dealerIndex, n);
  const tricksInDeal = getTricksInDeal(state.dealNumber, n);

  return {
    ...state,
    phase: 'dark-bidding',
    players: state.players.map((p) => ({ ...p, hand: [], bid: undefined, tricksTaken: 0 })),
    dealerIndex,
    currentPlayerIndex: firstBidder,
    trump: null,
    trumpCard: null,
    tricksInDeal,
    currentTrick: [],
    trickLeaderIndex: firstBidder,
    bids: emptyBids(n),
    lastCompletedTrick: null,
    pendingTrickCompletion: null,
  };
}

/** После заказа в тёмную — раздача и переход к игре */
export function completeDarkDeal(state: GameState): GameState {
  const n = playerCountOf(state);
  const tricksInDeal = state.tricksInDeal;
  const deck = shuffleDeck(createDeck());
  const dealerIndex = state.dealerIndex % n;
  const firstReceiver = nextPlayerLeft(dealerIndex, n);
  const hands = dealCards(deck, n, tricksInDeal, firstReceiver);

  const cardsDealt = tricksInDeal * n;
  const trumpCard: Card = cardsDealt < 36 ? deck[cardsDealt]! : deck[35]!;
  const trump = trumpCard.suit;

  const players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i] ?? [],
    bid: p.bid,
    tricksTaken: 0,
  }));

  const firstBidder = firstReceiver;

  return {
    ...state,
    phase: 'playing',
    players,
    trump,
    trumpCard,
    currentTrick: [],
    trickLeaderIndex: firstBidder,
    currentPlayerIndex: firstBidder,
    lastCompletedTrick: null,
    pendingTrickCompletion: null,
  };
}

/**
 * Следующая раздача в партии. Возвращает null, если партия завершена (после последней раздачи).
 * Сдающий строго по очереди: игрок по левую руку (по часовой) от предыдущего сдающего.
 */
export function startNextDeal(state: GameState): GameState | null {
  const n = playerCountOf(state);
  if (state.dealNumber >= dealsPerMatch(n)) return null;
  const nextDealerIndex = nextPlayerLeft(state.dealerIndex, n);
  const nextDealNumber = state.dealNumber + 1;
  const prepared = { ...state, dealNumber: nextDealNumber, dealerIndex: nextDealerIndex };
  return startDeal(prepared);
}

export function placeBid(state: GameState, playerIndex: number, bid: number): GameState {
  const n = playerCountOf(state);
  const newBids = [...state.bids];
  newBids[playerIndex] = bid;

  const players = state.players.map((p, i) => (i === playerIndex ? { ...p, bid } : p));

  const nextPlayer = nextPlayerLeft(playerIndex, n);
  const allBid = newBids.length === n && newBids.every((b) => b !== null);

  if (!allBid) {
    return {
      ...state,
      bids: newBids,
      players,
      currentPlayerIndex: nextPlayer,
    };
  }

  const bids = newBids as number[];
  if (!isValidBidSum(bids, state.tricksInDeal)) {
    const resetBids: (number | null)[] = [...newBids];
    resetBids[state.dealerIndex] = null;
    return {
      ...state,
      bids: resetBids,
      players: players.map((p, i) => (i === state.dealerIndex ? { ...p, bid: undefined } : p)),
      currentPlayerIndex: state.dealerIndex,
      phase: state.phase,
    };
  }

  if (state.phase === 'dark-bidding') {
    return completeDarkDeal({ ...state, bids: newBids, players });
  }

  return {
    ...state,
    bids: newBids,
    players,
    currentPlayerIndex: state.trickLeaderIndex,
    phase: 'playing',
    currentTrick: [],
  };
}

export function playCard(state: GameState, playerIndex: number, card: Card): GameState {
  const n = playerCountOf(state);
  const { players, currentTrick, trump, trickLeaderIndex } = state;
  const leadSuit = currentTrick.length > 0 ? currentTrick[0]!.suit : null;

  if (!isValidPlay(card, players[playerIndex]!.hand, leadSuit, trump ?? undefined)) {
    return state;
  }

  const newHand = players[playerIndex]!.hand.filter(
    (c) => !(c.suit === card.suit && c.rank === card.rank)
  );
  const newTrick = [...currentTrick, card];

  const newPlayers = players.map((p, i) => (i === playerIndex ? { ...p, hand: newHand } : p));

  const nextPlayer = nextPlayerLeft(playerIndex, n);
  const trickComplete = newTrick.length === n;

  if (!trickComplete) {
    return {
      ...state,
      players: newPlayers,
      currentTrick: newTrick,
      currentPlayerIndex: nextPlayer,
    };
  }

  const winnerOffset = getTrickWinner(newTrick, newTrick[0]!.suit, trump ?? undefined);
  const trickWinner = playerAtLeftFrom(trickLeaderIndex, winnerOffset, n);

  const updatedPlayers = newPlayers.map((p, i) =>
    i === trickWinner ? { ...p, tricksTaken: p.tricksTaken + 1 } : p
  );

  const allPlayed = updatedPlayers.every((p) => p.hand.length === 0);

  return {
    ...state,
    players: updatedPlayers,
    currentTrick: newTrick,
    currentPlayerIndex: trickWinner,
    pendingTrickCompletion: {
      cards: newTrick,
      winnerIndex: trickWinner,
      leaderIndex: trickLeaderIndex,
      allPlayed,
    },
  };
}

/** Завершить взятку после задержки (карты уже показаны в слотах) */
export function completeTrick(state: GameState): GameState {
  const pending = state.pendingTrickCompletion;
  if (!pending) return state;

  const { cards, winnerIndex, leaderIndex, allPlayed } = pending;
  const updatedPlayers = state.players;

  if (allPlayed) {
    const bids = state.bids as number[];
    const pointsThisDeal = updatedPlayers.map((p, i) => calculateDealPoints(bids[i]!, p.tricksTaken));
    const takensThisDeal = updatedPlayers.map((p) => p.tricksTaken);
    const finalPlayers = updatedPlayers.map((p, i) => ({
      ...p,
      score: p.score + pointsThisDeal[i]!,
    }));
    const dealHistory = [
      ...(state.dealHistory || []),
      { dealNumber: state.dealNumber, bids: [...bids], points: pointsThisDeal, takens: takensThisDeal },
    ];

    return {
      ...state,
      players: finalPlayers,
      dealHistory,
      currentTrick: [],
      currentPlayerIndex: winnerIndex,
      phase: 'deal-complete',
      lastCompletedTrick: { cards, winnerIndex, leaderIndex },
      pendingTrickCompletion: null,
    };
  }

  return {
    ...state,
    currentTrick: [],
    trickLeaderIndex: winnerIndex,
    currentPlayerIndex: winnerIndex,
    lastCompletedTrick: { cards, winnerIndex, leaderIndex },
    pendingTrickCompletion: null,
  };
}

export function getValidPlays(state: GameState, playerIndex: number): Card[] {
  const { players, currentTrick, trump } = state;
  const hand = players[playerIndex]!.hand;
  const leadSuit = currentTrick.length > 0 ? currentTrick[0]!.suit : null;
  return hand.filter((c) => isValidPlay(c, hand, leadSuit, trump ?? undefined));
}

export function isHumanPlayer(state: GameState, index: number): boolean {
  return state.players[index]!.id === 'human';
}
