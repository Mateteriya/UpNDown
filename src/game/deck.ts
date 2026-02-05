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

/**
 * Раздаёт карты игрокам.
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
  for (let i = 0; i < total; i++) {
    hands[(firstReceiver + i) % playerCount].push(deck[i]);
  }
  return hands;
}
