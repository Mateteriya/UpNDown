/**
 * ИИ для Up&Down
 * Базовый уровень: Новичок
 */

import type { Card, Suit } from './types';
import { getValidPlays } from './GameEngine';
import type { GameState } from './GameEngine';

const RANK_ORDER: Record<string, number> = {
  '6': 0, '7': 1, '8': 2, '9': 3, '10': 4,
  'J': 5, 'Q': 6, 'K': 7, 'A': 8,
};

function cardStrength(card: Card, trump: Suit | null): number {
  let s = RANK_ORDER[card.rank];
  if (trump && card.suit === trump) s += 20;
  return s;
}

/** Выбор заказа: простая эвристика по количеству козырей и старших карт */
export function aiBid(state: GameState, playerIndex: number): number {
  const { players, trump, tricksInDeal, bids, dealerIndex } = state;
  const hand = players[playerIndex].hand;

  let preferred = Math.floor(tricksInDeal / 4);
  if (trump) {
    let count = 0;
    for (const card of hand) {
      if (card.suit === trump) count += 2;
      else if (RANK_ORDER[card.rank] >= 5) count += 1;
    }
    preferred = Math.min(tricksInDeal, Math.max(0, Math.floor(count / 3)));
  }

  // Ответственность сдающего: сумма заказов ≠ tricksInDeal
  if (playerIndex === dealerIndex) {
    const othersSum = bids
      .map((b, i) => (i !== dealerIndex && b !== null ? b : 0))
      .reduce((a, b) => a + b, 0);
    const forbidden = tricksInDeal - othersSum;
    if (forbidden >= 0 && forbidden <= tricksInDeal && preferred === forbidden) {
      // Выбираем ближайший допустимый заказ
      const alt = forbidden === 0 ? 1 : forbidden === tricksInDeal ? tricksInDeal - 1 : forbidden - 1;
      return Math.max(0, Math.min(tricksInDeal, alt));
    }
  }
  return preferred;
}

/** Выбор карты для хода: минимальная допустимая карта (новичок) */
export function aiPlay(state: GameState, playerIndex: number): Card | null {
  const valid = getValidPlays(state, playerIndex);
  if (valid.length === 0) return null;

  const leadSuit = state.currentTrick.length > 0 ? state.currentTrick[0].suit : null;
  const trump = state.trump;

  // Сортируем: сначала по силе (слабые вперед), при равной силе — масть хода
  valid.sort((a, b) => {
    const aStr = cardStrength(a, trump);
    const bStr = cardStrength(b, trump);
    if (aStr !== bStr) return aStr - bStr;
    if (leadSuit && a.suit === leadSuit && b.suit !== leadSuit) return -1;
    if (leadSuit && a.suit !== leadSuit && b.suit === leadSuit) return 1;
    return 0;
  });

  return valid[0];
}
