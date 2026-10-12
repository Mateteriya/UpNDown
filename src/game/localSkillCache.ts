/**
 * Backfill skill-counters из IndexedDB-архива + удобный view для ЛК.
 * @see docs/METRICS-MAP-V1.md
 */

import { getPartyArchive } from './partyArchive';
import { getPartyHistory } from './partyHistory';
import { getPlayerProfile, getLocalRating, replaceLocalSkillCounters, type LocalRating } from './persistence';
import {
  LOCAL_SKILL_VERSION,
  applyDealOutcomesInOrder,
  avgPlaceFromCounters,
  classifyBidBias,
  classifyBidPlayStyle,
  dealOutcomesForPlayer,
  emptySkillCounters,
  skillPct,
  summarizeDealSkill,
  totalSkillDeals,
  type BidBias,
  type BidPlayStyle,
  type SkillCounters,
} from './playerSkillStats';

export type LocalSkillView = {
  rating: LocalRating;
  /** Точность по раздачам: exact / deals (главная цифра) */
  accuracyPct: number | null;
  /** Средняя точность партий (если копилась отдельно) */
  partyAccuracyPct: number | null;
  exactPct: number | null;
  underPct: number | null;
  overPct: number | null;
  avgPlace: number | null;
  dealTotal: number;
  bestExactStreak: number;
  currentExactStreak: number;
  /** Для KPI: max(gamesPlayed, placeCount) */
  matchesShown: number;
  winsShown: number;
  winRateShown: number | null;
  style: BidPlayStyle;
  bias: BidBias;
};

const backfillInflight = new Map<string, Promise<LocalRating>>();

function skillCountersFromRating(r: LocalRating): SkillCounters {
  return {
    exactDeals: r.exactDeals,
    underDeals: r.underDeals,
    overDeals: r.overDeals,
    placeSum: r.placeSum,
    placeCount: r.placeCount,
    bestExactStreak: r.bestExactStreak,
    currentExactStreak: r.currentExactStreak,
  };
}

function needsSkillBackfill(r: LocalRating): boolean {
  return r.skillVersion < LOCAL_SKILL_VERSION;
}

function resolveProfileId(profileId?: string): string {
  return profileId ?? getPlayerProfile().profileId ?? '';
}

/** Просканировать архив и записать skill-counters (если версия устарела или счётчики пусты при наличии раздач). */
export async function ensureLocalSkillBackfill(profileId?: string): Promise<LocalRating> {
  const pid = resolveProfileId(profileId);
  const rating = getLocalRating(pid || undefined);

  const key = pid || '__legacy__';
  const existing = backfillInflight.get(key);
  if (existing) return existing;

  const work = (async () => {
    try {
      const archive = await getPartyArchive(pid || undefined, 1500);
      const countersEmpty = totalSkillDeals(rating) === 0 && rating.placeCount === 0;
      /* Пустые счётчики при непустом архиве — пересобрать (часто на втором устройстве/после бага версии). */
      if (!needsSkillBackfill(rating) && !(countersEmpty && archive.length > 0)) {
        return rating;
      }

      const chronological = [...archive].sort(
        (a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt),
      );

      let counters = emptySkillCounters();
      let hadDealData = false;
      let wins = 0;
      let accSum = 0;
      let accCount = 0;

      for (const row of chronological) {
        const humanIndex = typeof row.humanIndex === 'number' ? row.humanIndex : 0;
        const outcomes = dealOutcomesForPlayer(row.dealHistory, humanIndex);
        if (outcomes.length > 0) hadDealData = true;
        counters = applyDealOutcomesInOrder(counters, outcomes, row.humanPlace);
        if (row.humanWon) wins++;
        const matchSkill = summarizeDealSkill(row.dealHistory, humanIndex);
        if (matchSkill.deals > 0) {
          accSum += matchSkill.accuracyPct;
          accCount++;
        }
      }

      if (!hadDealData && counters.placeCount === 0) {
        const summaries = getPartyHistory(pid || undefined, 1500);
        const chronoSum = [...summaries].sort(
          (a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt),
        );
        for (const row of chronoSum) {
          counters = applyDealOutcomesInOrder(counters, [], row.humanPlace);
          if (row.humanWon) wins++;
        }
      }

      const rebuiltTotal = totalSkillDeals(counters) + counters.placeCount;
      const keepIncremental = rebuiltTotal === 0 && totalSkillDeals(rating) + rating.placeCount > 0;
      const finalCounters = keepIncremental ? skillCountersFromRating(rating) : counters;
      const basics =
        rating.gamesPlayed === 0 && finalCounters.placeCount > 0
          ? {
              gamesPlayed: finalCounters.placeCount,
              wins: Math.min(wins, finalCounters.placeCount),
              bidAccuracySum: accSum,
              bidAccuracyCount: accCount,
            }
          : undefined;

      replaceLocalSkillCounters(finalCounters, LOCAL_SKILL_VERSION, pid || undefined, basics);
      return getLocalRating(pid || undefined);
    } catch {
      return getLocalRating(pid || undefined);
    } finally {
      backfillInflight.delete(key);
    }
  })();

  backfillInflight.set(key, work);
  return work;
}

export function toLocalSkillView(rating: LocalRating): LocalSkillView {
  const dealTotal = totalSkillDeals(rating);
  const exactPct = skillPct(rating.exactDeals, dealTotal);
  const underPct = skillPct(rating.underDeals, dealTotal);
  const overPct = skillPct(rating.overDeals, dealTotal);
  const dealAccuracy = dealTotal > 0 ? exactPct : null;
  const partyAccuracy =
    rating.bidAccuracyCount > 0
      ? Math.round(rating.bidAccuracySum / rating.bidAccuracyCount)
      : null;
  const matchesShown = Math.max(rating.gamesPlayed, rating.placeCount);
  const winsShown = Math.min(rating.wins, matchesShown || rating.wins);
  const winRateShown = matchesShown > 0 ? Math.round((winsShown / matchesShown) * 100) : null;

  return {
    rating,
    accuracyPct: dealAccuracy ?? partyAccuracy,
    partyAccuracyPct: partyAccuracy,
    exactPct,
    underPct,
    overPct,
    avgPlace: avgPlaceFromCounters(rating),
    dealTotal,
    bestExactStreak: rating.bestExactStreak,
    currentExactStreak: rating.currentExactStreak,
    matchesShown,
    winsShown,
    winRateShown,
    style: classifyBidPlayStyle(exactPct, underPct, overPct, dealTotal),
    bias: classifyBidBias(underPct, overPct, dealTotal),
  };
}

export async function loadLocalSkillView(profileId?: string): Promise<LocalSkillView> {
  const rating = await ensureLocalSkillBackfill(profileId);
  return toLocalSkillView(rating);
}

/** Синхронный снимок без ожидания backfill (для post-game). */
export function peekLocalSkillView(profileId?: string): LocalSkillView {
  return toLocalSkillView(getLocalRating(profileId));
}
