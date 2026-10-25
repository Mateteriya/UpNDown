/**
 * Личный «Зал рекордов»: personal bests + лента highlights.
 * @see docs/METRICS-MAP-V1.md
 */

import type { PartyArchiveRecord } from './partyArchive';
import { getPartyArchive } from './partyArchive';
import {
  BIG_EXACT_BID_MIN,
  detectMatchHighlights,
  partyScoreTierFor,
  type MatchHighlight,
  type MatchHighlightSource,
  type PartyScoreTierId,
} from './matchHighlights';
import { getPlayerProfile } from './persistence';
import { resolveTakenForPlayer } from './playerSkillStats';

const STORAGE_PREFIX = 'updown_records_';
const RECORDS_VERSION = 1;
const FEED_MAX = 40;
/** В «ленту моментов» — только итоги партии от этого порога (тир success+). */
export const FEED_PARTY_SCORE_MIN = 400;

/** Попадает ли highlight в ленту (итог партии — только 400+). */
export function isFeedWorthyHighlight(h: Pick<MatchHighlight, 'kind' | 'value' | 'tier'>): boolean {
  if (h.kind === 'party_score') {
    if (h.tier === 'mini') return false;
    return Number.isFinite(h.value) && h.value >= FEED_PARTY_SCORE_MIN;
  }
  return true;
}

export type RecordFeedItem = MatchHighlight & {
  id: string;
  finishedAt: string;
  matchRef?: string;
};

export type PlayerRecordsStore = {
  version: number;
  /** Макс. итог партии */
  bestPartyScore: number;
  bestPartyScoreSource: MatchHighlightSource | null;
  bestPartyScoreAt: string | null;
  /** Лучший exact bid (взято = заказ), ≥ BIG_EXACT_BID_MIN */
  bestExactBid: number;
  bestExactBidAt: string | null;
  /** Лучшая серия точных внутри одной партии */
  bestPartyExactStreak: number;
  perfectParties: number;
  exactDeal10Count: number;
  exactDealBigCount: number;
  /** Сколько партий достигли каждого тира (накопительно, по лучшему тиру партии) */
  scoreTierCounts: Partial<Record<PartyScoreTierId, number>>;
  feed: RecordFeedItem[];
  /** Ids архивных партий, уже учтённых в backfill */
  backfillSeen: string[];
  backfillDone: boolean;
};

function emptyStore(): PlayerRecordsStore {
  return {
    version: RECORDS_VERSION,
    bestPartyScore: 0,
    bestPartyScoreSource: null,
    bestPartyScoreAt: null,
    bestExactBid: 0,
    bestExactBidAt: null,
    bestPartyExactStreak: 0,
    perfectParties: 0,
    exactDeal10Count: 0,
    exactDealBigCount: 0,
    scoreTierCounts: {},
    feed: [],
    backfillSeen: [],
    backfillDone: false,
  };
}

function storageKey(profileId: string): string {
  return `${STORAGE_PREFIX}${profileId}`;
}

function parseStore(raw: string | null): PlayerRecordsStore {
  if (!raw) return emptyStore();
  try {
    const j = JSON.parse(raw) as Partial<PlayerRecordsStore>;
    if (!j || typeof j !== 'object') return emptyStore();
    const base = emptyStore();
    return {
      ...base,
      ...j,
      version: RECORDS_VERSION,
      scoreTierCounts: { ...base.scoreTierCounts, ...(j.scoreTierCounts ?? {}) },
      feed: Array.isArray(j.feed) ? j.feed.slice(0, FEED_MAX) : [],
      backfillSeen: Array.isArray(j.backfillSeen) ? j.backfillSeen : [],
      backfillDone: !!j.backfillDone,
    };
  } catch {
    return emptyStore();
  }
}

export function loadPlayerRecords(profileId?: string): PlayerRecordsStore {
  const pid = profileId ?? getPlayerProfile().profileId ?? '';
  if (!pid || typeof localStorage === 'undefined') return emptyStore();
  try {
    return parseStore(localStorage.getItem(storageKey(pid)));
  } catch {
    return emptyStore();
  }
}

export function savePlayerRecords(store: PlayerRecordsStore, profileId?: string): void {
  const pid = profileId ?? getPlayerProfile().profileId ?? '';
  if (!pid || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(storageKey(pid), JSON.stringify(store));
  } catch {
    /* quota */
  }
}

function bumpTierCount(store: PlayerRecordsStore, tier: PartyScoreTierId): void {
  store.scoreTierCounts[tier] = (store.scoreTierCounts[tier] ?? 0) + 1;
}

function applyHighlightsToStore(
  store: PlayerRecordsStore,
  highlights: readonly MatchHighlight[],
  meta: { finishedAt: string; matchRef?: string },
): PlayerRecordsStore {
  const next: PlayerRecordsStore = {
    ...store,
    scoreTierCounts: { ...store.scoreTierCounts },
    feed: [...store.feed],
    backfillSeen: [...store.backfillSeen],
  };

  for (const h of highlights) {
    if (h.kind === 'party_score' && h.tier) {
      if (h.value > next.bestPartyScore) {
        next.bestPartyScore = h.value;
        next.bestPartyScoreSource = h.source;
        next.bestPartyScoreAt = meta.finishedAt;
      }
      bumpTierCount(next, h.tier);
    }
    if (h.kind === 'exact_deal') {
      if (h.value > next.bestExactBid) {
        next.bestExactBid = h.value;
        next.bestExactBidAt = meta.finishedAt;
      }
      if (h.value >= 10) next.exactDeal10Count += 1;
      if (h.value >= BIG_EXACT_BID_MIN) next.exactDealBigCount += 1;
    }
    if (h.kind === 'exact_streak' && h.value > next.bestPartyExactStreak) {
      next.bestPartyExactStreak = h.value;
    }
    if (h.kind === 'perfect_party') {
      next.perfectParties += 1;
    }

    if (!isFeedWorthyHighlight(h)) continue;

    const item: RecordFeedItem = {
      ...h,
      id: `${meta.finishedAt}-${h.kind}-${h.value}-${h.dealNumber ?? 'x'}-${Math.random().toString(36).slice(2, 6)}`,
      finishedAt: meta.finishedAt,
      matchRef: meta.matchRef,
    };
    next.feed.unshift(item);
  }

  next.feed = next.feed.slice(0, FEED_MAX);
  return next;
}

