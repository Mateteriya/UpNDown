/**
 * Проверки правил Up&Down
 * @see TZ.md раздел 2.1
 */

import type { Card, Suit } from './types';

/** Порядок старшинства карт (от младшей к старшей) */
const RANK_ORDER: Record<string, number> = {
  '6': 0, '7': 1, '8': 2, '9': 3, '10': 4,
  'J': 5, 'Q': 6, 'K': 7, 'A': 8,
};

/**
 * Проверяет, допустима ли ответственность сдающего:
 * сумма заказов не должна равняться количеству взяток в раздаче
 */
export function isValidBidSum(bids: number[], tricksInDeal: number): boolean {
  const sum = bids.reduce((a, b) => a + b, 0);
  return sum !== tricksInDeal;
}

/**
 * Запрещённая цифра заказа для игрока, который торгует последним
 * (по правилам — сдающий): сумма чужих заказов + эта цифра = взяткам в раздаче.
 *
 * Не завязано на dealerIndex: в онлайне после rotate/JSON надёжнее смотреть,
 * что все остальные уже заказали (ход последнего).
 */
export function getForbiddenDealerBid(
  state: {
    tricksInDeal: number;
    bids: (number | null | undefined)[];
    players: { bid?: number | null }[];
  },
  playerIndex: number,
): number | null {
  const n = state.players.length === 3 ? 3 : state.players.length === 4 ? 4 : 0;
  if (n < 3) return null;
  let othersSum = 0;
  let othersCount = 0;
  for (let i = 0; i < n; i++) {
    if (i === playerIndex) continue;
    const raw = state.bids[i] ?? state.players[i]?.bid;
    if (raw === null || raw === undefined) return null;
    const b = Number(raw);
    if (!Number.isFinite(b)) return null;
    othersSum += b;
    othersCount += 1;
  }
  if (othersCount !== n - 1) return null;
  const forbidden = state.tricksInDeal - othersSum;
  if (forbidden < 0 || forbidden > state.tricksInDeal) return null;
  return forbidden;
}

/**
 * Определяет, кто выиграл взятку
 */
export function getTrickWinner(
  trick: Card[],
  leadSuit: Suit,
  trump?: Suit
): number {
  let winnerIdx = 0;
  let bestCard = trick[0];

  for (let i = 1; i < trick.length; i++) {
    const card = trick[i];
    if (beats(card, bestCard, leadSuit, trump)) {
      bestCard = card;
      winnerIdx = i;
    }
  }
  return winnerIdx;
}

/** Карта A бьёт карту B */
function beats(
  a: Card,
  b: Card,
  leadSuit: Suit,
  trump?: Suit
): boolean {
  const aIsTrump = trump ? a.suit === trump : false;
  const bIsTrump = trump ? b.suit === trump : false;

  if (aIsTrump && !bIsTrump) return true;
  if (!aIsTrump && bIsTrump) return false;
  if (aIsTrump && bIsTrump) {
    return RANK_ORDER[a.rank] > RANK_ORDER[b.rank];
  }
  if (a.suit === leadSuit && b.suit !== leadSuit) return true;
  if (a.suit !== leadSuit && b.suit === leadSuit) return false;
  if (a.suit === leadSuit && b.suit === leadSuit) {
    return RANK_ORDER[a.rank] > RANK_ORDER[b.rank];
  }
  return false;
}

/**
 * Бьёт ли карта `challenger` текущего лидера взятки `currentBest` при заданной масти захода (для эвристик ИИ).
 */
export function cardBeatsOnTable(
  challenger: Card,
  currentBest: Card,
  leadSuit: Suit,
  trump: Suit | null | undefined
): boolean {
  return beats(challenger, currentBest, leadSuit, trump ?? undefined);
}

/**
 * Проверяет, можно ли сыграть карту (выход в масть / козырь)
 */
export function isValidPlay(
  card: Card,
  hand: Card[],
  leadSuit: Suit | null,
  trump?: Suit
): boolean {
  if (!leadSuit) return true; // Первый ход — любая карта

  const hasLeadSuit = hand.some(c => c.suit === leadSuit);
  const hasTrump = trump ? hand.some(c => c.suit === trump) : false;

  if (card.suit === leadSuit) return true;
  if (hasLeadSuit && card.suit !== leadSuit) return false; // Обязательный выход в масть
  if (!hasLeadSuit && card.suit === trump) return true;    // Нет масти — обязательный козырь
  if (!hasLeadSuit && !hasTrump) return true;              // Можем сбросить
  if (!hasLeadSuit && hasTrump && card.suit !== trump) return false;

  return false;
}
