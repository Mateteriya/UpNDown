/**
 * ИИ для Up&Down
 * Заказ: эвристика по силе козыря, длине козыря и «головам» в боковых мастях (без симуляции).
 * Ход: см. aiPlay — novice / amateur / expert; перебор заказа (taken > bid) при bid>0 толкает брать ещё взятки (очки = taken).
 * Персональный профиль заказа — в personalAi.
 */

import type { Card, Suit } from './types';
import { getValidPlays, absoluteTrickWinnerPlayerIndex } from './GameEngine';
import type { AIDifficulty, GameState } from './GameEngine';
import { suggestPersonalBid } from './personalAi';
import { getTrickWinner, cardBeatsOnTable } from './rules';

const RANK_ORDER: Record<string, number> = {
  '6': 0, '7': 1, '8': 2, '9': 3, '10': 4,
  'J': 5, 'Q': 6, 'K': 7, 'A': 8,
};

/** Ожидаемый вклад козырной карты во взятки (сумма по руке → округляем до заказа). Козырный туз — полная взятка. */
const TRUMP_TRICK_WEIGHT: Record<string, number> = {
  '6': 0.09,
  '7': 0.13,
  '8': 0.19,
  '9': 0.27,
  '10': 0.36,
  'J': 0.48,
  'Q': 0.62,
  'K': 0.78,
  'A': 1,
};

/** Вклад немозырной карты, если она «верхняя» в своей масти (с убыванием за 2-ю, 3-ю в масти). */
const OFFSUIT_TRICK_WEIGHT: Record<string, number> = {
  '6': 0.02,
  '7': 0.03,
  '8': 0.05,
  '9': 0.09,
  '10': 0.14,
  'J': 0.2,
  'Q': 0.3,
  'K': 0.42,
  'A': 0.52,
};

/** Бескозырка: старшие карты тянут больше веса. */
const NO_TRUMP_RANK_WEIGHT: Record<string, number> = {
  '6': 0.04,
  '7': 0.06,
  '8': 0.1,
  '9': 0.16,
  '10': 0.24,
  'J': 0.34,
  'Q': 0.46,
  'K': 0.58,
  'A': 0.72,
};

function cardStrength(card: Card, trump: Suit | null): number {
  let s = RANK_ORDER[card.rank];
  if (trump && card.suit === trump) s += 20;
  return s;
}

function sameCard(a: Card, b: Card): boolean {
  return a.suit === b.suit && a.rank === b.rank;
}

/** ascending=true — слабейшие первыми (дешёвый сброс / дешёвая победа) */
function sortByStrength(
  cards: Card[],
  trump: Suit | null,
  leadSuit: Suit | null,
  ascending: boolean
): Card[] {
  return [...cards].sort((a, b) => {
    const aStr = cardStrength(a, trump);
    const bStr = cardStrength(b, trump);
    if (aStr !== bStr) return ascending ? aStr - bStr : bStr - aStr;
    if (leadSuit && a.suit === leadSuit && b.suit !== leadSuit) return ascending ? -1 : 1;
    if (leadSuit && a.suit !== leadSuit && b.suit === leadSuit) return ascending ? 1 : -1;
    return 0;
  });
}

/**
 * Оценка числа взяток по составу руки (без симуляции раздачи).
 * Учитывает силу козырей, «головы» в боковых мастях с затуханием по 2–3-й карте, длину козыря (перекрытие).
 */
function estimateBidTricks(hand: Card[], trump: Suit | null, tricksInDeal: number, noTrumpDeal: boolean): number {
  if (hand.length === 0) {
    return Math.min(tricksInDeal, Math.max(0, Math.floor(tricksInDeal / 4)));
  }

  if (noTrumpDeal || !trump) {
    const bySuit = groupHandBySuit(hand);
    let sum = 0;
    const decay = [1, 0.58, 0.34, 0.2];
    for (const cards of bySuit.values()) {
      cards.sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
      for (let i = 0; i < cards.length && i < decay.length; i++) {
        sum += decay[i] * NO_TRUMP_RANK_WEIGHT[cards[i].rank];
      }
    }
    return roundBidExpectation(sum, tricksInDeal);
  }

  let expected = 0;
  const trumps = hand.filter((c) => c.suit === trump);
  const trumpN = trumps.length;
  for (const c of trumps) {
    expected += TRUMP_TRICK_WEIGHT[c.rank];
  }
  // Длинный козырь: чаще перебиваем чужие масти и тянем взятки
  if (trumpN >= 4) expected += 0.22 * (trumpN - 3);
  if (trumpN >= 6) expected += 0.35;
  if (trumpN >= 8) expected += 0.25;

  const bySuit = groupHandBySuit(hand);
  for (const [suit, cards] of bySuit.entries()) {
    if (suit === trump) continue;
    cards.sort((a, b) => RANK_ORDER[b.rank] - RANK_ORDER[a.rank]);
    const decay = [1, 0.52, 0.3];
    for (let i = 0; i < cards.length && i < decay.length; i++) {
      expected += decay[i] * OFFSUIT_TRICK_WEIGHT[cards[i].rank];
    }
  }

  return roundBidExpectation(expected, tricksInDeal);
}

function groupHandBySuit(hand: Card[]): Map<Suit, Card[]> {
  const m = new Map<Suit, Card[]>();
  for (const c of hand) {
    const arr = m.get(c.suit) ?? [];
    arr.push(c);
    m.set(c.suit, arr);
  }
  return m;
}

function roundBidExpectation(raw: number, tricksInDeal: number): number {
  return Math.max(0, Math.min(tricksInDeal, Math.round(raw + 0.12)));
}

