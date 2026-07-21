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

/**
 * Карт в «теле» колоды под козырем на столе (козырь и розданные игрокам не входят).
 * При tricksInDeal×playerCount = 36 колода пуста — козырь только у сдающего.
 */
export function getDeckCardsUnderTrump(tricksInDeal: number, playerCount = 4): number {
  const n = playerCount === 3 ? 3 : 4;
  const cardsDealt = tricksInDeal * n;
  return Math.max(0, 36 - cardsDealt - 1);
}

/** Визуальных слоёв-задников (1–8); 0 — колоды на столе нет. */
export function getDeckStackLayerCount(cardsUnderTrump: number): number {
  if (cardsUnderTrump <= 0) return 0;
  if (cardsUnderTrump === 1) return 1;
  return Math.max(1, Math.min(8, Math.round(1 + ((cardsUnderTrump - 1) * 7) / 34)));
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

/** 4 игрока: 0→2→1→3→0 (Юг→Запад→Север→Восток) */
const NEXT_LEFT_4 = [2, 3, 1, 0] as const;
/** 3 игрока: 0→2→1→0 (Юг→Запад→Север), Восток отсутствует */
const NEXT_LEFT_3 = [2, 0, 1] as const;

function nextLeftSeat(receiver: number, playerCount: number): number {
  if (playerCount === 3) return NEXT_LEFT_3[receiver % 3]!;
  return NEXT_LEFT_4[receiver % 4]!;
}

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
  const n = playerCount === 3 ? 3 : 4;
  const hands: Card[][] = Array.from({ length: n }, () => []);
  const total = cardsPerPlayer * n;
  let receiver = firstReceiver % n;
  for (let i = 0; i < total; i++) {
    hands[receiver]!.push(deck[i]!);
    receiver = nextLeftSeat(receiver, n);
  }
  return hands;
}
