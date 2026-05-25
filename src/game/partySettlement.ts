/**
 * Итог партии: фишки поверх очков раздач.
 * @see docs/PARTY-SETTLEMENT-PLAN.md
 */

import type { DealResult } from './GameEngine';

/** Режим итога партии (фишки). Рейтинг — по rawScore (очкам). */
export type SettlementMode = 'points_only' | 'vs_average' | 'accuracy_bonus' | 'prize_pool';

export const DEFAULT_SETTLEMENT_MODE: SettlementMode = 'accuracy_bonus';

export const SETTLEMENT_MODE_LABELS: Record<SettlementMode, string> = {
  points_only: 'Только очки',
  vs_average: 'Середина стола',
  accuracy_bonus: 'Точный заказ',
  prize_pool: 'Банк (турнир)',
};

/** Доли банка по местам (1-е, 2-е, …). Сумма = 1. */
export const PRIZE_POOL_SHARES: Record<3 | 4, number[]> = {
  3: [0.6, 0.3, 0.1],
  4: [0.5, 0.3, 0.15, 0.05],
};

export interface SettlementOptions {
  stake?: number;
  /** Взнос в банк (режим prize_pool). */
  buyIn?: number;
  /** Бонус за точную раздачу (режим accuracy_bonus). */
  accuracyBonus?: number;
}

export interface SettlementPlayerRow {
  playerIndex: number;
  rawScore: number;
  chips: number;
  /** Место по очкам (1 = больше всех). */
  place: number;
  inProfit: boolean;
  extra?: string;
}