export type IngestMatchRecordsInput = {
  dealHistory: PartyArchiveRecord['dealHistory'] | undefined;
  players: readonly { score: number }[];
  humanIndex: number;
  source: MatchHighlightSource;
  finishedAt?: string;
  matchRef?: string;
  profileId?: string;
};

/** Записать highlights финиша в personal records; вернуть список + store. */
export function ingestMatchRecords(input: IngestMatchRecordsInput): {
  highlights: MatchHighlight[];
  store: PlayerRecordsStore;
} {
  const highlights = detectMatchHighlights({
    dealHistory: input.dealHistory,
    players: input.players,
    humanIndex: input.humanIndex,
    source: input.source,
  });
  const pid = input.profileId ?? getPlayerProfile().profileId ?? '';
  let store = loadPlayerRecords(pid);
  if (highlights.length) {
    store = applyHighlightsToStore(store, highlights, {
      finishedAt: input.finishedAt ?? new Date().toISOString(),
      matchRef: input.matchRef,
    });
    savePlayerRecords(store, pid);
  }
  return { highlights, store };
}

/** Собрать scores по слотам стола из записи архива. */
export function seatScoresFromArchiveRow(row: PartyArchiveRecord): { score: number }[] {
  return Array.from({ length: row.playerCount }, (_, i) => {
    const p = row.players.find((x) => x.playerIndex === i);
    return { score: p?.score ?? (i === row.humanIndex ? row.humanScore : 0) };
  });
}

/** One-shot backfill из IndexedDB архива. */
export async function ensureRecordsBackfill(
  profileId?: string,
  opts?: { force?: boolean },
): Promise<PlayerRecordsStore> {
  const pid = profileId ?? getPlayerProfile().profileId ?? '';
  let store = loadPlayerRecords(pid);
  if (!pid) return store;
  if (store.backfillDone && !opts?.force) return store;
  if (opts?.force) {
    store = { ...store, backfillDone: false, backfillSeen: [] };
  }

  let archive: PartyArchiveRecord[] = [];
  try {
    archive = await getPartyArchive(pid);
  } catch {
    store = { ...store, backfillDone: true };
    savePlayerRecords(store, pid);
    return store;
  }

  const seen = new Set(store.backfillSeen);
  for (const row of archive) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    const hs = detectMatchHighlights({
      dealHistory: row.dealHistory,
      players: seatScoresFromArchiveRow(row),
      humanIndex: row.humanIndex,
      source: row.source,
    });
    store = applyHighlightsToStore(store, hs, {
      finishedAt: row.finishedAt,
      matchRef: row.id,
    });
  }

  store = {
    ...store,
    backfillSeen: [...seen].slice(-500),
    backfillDone: true,
  };
  savePlayerRecords(store, pid);
  return store;
}

/** Агрегаты для прогресс-бандла из archive (+ store). */
export type RecordsProgressExtras = {
  bestPartyScores: { score: number; finishedAt: string; source: MatchHighlightSource; archiveId: string }[];
  exactDeal10Count: number;
  exactDealBigCount: number;
  scoreTierCounts: Partial<Record<PartyScoreTierId, number>>;
  perfectParties: number;
};

export function collectRecordsFromArchive(rows: readonly PartyArchiveRecord[]): RecordsProgressExtras {
  const bestPartyScores: RecordsProgressExtras['bestPartyScores'] = [];
  let exactDeal10Count = 0;
  let exactDealBigCount = 0;
  let perfectParties = 0;
  const scoreTierCounts: Partial<Record<PartyScoreTierId, number>> = {};

  for (const row of rows) {
    bestPartyScores.push({
      score: row.humanScore,
      finishedAt: row.finishedAt,
      source: row.source,
      archiveId: row.id,
    });
    const tier = partyScoreTierFor(row.humanScore);
    if (tier) scoreTierCounts[tier] = (scoreTierCounts[tier] ?? 0) + 1;

    if (!row.dealHistory?.length) continue;
    let exactAll = true;
    let scored = 0;
    for (const deal of row.dealHistory) {
      const bid = deal.bids[row.humanIndex];
      if (typeof bid !== 'number') continue;
      const taken = resolveTakenForPlayer(deal, row.humanIndex);
      if (taken == null) continue;
      scored++;
      if (taken !== bid) exactAll = false;
      if (taken === bid && bid >= 10) exactDeal10Count++;
      if (taken === bid && bid >= BIG_EXACT_BID_MIN) exactDealBigCount++;
    }
    if (scored > 0 && exactAll) perfectParties++;
  }

  bestPartyScores.sort((a, b) => b.score - a.score);

  return {
    bestPartyScores: bestPartyScores.slice(0, 5),
    exactDeal10Count,
    exactDealBigCount,
    scoreTierCounts,
    perfectParties,
  };
}
