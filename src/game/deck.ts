/**
 * Колода карт (36 карт)
 */

import type { Card, Rank, Suit } from './types';

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];
export const RANKS: Rank[] = ['6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

/** Создаёт полную колоду из 36 карт */
export function createDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank });
    }
  }
  return deck;
}

/** Перемешивает колоду (Fisher-Yates) */
export function shuffleDeck(deck: Card[]): Card[] {
  const result = [...deck];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/** Порядок «следующий игрок слева»: 0→2→1→3→0 (Юг→Запад→Север→Восток) */
const NEXT_LEFT = [2, 3, 1, 0];

/**
 * Раздаёт карты игрокам по часовой (слева от сдающего).
 * @param firstReceiver — кому идёт первая карта (игрок слева от сдающего)
 */
export function dealCards(
  deck: Card[],
  playerCount: number,
  cardsPerPlayer: number,
  firstReceiver = 0
): Card[][] {
  const hands: Card[][] = Array.from({ length: playerCount }, () => []);
  const total = cardsPerPlayer * playerCount;
  let receiver = firstReceiver;
  for (let i = 0; i < total; i++) {
    hands[receiver].push(deck[i]);
    receiver = NEXT_LEFT[receiver];
  }
  return hands;
}