export interface PartySettlementResult {
  mode: SettlementMode;
  modeLabel: string;
  rows: SettlementPlayerRow[];
  /** Индексы с максимальными фишками (★). */
  chipWinnerIndices: number[];
  /** Индексы с chips > 0. */
  inProfitIndices: number[];
  middleLine?: string;
  /** Для vs_average: должно быть 0. */
  sumChips?: number;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function rawScoresFromDealHistory(dealHistory: DealResult[], playerCount: number): number[] {
  const totals = new Array(playerCount).fill(0);
  for (const d of dealHistory) {
    for (let i = 0; i < playerCount; i++) totals[i] += d.points[i] ?? 0;
  }
  return totals;
}

function countExactDeals(dealHistory: DealResult[], playerIndex: number): number {
  let n = 0;
  for (const d of dealHistory) {
    const bid = d.bids[playerIndex];
    const taken = d.takens?.[playerIndex];
    if (taken !== undefined && bid === taken) n++;
  }
  return n;
}

function placesByRawScore(raw: number[]): number[] {
  const order = raw
    .map((score, index) => ({ index, score }))
    .sort((a, b) => b.score - a.score);
  const places = new Array(raw.length).fill(0);
  order.forEach((entry, rank) => {
    places[entry.index] = rank + 1;
  });
  return places;
}

function vsAverageChips(values: number[]): { chips: number[]; middleLine: string; sumChips: number } {
  const sum = values.reduce((a, b) => a + b, 0);
  const avg = sum / values.length;
  const chips = values.map((v) => round1(v - avg));
  return {
    chips,
    middleLine: `Середина стола: ${round1(avg)}`,
    sumChips: round1(chips.reduce((a, b) => a + b, 0)),
  };
}

function prizePoolChips(
  raw: number[],
  playerCount: 3 | 4,
  buyIn: number
): { chips: number[]; middleLine: string; extras: string[] } {
  const pool = buyIn * playerCount;
  const shares = PRIZE_POOL_SHARES[playerCount];
  const order = raw
    .map((points, index) => ({ index, points }))
    .sort((a, b) => b.points - a.points);
  const chips = new Array(raw.length).fill(0);
  order.forEach((entry, rank) => {
    const share = shares[rank] ?? 0;
    chips[entry.index] = round1(pool * share - buyIn);
  });
  return {
    chips,
    middleLine: `Банк: ${pool} (по ${buyIn} с человека)`,
    extras: raw.map(() => `взнос ${buyIn}`),
  };
}

export function computePartySettlement(
  dealHistory: DealResult[],
  playerCount: 3 | 4,
  mode: SettlementMode,
  opts?: SettlementOptions
): PartySettlementResult {
  const stake = opts?.stake ?? 1;
  const buyIn = opts?.buyIn ?? 100 * stake;
  const accuracyBonus = opts?.accuracyBonus ?? 10 * stake;

  const raw = rawScoresFromDealHistory(dealHistory, playerCount);
  const places = placesByRawScore(raw);

  let chips = raw.map((s) => round1(s * stake));
  let middleLine: string | undefined;
  let sumChips: number | undefined;
  const extras: (string | undefined)[] = new Array(playerCount).fill(undefined);

  if (mode === 'points_only') {
    middleLine = 'Фишки совпадают с очками партии.';
  } else if (mode === 'vs_average') {
    const avg = vsAverageChips(raw.map((v) => v * stake));
    chips = avg.chips;
    middleLine = avg.middleLine;
    sumChips = avg.sumChips;
  } else if (mode === 'accuracy_bonus') {
    const avg = vsAverageChips(raw.map((v) => v * stake));
    chips = avg.chips.map((c, i) => {
      const exact = countExactDeals(dealHistory, i);
      const bonus = exact * accuracyBonus;
      if (exact > 0) extras[i] = `+${bonus} за ${exact} точн.`;
      return round1(c + bonus);
    });
    middleLine = avg.middleLine;
    sumChips = round1(chips.reduce((a, b) => a + b, 0));
  } else if (mode === 'prize_pool') {
    const pool = prizePoolChips(raw, playerCount, buyIn);
    chips = pool.chips;
    middleLine = pool.middleLine;
    for (let i = 0; i < playerCount; i++) extras[i] = pool.extras[i];
    sumChips = round1(chips.reduce((a, b) => a + b, 0));
  }

  const rows: SettlementPlayerRow[] = raw.map((rawScore, playerIndex) => ({
    playerIndex,
    rawScore,
    chips: chips[playerIndex],
    place: places[playerIndex],
    inProfit: chips[playerIndex] > 0,
    extra: extras[playerIndex],
  }));

  const maxChip = Math.max(...chips);
  const chipWinnerIndices = rows.filter((r) => r.chips === maxChip).map((r) => r.playerIndex);
  const inProfitIndices = rows.filter((r) => r.inProfit).map((r) => r.playerIndex);

  return {
    mode,
    modeLabel: SETTLEMENT_MODE_LABELS[mode],
    rows,
    chipWinnerIndices,
    inProfitIndices,
    middleLine,
    sumChips,
  };
}

/** Преобразование DealResult[] + имён в формат демо (для ScoringDemoPage). */
export function dealHistoryToDemoParty(
  dealHistory: DealResult[],
  playerNames: string[]
): {
  players: string[];
  deals: {
    label: string;
    tricksInDeal: number;
    bids: number[];
    takens: number[];
    points: number[];
  }[];
} {
  return {
    players: playerNames,
    deals: dealHistory.map((d) => ({
      label: `Раздача ${d.dealNumber}`,
      tricksInDeal: Math.max(...(d.takens ?? d.bids)),
      bids: d.bids,
      takens: d.takens ?? d.bids.map((bid, i) => {
        const pts = d.points[i];
        if (bid === 0 && pts === 5) return 0;
        if (pts === 10 * bid) return bid;
        if (pts < 0) return bid + pts / 10;
        return pts;
      }),
      points: d.points,
    })),
  };
}

/** Маппинг режима демо → production (без weighted / current). */
export function demoVariantToSettlementMode(
  id: 'current' | 'vs_average' | 'weighted_deals' | 'accuracy_bonus' | 'prize_pool'
): SettlementMode {
  if (id === 'current') return 'points_only';
  if (id === 'weighted_deals') return 'vs_average';
  return id;
}