/** Выбор заказа: эвристика по руке; при наличии profileId — учёт персонального профиля (обучение на стиле и успешности игрока). */
export function aiBid(state: GameState, playerIndex: number, profileId?: string | null): number {
  const personal = suggestPersonalBid(state, playerIndex, profileId ?? null);
  if (personal !== null) return personal;

  const { players, trump, tricksInDeal, bids, dealerIndex } = state;
  const hand = players[playerIndex].hand;

  const noTrumpDeal = trump === null && hand.length > 0;
  const preferred = estimateBidTricks(hand, trump, tricksInDeal, noTrumpDeal);

  if (playerIndex === dealerIndex) {
    const othersSum = bids
      .map((b, i) => (i !== dealerIndex && b !== null ? b : 0))
      .reduce((a, b) => a + b, 0);
    const forbidden = tricksInDeal - othersSum;
    if (forbidden >= 0 && forbidden <= tricksInDeal && preferred === forbidden) {
      const alt = forbidden === 0 ? 1 : forbidden === tricksInDeal ? tricksInDeal - 1 : forbidden - 1;
      return Math.max(0, Math.min(tricksInDeal, alt));
    }
  }
  return preferred;
}

/** Новичок: всегда минимальная по силе легальная карта (старое поведение). */
function aiPlayNovice(state: GameState, playerIndex: number): Card | null {
  const valid = getValidPlays(state, playerIndex);
  if (valid.length === 0) return null;
  const leadSuit = state.currentTrick.length > 0 ? state.currentTrick[0].suit : null;
  const trump = state.trump;
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

/**
 * Заход в взятку (expert): при запасе взяток до конца раздачи не тратит сразу самые сильные карты.
 */
function pickLeadCardExpert(
  valid: Card[],
  trump: Suit | null,
  tricksStillNeeded: number,
  chaseOvertrick: boolean,
  remainingTricks: number
): Card {
  const sortedDesc = sortByStrength(valid, trump, null, false);
  const top = sortedDesc[0]!;
  if (chaseOvertrick || tricksStillNeeded <= 0) return top;
  const slack = remainingTricks - tricksStillNeeded;
  if (slack <= 0) return top;
  const dropFromTop = Math.min(slack, Math.max(1, Math.floor(remainingTricks / 3)), 2);
  const idx = Math.min(dropFromTop, Math.max(0, sortedDesc.length - 1));
  return sortedDesc[idx] ?? top;
}

/**
 * Выбор карты: только среди допустимых (getValidPlays).
 * — До заказа: выигрывать минимально достаточной картой.
 * — Заказ 0 или ровно выполнен (взяток === заказ): сбрасывать, не забирать взятки.
 * — Уже перебор заказа: при bid>0 очки за раздачу = число взяток → выгодно брать ещё (chaseOvertrick).
 */
function aiPlaySmart(state: GameState, playerIndex: number, difficulty: AIDifficulty): Card | null {
  const valid = getValidPlays(state, playerIndex);
  if (valid.length === 0) return null;

  const trump = state.trump;
  const trick = state.currentTrick;
  const leadSuit: Suit | null = trick.length > 0 ? trick[0].suit : null;

  const bid = state.bids[playerIndex] ?? 0;
  const tricksTaken = state.players[playerIndex].tricksTaken;
  const tricksStillNeeded = bid === 0 ? 0 : Math.max(0, bid - tricksTaken);
  const chaseOvertrick = bid > 0 && tricksTaken > bid;
  const wantWinTricks = tricksStillNeeded > 0 || chaseOvertrick;
  const avoidTricks = bid === 0 || (bid > 0 && tricksTaken === bid);

  const remainingTricks = state.players[playerIndex].hand.length;

  const pick = (subset: Card[], ascending: boolean) =>
    sortByStrength(subset, trump, leadSuit, ascending)[0]!;

  if (trick.length === 0) {
    if (avoidTricks) return pick(valid, true);
    if (wantWinTricks) {
      if (difficulty === 'expert') {
        return pickLeadCardExpert(valid, trump, tricksStillNeeded, chaseOvertrick, remainingTricks);
      }
      return pick(valid, false);
    }
    return pick(valid, true);
  }

  const isLastInTrick = trick.length === 3;

  if (isLastInTrick) {
    const winning = valid.filter(
      (c) =>
        absoluteTrickWinnerPlayerIndex(state.trickLeaderIndex, [...trick, c], trump) === playerIndex
    );
    const losing = valid.filter((c) => !winning.some((w) => sameCard(w, c)));

    if (avoidTricks) {
      if (losing.length > 0) return pick(losing, true);
      return pick(winning.length > 0 ? winning : valid, true);
    }
    if (wantWinTricks) {
      if (winning.length > 0) return pick(winning, true);
      return pick(valid, true);
    }
    return pick(valid, true);
  }

  const bestIdx = getTrickWinner(trick, leadSuit!, trump ?? undefined);
  const bestOnTable = trick[bestIdx]!;
  const beating = valid.filter((c) => cardBeatsOnTable(c, bestOnTable, leadSuit!, trump));
  const notBeating = valid.filter((c) => !beating.some((b) => sameCard(b, c)));

  if (avoidTricks) {
    if (notBeating.length > 0) return pick(notBeating, true);
    return pick(valid, true);
  }
  if (wantWinTricks) {
    if (beating.length > 0) return pick(beating, true);
    return pick(valid, true);
  }
  return pick(valid, true);
}

/**
 * @param difficulty `novice` — старая эвристика; `amateur` | `expert` — заказ/перебор и темп захода.
 */
export function aiPlay(
  state: GameState,
  playerIndex: number,
  difficulty: AIDifficulty = 'amateur'
): Card | null {
  if (difficulty === 'novice') return aiPlayNovice(state, playerIndex);
  return aiPlaySmart(state, playerIndex, difficulty);
}
