/**
 * Персональные skill-метрики заказов (точность / недобор / перебор / серии).
 * @see docs/METRICS-MAP-V1.md
 */

import type { DealResult } from './GameEngine';
import type { PartyHistoryRecord } from './partyHistory';
import { getTakenFromDealPoints } from './scoring';

/** 2 = skill + sync games/wins/accuracy из архива, если gamesPlayed был 0 */
export const LOCAL_SKILL_VERSION = 2;

export type BidPlayStyle = 'sniper' | 'hunter' | 'cautious' | 'chaotic' | 'balanced' | 'learning';

export type BidBias = 'exact' | 'under' | 'over' | 'mixed';

export interface DealSkillWorstMiss {
  dealNumber: number;
  bid: number;
  taken: number;
  /** |taken - bid| */
  deltaTricks: number;
  points: number;
}

export interface DealSkillSummary {
  deals: number;
  exact: number;
  under: number;
  over: number;
  accuracyPct: number;
  /** Лучшая серия точных внутри этой последовательности раздач */
  bestExactStreak: number;
  /** Серия точных в конце последовательности (для склейки между партиями) */
  endingExactStreak: number;
  worstMiss: DealSkillWorstMiss | null;
}

export interface PlaceStats {
  placeSum: number;
  placeCount: number;
  avgPlace: number | null;
}

export interface SkillCounters {
  exactDeals: number;
  underDeals: number;
  overDeals: number;
  placeSum: number;
  placeCount: number;
  bestExactStreak: number;
  currentExactStreak: number;
}

export function emptySkillCounters(): SkillCounters {
  return {
    exactDeals: 0,
    underDeals: 0,
    overDeals: 0,
    placeSum: 0,
    placeCount: 0,
    bestExactStreak: 0,
    currentExactStreak: 0,
  };
}

/** Взятки игрока в раздаче: takens, иначе вывод из очков. */
export function resolveTakenForPlayer(deal: DealResult, playerIndex: number): number | null {
  const bid = deal.bids[playerIndex];
  if (typeof bid !== 'number') return null;
  const explicit = deal.takens?.[playerIndex];
  if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
  const points = deal.points[playerIndex];
  if (typeof points !== 'number') return null;
  return getTakenFromDealPoints(bid, points);
}

export function summarizeDealSkill(
  dealHistory: readonly DealResult[] | undefined,
  playerIndex: number,
): DealSkillSummary {
  const empty: DealSkillSummary = {
    deals: 0,
    exact: 0,
    under: 0,
    over: 0,
    accuracyPct: 0,
    bestExactStreak: 0,
    endingExactStreak: 0,
    worstMiss: null,
  };
  if (!dealHistory?.length) return empty;

  let exact = 0;
  let under = 0;
  let over = 0;
  let streak = 0;
  let bestStreak = 0;
  let worstMiss: DealSkillWorstMiss | null = null;
  let scored = 0;

  for (const deal of dealHistory) {
    const bid = deal.bids[playerIndex];
    if (typeof bid !== 'number') continue;
    const taken = resolveTakenForPlayer(deal, playerIndex);
    if (taken == null) continue;
    scored++;
    const points = typeof deal.points[playerIndex] === 'number' ? deal.points[playerIndex]! : 0;

    if (taken === bid) {
      exact++;
      streak++;
      if (streak > bestStreak) bestStreak = streak;
    } else {
      streak = 0;
      if (taken < bid) under++;
      else over++;
      const deltaTricks = Math.abs(taken - bid);
      const miss: DealSkillWorstMiss = {
        dealNumber: deal.dealNumber,
        bid,
        taken,
        deltaTricks,
        points,
      };
      if (
        !worstMiss ||
        miss.deltaTricks > worstMiss.deltaTricks ||
        (miss.deltaTricks === worstMiss.deltaTricks && miss.points < worstMiss.points)
      ) {
        worstMiss = miss;
      }
    }
  }

  return {
    deals: scored,
    exact,
    under,
    over,
    accuracyPct: scored > 0 ? Math.round((exact / scored) * 100) : 0,
    bestExactStreak: bestStreak,
    endingExactStreak: streak,
    worstMiss,
  };
}

export function aggregatePlaceStats(
  rows: readonly Pick<PartyHistoryRecord, 'humanPlace'>[],
): PlaceStats {
  let placeSum = 0;
  let placeCount = 0;
  for (const r of rows) {
    if (typeof r.humanPlace === 'number' && r.humanPlace >= 1) {
      placeSum += r.humanPlace;
      placeCount++;
    }
  }
  return {
    placeSum,
    placeCount,
    avgPlace: placeCount > 0 ? Math.round((placeSum / placeCount) * 10) / 10 : null,
  };
}

