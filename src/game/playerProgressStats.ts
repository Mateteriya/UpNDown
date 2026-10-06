/**
 * Прогресс: офлайн/онлайн, тренды, лучшие/худшие раздачи из архива.
 * @see docs/METRICS-MAP-V1.md
 */

import type { PartyArchiveRecord } from './partyArchive';
import {
  resolveTakenForPlayer,
  skillPct,
  summarizeDealSkill,
} from './playerSkillStats';

export type ChannelKind = 'offline' | 'online' | 'all';

export interface ChannelSkillSummary {
  matches: number;
  wins: number;
  winRate: number | null;
  avgPlace: number | null;
  dealTotal: number;
  exact: number;
  under: number;
  over: number;
  accuracyPct: number | null;
}

export interface TrendDelta {
  /** Разница accuracy п.п. (recent − previous); + = лучше */
  accuracyDelta: number | null;
  /** Разница среднего места (recent − previous); − = лучше */
  placeDelta: number | null;
  recentMatches: number;
  previousMatches: number;
  recentAccuracy: number | null;
  previousAccuracy: number | null;
  recentAvgPlace: number | null;
  previousAvgPlace: number | null;
}

export interface HighlightDeal {
  archiveId: string;
  finishedAt: string;
  source: 'offline' | 'online';
  dealNumber: number;
  bid: number;
  taken: number;
  points: number;
  gameId: number;
  kind: 'best' | 'worst';
}

export interface MatchAccuracyPoint {
  finishedAt: string;
  source: 'offline' | 'online';
  /** null — в архиве нет раздач с заказами (есть только место/итог). */
  accuracyPct: number | null;
  place: number;
  gameId: number;
}

export interface PlayerProgressBundle {
  offline: ChannelSkillSummary;
  online: ChannelSkillSummary;
  all: ChannelSkillSummary;
  trend: TrendDelta;
  /** Последние партии (новые справа), для спарклайна */
  recentSeries: MatchAccuracyPoint[];
  bestDeals: HighlightDeal[];
  worstDeals: HighlightDeal[];
}

function emptyChannel(): ChannelSkillSummary {
  return {
    matches: 0,
    wins: 0,
    winRate: null,
    avgPlace: null,
    dealTotal: 0,
    exact: 0,
    under: 0,
    over: 0,
    accuracyPct: null,
  };
}

type Acc = {
  matches: number;
  wins: number;
  placeSum: number;
  dealTotal: number;
  exact: number;
  under: number;
  over: number;
};

function newAcc(): Acc {
  return { matches: 0, wins: 0, placeSum: 0, dealTotal: 0, exact: 0, under: 0, over: 0 };
}

function addMatch(acc: Acc, row: PartyArchiveRecord): void {
  const humanIndex = typeof row.humanIndex === 'number' ? row.humanIndex : 0;
  acc.matches++;
  if (row.humanWon) acc.wins++;
  if (typeof row.humanPlace === 'number' && row.humanPlace >= 1) {
    acc.placeSum += row.humanPlace;
  }
  const skill = summarizeDealSkill(row.dealHistory, humanIndex);
  acc.dealTotal += skill.deals;
  acc.exact += skill.exact;
  acc.under += skill.under;
  acc.over += skill.over;
}

function channelFromRows(rows: PartyArchiveRecord[]): ChannelSkillSummary {
  const acc = newAcc();
  for (const row of rows) addMatch(acc, row);
  return {
    matches: acc.matches,
    wins: acc.wins,
    winRate: acc.matches > 0 ? Math.round((acc.wins / acc.matches) * 100) : null,
    avgPlace: acc.matches > 0 ? Math.round((acc.placeSum / acc.matches) * 10) / 10 : null,
    dealTotal: acc.dealTotal,
    exact: acc.exact,
    under: acc.under,
    over: acc.over,
    accuracyPct: skillPct(acc.exact, acc.dealTotal),
  };
}

