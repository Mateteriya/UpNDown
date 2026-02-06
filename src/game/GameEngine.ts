/**
 * Игровой движок Up&Down
 * Управляет ходом игры: раздача, заказы, розыгрыш
 *
 * Расположение игроков (вид сверху): Юг(0, вы) внизу, Север(1) вверху, Запад(2) слева, Восток(3) справа.
 * Порядок «по левую руку» (следующий сдающий/игрок по часовой): 0→2→1→3→0
 */
const NEXT_PLAYER_LEFT = [2, 3, 1, 0] as const; // следующий игрок слева от [0,1,2,3]

function nextPlayerLeft(i: number): number {
  return NEXT_PLAYER_LEFT[i % 4];
}

function playerAtLeftFrom(base: number, steps: number): number {
  let cur = base;
  for (let k = 0; k < steps; k++) cur = nextPlayerLeft(cur);
  return cur;
}

import type { Card, GamePhase, Player, Suit } from './types';
import { createDeck, shuffleDeck, dealCards } from './deck';
import { calculateDealPoints } from './scoring';
import { isValidBidSum, getTrickWinner, isValidPlay } from './rules';

export interface LastCompletedTrick {
  cards: Card[];
  winnerIndex: number;
  /** Индекс игрока, который ходил первым в этой взятке */
  leaderIndex: number;
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
}

export type GameMode = 'classical' | 'extended';
export type AIDifficulty = 'novice' | 'amateur' | 'expert';

export function createGame(
  _playerCount: 4,
  _mode: GameMode,
  humanPlayerName = 'Вы'
): GameState {
  const players: Player[] = [
    { id: 'human', name: humanPlayerName, hand: [], bid: undefined, tricksTaken: 0, score: 0 },
    { id: 'ai1', name: 'ИИ Север', hand: [], bid: undefined, tricksTaken: 0, score: 0 },
    { id: 'ai2', name: 'ИИ Запад', hand: [], bid: undefined, tricksTaken: 0, score: 0 },
    { id: 'ai3', name: 'ИИ Восток', hand: [], bid: undefined, tricksTaken: 0, score: 0 },
  ];

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
    bids: [null, null, null, null],
    dealNumber: 1,
    trumpCard: null,
    lastCompletedTrick: null,
  };
}

/** Карт в раздаче по номеру: вверх 1→9, плато 9×4, вниз 8→1, бескозырка 9×4, тёмная 9×4 */
export function getTricksInDeal(dealNumber: number): number {
  if (dealNumber <= 9) return dealNumber;
  if (dealNumber <= 12) return 9; // ещё 3 раза по 9 (каждый сдаёт)
  if (dealNumber <= 20) return 21 - dealNumber; // 8,7,6,5,4,3,2,1
  if (dealNumber <= 24) return 9; // бескозырка
  if (dealNumber <= 28) return 9; // тёмная
  return 1;
}

/** Тип раздачи по номеру */
export function getDealType(dealNumber: number): 'normal' | 'no-trump' | 'dark' {
  if (dealNumber <= 20) return 'normal';
  if (dealNumber <= 24) return 'no-trump';
  if (dealNumber <= 28) return 'dark';
  return 'normal';
}

export function startDeal(state: GameState): GameState {
  const dealType = getDealType(state.dealNumber);
  if (dealType === 'dark') return startDarkBidding(state);

  const tricksInDeal = getTricksInDeal(state.dealNumber);
  const deck = shuffleDeck(createDeck());
  const dealerIndex = state.dealerIndex % 4;
  const firstReceiver = nextPlayerLeft(dealerIndex);
  const hands = dealCards(deck, 4, tricksInDeal, firstReceiver);

  const cardsDealt = tricksInDeal * 4;
  const trumpCard: Card | null =
    dealType === 'no-trump'
      ? null
      : cardsDealt < 36
        ? deck[cardsDealt]
        : deck[35];
  const trump = trumpCard ? trumpCard.suit : null;

  const players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
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
    bids: [null, null, null, null],
    lastCompletedTrick: null,
  };
}

/** Старт тёмной раздачи: заказ до раздачи, карт ещё нет */
export function startDarkBidding(state: GameState): GameState {
  const dealerIndex = state.dealerIndex % 4;
  const firstBidder = nextPlayerLeft(dealerIndex);
  const tricksInDeal = 9;

  return {
    ...state,
    phase: 'dark-bidding',
    players: state.players.map(p => ({ ...p, hand: [], bid: undefined, tricksTaken: 0 })),
    dealerIndex,
    currentPlayerIndex: firstBidder,
    trump: null,
    trumpCard: null,
    tricksInDeal,
    currentTrick: [],
    trickLeaderIndex: firstBidder,
    bids: [null, null, null, null],
    lastCompletedTrick: null,
  };
}