/** Применить итог партии: раздачи в хронологическом порядке + место. */
export function applyMatchDealHistoryToSkillCounters(
  prev: SkillCounters,
  dealHistory: readonly DealResult[] | undefined,
  playerIndex: number,
  place?: number,
): SkillCounters {
  return applyDealOutcomesInOrder(prev, dealOutcomesForPlayer(dealHistory, playerIndex), place);
}

/** Точный пересчёт серий по упорядоченным исходам раздач. */
export function applyDealOutcomesInOrder(
  prev: SkillCounters,
  outcomes: readonly ('exact' | 'under' | 'over')[],
  place?: number,
): SkillCounters {
  let current = prev.currentExactStreak;
  let best = prev.bestExactStreak;
  let exact = prev.exactDeals;
  let under = prev.underDeals;
  let over = prev.overDeals;

  for (const o of outcomes) {
    if (o === 'exact') {
      exact++;
      current++;
      if (current > best) best = current;
    } else {
      current = 0;
      if (o === 'under') under++;
      else over++;
    }
  }

  const next: SkillCounters = {
    exactDeals: exact,
    underDeals: under,
    overDeals: over,
    placeSum: prev.placeSum,
    placeCount: prev.placeCount,
    bestExactStreak: best,
    currentExactStreak: current,
  };
  if (typeof place === 'number' && place >= 1) {
    next.placeSum += place;
    next.placeCount += 1;
  }
  return next;
}

export function dealOutcomesForPlayer(
  dealHistory: readonly DealResult[] | undefined,
  playerIndex: number,
): ('exact' | 'under' | 'over')[] {
  const out: ('exact' | 'under' | 'over')[] = [];
  if (!dealHistory?.length) return out;
  for (const deal of dealHistory) {
    const bid = deal.bids[playerIndex];
    if (typeof bid !== 'number') continue;
    const taken = resolveTakenForPlayer(deal, playerIndex);
    if (taken == null) continue;
    if (taken === bid) out.push('exact');
    else if (taken < bid) out.push('under');
    else out.push('over');
  }
  return out;
}

export function skillPct(part: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.round((part / total) * 100);
}

export function avgPlaceFromCounters(c: Pick<SkillCounters, 'placeSum' | 'placeCount'>): number | null {
  if (c.placeCount <= 0) return null;
  return Math.round((c.placeSum / c.placeCount) * 10) / 10;
}

export function totalSkillDeals(c: Pick<SkillCounters, 'exactDeals' | 'underDeals' | 'overDeals'>): number {
  return c.exactDeals + c.underDeals + c.overDeals;
}

/** Insight для post-game: сравнение с device avg или худшая раздача. */
export function buildMatchSkillInsight(
  match: DealSkillSummary,
  deviceAccuracyPct: number | null,
): { kind: 'vs_avg' | 'worst_miss' | 'perfect'; deltaVsAvg?: number; worstMiss?: DealSkillWorstMiss } {
  if (match.deals > 0 && match.exact === match.deals) {
    return { kind: 'perfect' };
  }
  if (deviceAccuracyPct != null && match.deals >= 3) {
    const delta = match.accuracyPct - deviceAccuracyPct;
    if (Math.abs(delta) >= 5) {
      return { kind: 'vs_avg', deltaVsAvg: delta };
    }
  }
  if (match.worstMiss) {
    return { kind: 'worst_miss', worstMiss: match.worstMiss };
  }
  return { kind: 'vs_avg', deltaVsAvg: 0 };
}

/** Характер заказа по долям exact/under/over. */
export function classifyBidPlayStyle(
  exactPct: number | null,
  underPct: number | null,
  overPct: number | null,
  dealTotal: number,
): BidPlayStyle {
  if (dealTotal < 12 || exactPct == null || underPct == null || overPct == null) return 'learning';
  // Сначала перекос стиля — даже при высокой точности «охотник» честнее «снайпера».
  if (overPct >= underPct + 10 && overPct >= 22) return 'hunter';
  if (underPct >= overPct + 10 && underPct >= 22) return 'cautious';
  if (exactPct >= 55) return 'sniper';
  if (exactPct < 40) return 'chaotic';
  return 'balanced';
}

export function classifyBidBias(
  underPct: number | null,
  overPct: number | null,
  dealTotal: number,
): BidBias {
  if (dealTotal < 8 || underPct == null || overPct == null) return 'mixed';
  if (overPct >= underPct + 8) return 'over';
  if (underPct >= overPct + 8) return 'under';
  if (underPct + overPct <= 35) return 'exact';
  return 'mixed';
}