function matchAccuracy(row: PartyArchiveRecord): number | null {
  const humanIndex = typeof row.humanIndex === 'number' ? row.humanIndex : 0;
  const skill = summarizeDealSkill(row.dealHistory, humanIndex);
  return skill.deals > 0 ? skill.accuracyPct : null;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

function buildTrend(chrono: PartyArchiveRecord[]): TrendDelta {
  const withSkill = chrono.filter((r) => (matchAccuracy(r) ?? -1) >= 0);
  const window = Math.min(5, Math.max(2, Math.floor(withSkill.length / 2) || 2));
  const recent = withSkill.slice(-window);
  const previous = withSkill.slice(-(window * 2), -window);

  const recentAcc = recent.map((r) => matchAccuracy(r)!);
  const prevAcc = previous.map((r) => matchAccuracy(r)!);
  const recentPlaces = recent.map((r) => r.humanPlace).filter((p) => p >= 1);
  const prevPlaces = previous.map((r) => r.humanPlace).filter((p) => p >= 1);

  const recentAccuracy = recentAcc.length ? Math.round(avg(recentAcc)!) : null;
  const previousAccuracy = prevAcc.length ? Math.round(avg(prevAcc)!) : null;
  const recentAvgPlace = avg(recentPlaces);
  const previousAvgPlace = avg(prevPlaces);

  return {
    accuracyDelta:
      recentAccuracy != null && previousAccuracy != null ? recentAccuracy - previousAccuracy : null,
    placeDelta:
      recentAvgPlace != null && previousAvgPlace != null
        ? Math.round((recentAvgPlace - previousAvgPlace) * 10) / 10
        : null,
    recentMatches: recent.length,
    previousMatches: previous.length,
    recentAccuracy,
    previousAccuracy,
    recentAvgPlace,
    previousAvgPlace,
  };
}

function collectHighlights(
  rows: PartyArchiveRecord[],
  limit: number,
): { best: HighlightDeal[]; worst: HighlightDeal[] } {
  type Cand = HighlightDeal & { score: number };
  const bests: Cand[] = [];
  const worsts: Cand[] = [];

  for (const row of rows) {
    const humanIndex = typeof row.humanIndex === 'number' ? row.humanIndex : 0;
    for (const deal of row.dealHistory ?? []) {
      const bid = deal.bids[humanIndex];
      if (typeof bid !== 'number') continue;
      const taken = resolveTakenForPlayer(deal, humanIndex);
      if (taken == null) continue;
      const points = typeof deal.points[humanIndex] === 'number' ? deal.points[humanIndex]! : 0;
      const base = {
        archiveId: row.id,
        finishedAt: row.finishedAt,
        source: row.source,
        dealNumber: deal.dealNumber,
        bid,
        taken,
        points,
        gameId: row.gameId,
      };

      if (taken === bid) {
        // Лучшие: высокие очки + крупный заказ
        const score = points * 10 + bid;
        bests.push({ ...base, kind: 'best', score });
      } else {
        // Худшие: сильный промах и/или плохие очки
        const score = -points * 10 + Math.abs(taken - bid) * 3;
        worsts.push({ ...base, kind: 'worst', score });
      }
    }
  }

  bests.sort((a, b) => b.score - a.score);
  worsts.sort((a, b) => b.score - a.score);

  const strip = (c: Cand): HighlightDeal => {
    const { score: _s, ...rest } = c;
    void _s;
    return rest;
  };

  return {
    best: bests.slice(0, limit).map(strip),
    worst: worsts.slice(0, limit).map(strip),
  };
}

/** Собрать прогресс из архива (любой порядок; внутри сортируем). */
export function buildPlayerProgressBundle(
  archive: readonly PartyArchiveRecord[],
  opts?: { highlightLimit?: number; seriesLimit?: number },
): PlayerProgressBundle {
  const highlightLimit = opts?.highlightLimit ?? 3;
  const seriesLimit = opts?.seriesLimit ?? 12;
  const chrono = [...archive].sort(
    (a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt),
  );
  const offline = chrono.filter((r) => r.source === 'offline');
  const online = chrono.filter((r) => r.source === 'online');

  const highlights = collectHighlights(chrono, highlightLimit);
  const series: MatchAccuracyPoint[] = [];
  for (const row of chrono) {
    const acc = matchAccuracy(row);
    const place = typeof row.humanPlace === 'number' ? row.humanPlace : 0;
    /* Точность и/или место — иначе дашборд пустеет при облачных KPI без локальных раздач. */
    if (acc == null && place < 1) continue;
    series.push({
      finishedAt: row.finishedAt,
      source: row.source,
      accuracyPct: acc,
      place,
      gameId: row.gameId,
    });
  }

  return {
    offline: channelFromRows(offline),
    online: channelFromRows(online),
    all: channelFromRows(chrono),
    trend: buildTrend(chrono),
    recentSeries: series.slice(-seriesLimit),
    bestDeals: highlights.best,
    worstDeals: highlights.worst,
  };
}

export function emptyPlayerProgressBundle(): PlayerProgressBundle {
  return {
    offline: emptyChannel(),
    online: emptyChannel(),
    all: emptyChannel(),
    trend: {
      accuracyDelta: null,
      placeDelta: null,
      recentMatches: 0,
      previousMatches: 0,
      recentAccuracy: null,
      previousAccuracy: null,
      recentAvgPlace: null,
      previousAvgPlace: null,
    },
    recentSeries: [],
    bestDeals: [],
    worstDeals: [],
  };
}