/** После заказа в тёмную — раздача и переход к игре */
export function completeDarkDeal(state: GameState): GameState {
  const deck = shuffleDeck(createDeck());
  const dealerIndex = state.dealerIndex % 4;
  const firstReceiver = nextPlayerLeft(dealerIndex);
  const hands = dealCards(deck, 4, 9, firstReceiver);

  const trumpCard: Card = deck[35]; // вся колода роздана — козырь последняя у сдающего
  const trump = trumpCard.suit;

  const players = state.players.map((p, i) => ({
    ...p,
    hand: hands[i],
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
  };
}

/** Следующая раздача в партии. Возвращает null, если партия завершена (28 раздач). */
export function startNextDeal(state: GameState): GameState | null {
  if (state.dealNumber >= 28) return null;
  const nextDealerIndex = nextPlayerLeft(state.dealerIndex);
  const nextDealNumber = state.dealNumber + 1;
  const prepared = { ...state, dealNumber: nextDealNumber, dealerIndex: nextDealerIndex };
  return startDeal(prepared);
}

export function placeBid(
  state: GameState,
  playerIndex: number,
  bid: number
): GameState {
  const newBids = [...state.bids];
  newBids[playerIndex] = bid;

  const players = state.players.map((p, i) =>
    i === playerIndex ? { ...p, bid } : p
  );

  const nextPlayer = nextPlayerLeft(playerIndex);
  const allBid = newBids.every(b => b !== null);

  if (!allBid) {
    return {
      ...state,
      bids: newBids,
      players,
      currentPlayerIndex: nextPlayer,
    };
  }

  // Все заказали — проверяем ответственность сдающего
  const bids = newBids as number[];
  if (!isValidBidSum(bids, state.tricksInDeal)) {
    // Сдающий должен изменить заказ
    const resetBids: (number | null)[] = [...newBids];
    resetBids[state.dealerIndex] = null;
    return {
      ...state,
      bids: resetBids,
      players: players.map((p, i) =>
        i === state.dealerIndex ? { ...p, bid: undefined } : p
      ),
      currentPlayerIndex: state.dealerIndex,
      phase: state.phase,
    };
  }

  // Тёмная: раздача и переход к розыгрышу
  if (state.phase === 'dark-bidding') {
    return completeDarkDeal({ ...state, bids: newBids, players });
  }

  // Обычный переход к розыгрышу
  return {
    ...state,
    bids: newBids,
    players,
    currentPlayerIndex: state.trickLeaderIndex,
    phase: 'playing',
    currentTrick: [],
  };
}

export function playCard(
  state: GameState,
  playerIndex: number,
  card: Card
): GameState {
  const { players, currentTrick, trump, trickLeaderIndex } = state;
  const leadSuit = currentTrick.length > 0 ? currentTrick[0].suit : null;

  if (!isValidPlay(card, players[playerIndex].hand, leadSuit, trump ?? undefined)) {
    return state;
  }

  const newHand = players[playerIndex].hand.filter(
    c => !(c.suit === card.suit && c.rank === card.rank)
  );
  const newTrick = [...currentTrick, card];

  const newPlayers = players.map((p, i) =>
    i === playerIndex ? { ...p, hand: newHand } : p
  );

  const nextPlayer = nextPlayerLeft(playerIndex);
  const trickComplete = newTrick.length === 4;

  if (!trickComplete) {
    return {
      ...state,
      players: newPlayers,
      currentTrick: newTrick,
      currentPlayerIndex: nextPlayer,
    };
  }

  // Взятка завершена
  const winnerOffset = getTrickWinner(newTrick, newTrick[0].suit, trump ?? undefined);
  const trickWinner = playerAtLeftFrom(trickLeaderIndex, winnerOffset);

  const updatedPlayers = newPlayers.map((p, i) =>
    i === trickWinner
      ? { ...p, tricksTaken: p.tricksTaken + 1 }
      : p
  );

  const allPlayed = updatedPlayers.every(p => p.hand.length === 0);

  if (allPlayed) {
    // Раздача завершена — подсчёт очков
    const bids = state.bids as number[];
    const finalPlayers = updatedPlayers.map((p, i) => ({
      ...p,
      score: p.score + calculateDealPoints(bids[i], p.tricksTaken),
    }));

    return {
      ...state,
      players: finalPlayers,
      currentTrick: [],
      currentPlayerIndex: trickWinner,
      phase: 'deal-complete',
      lastCompletedTrick: { cards: newTrick, winnerIndex: trickWinner, leaderIndex: trickLeaderIndex },
    };
  }

  return {
    ...state,
    players: updatedPlayers,
    currentTrick: [],
    trickLeaderIndex: trickWinner,
    currentPlayerIndex: trickWinner,
    lastCompletedTrick: { cards: newTrick, winnerIndex: trickWinner, leaderIndex: trickLeaderIndex },
  };
}

export function getValidPlays(state: GameState, playerIndex: number): Card[] {
  const { players, currentTrick, trump } = state;
  const hand = players[playerIndex].hand;
  const leadSuit = currentTrick.length > 0 ? currentTrick[0].suit : null;
  return hand.filter(c => isValidPlay(c, hand, leadSuit, trump ?? undefined));
}

export function isHumanPlayer(state: GameState, index: number): boolean {
  return state.players[index].id === 'human';
}
