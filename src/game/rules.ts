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
