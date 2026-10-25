/**
 * Подтянуть облачную историю матчей в прогресс / зал рекордов / локальный архив.
 * Локальный IndexedDB часто беднее облака (другой телефон, старые сессии без dealHistory).
 */

import type { MatchDetail, MatchHistoryItem } from '../lib/onlineGameSupabase';
import { getMatchDetail } from '../lib/onlineGameSupabase';
import {
  appendPartyArchiveRecord,
  buildPartyArchiveRecord,
  getPartyArchive,
  type PartyArchiveRecord,
} from './partyArchive';
import {
  PARTY_SCORE_TIERS,
  partyScoreTierFor,
  type MatchHighlightSource,
} from './matchHighlights';
import {
  FEED_PARTY_SCORE_MIN,
  loadPlayerRecords,
  savePlayerRecords,
  type PlayerRecordsStore,
  type RecordFeedItem,
} from './playerRecords';
import {
  buildPlayerProgressBundle,
  type ChannelSkillSummary,
  type PlayerProgressBundle,
} from './playerProgressStats';
import { getPlayerProfile } from './persistence';

const CLOUD_SEEN_PREFIX = 'cloud:';
const HYDRATE_MAX = 12;

function cloudSource(row: Pick<MatchHistoryItem, 'is_offline'>): MatchHighlightSource {
  return row.is_offline ? 'offline' : 'online';
}

function channelFromCloud(rows: readonly MatchHistoryItem[]): ChannelSkillSummary {
  let matches = 0;
  let wins = 0;
  let placeSum = 0;
  let placeN = 0;
  for (const r of rows) {
    if (r.interrupted) continue;
    matches += 1;
    if (r.place === 1) wins += 1;
    if (typeof r.place === 'number' && r.place >= 1) {
      placeSum += r.place;
      placeN += 1;
    }
  }
  return {
    matches,
    wins,
    winRate: matches > 0 ? Math.round((wins / matches) * 100) : null,
    avgPlace: placeN > 0 ? Math.round((placeSum / placeN) * 10) / 10 : null,
    dealTotal: 0,
    exact: 0,
    under: 0,
    over: 0,
    accuracyPct: null,
  };
}

function mergeChannel(local: ChannelSkillSummary, cloud: ChannelSkillSummary): ChannelSkillSummary {
  const matches = Math.max(local.matches, cloud.matches);
  const wins = Math.max(local.wins, cloud.wins);
  const avgPlace =
    local.avgPlace != null && cloud.avgPlace != null
      ? Math.round(((local.avgPlace + cloud.avgPlace) / 2) * 10) / 10
      : (local.avgPlace ?? cloud.avgPlace);
  return {
    matches,
    wins,
    winRate: matches > 0 ? Math.round((wins / matches) * 100) : null,
    avgPlace,
    dealTotal: local.dealTotal,
    exact: local.exact,
    under: local.under,
    over: local.over,
    accuracyPct: local.accuracyPct,
  };
}

/** Сводка каналов/дашборда: локальный архив + облачные place/score. */
export function mergeCloudHistoryIntoProgress(
  localArchive: readonly PartyArchiveRecord[],
  cloud: readonly MatchHistoryItem[],
): PlayerProgressBundle {
  const base = buildPlayerProgressBundle(localArchive);
  if (!cloud.length) return base;

  const onlineCloud = cloud.filter((r) => !r.is_offline && !r.interrupted);
  const offlineCloud = cloud.filter((r) => r.is_offline && !r.interrupted);
  const allCloud = cloud.filter((r) => !r.interrupted);

  const localCloudIds = new Set(
    localArchive.map((r) => r.cloudMatchId).filter((id): id is string => !!id),
  );

  const seriesExtra = allCloud
    .filter((r) => !localCloudIds.has(r.id) && typeof r.place === 'number' && r.place >= 1)
    .map((r) => ({
      finishedAt: r.finished_at,
      source: cloudSource(r),
      accuracyPct: null as number | null,
      place: r.place as number,
      gameId: 0,
    }));

  const mergedSeries = [...base.recentSeries, ...seriesExtra]
    .sort((a, b) => Date.parse(a.finishedAt) - Date.parse(b.finishedAt))
    .slice(-16);

  const cloudBest = allCloud
    .filter((r) => typeof r.final_score === 'number')
    .map((r) => ({
      score: r.final_score as number,
      finishedAt: r.finished_at,
      source: cloudSource(r),
      archiveId: `cloud:${r.id}`,
    }))
    .sort((a, b) => b.score - a.score);

  const bestPartyScores = [...base.records.bestPartyScores, ...cloudBest]
    .sort((a, b) => b.score - a.score)
    .filter((row, i, arr) => arr.findIndex((x) => x.archiveId === row.archiveId) === i)
    .slice(0, 8);

  const scoreTierCounts = { ...base.records.scoreTierCounts };
  for (const r of allCloud) {
    if (localCloudIds.has(r.id)) continue;
    if (typeof r.final_score !== 'number') continue;
    const tier = partyScoreTierFor(r.final_score);
    if (!tier) continue;
    scoreTierCounts[tier] = (scoreTierCounts[tier] ?? 0) + 1;
  }

  return {
    ...base,
    offline: mergeChannel(base.offline, channelFromCloud(offlineCloud)),
    online: mergeChannel(base.online, channelFromCloud(onlineCloud)),
    all: mergeChannel(base.all, channelFromCloud(allCloud)),
    recentSeries: mergedSeries,
    records: {
      ...base.records,
      bestPartyScores,
      scoreTierCounts,
    },
  };
}

/** Зал рекордов: best score / тиры / лента из облачных итогов. */
export function enrichRecordsFromCloudHistory(
  cloud: readonly MatchHistoryItem[],
  profileId?: string,
  opts?: { skipCloudIds?: ReadonlySet<string> },
): PlayerRecordsStore {
  const pid = profileId ?? getPlayerProfile().profileId ?? '';
  let store = loadPlayerRecords(pid);
  if (!cloud.length) return store;

  const seen = new Set(store.backfillSeen);
  const skip = opts?.skipCloudIds ?? new Set<string>();
  let next: PlayerRecordsStore = {
    ...store,
    scoreTierCounts: { ...store.scoreTierCounts },
    feed: [...store.feed],
    backfillSeen: [...store.backfillSeen],
  };
  let changed = false;

  for (const row of cloud) {
    if (row.interrupted) continue;
    if (skip.has(row.id)) continue;
    const ref = `${CLOUD_SEEN_PREFIX}${row.id}`;
    if (seen.has(ref)) continue;
    if (typeof row.final_score !== 'number') continue;
    seen.add(ref);
    changed = true;

    const score = row.final_score;
    const source = cloudSource(row);
    if (score > next.bestPartyScore) {
      next.bestPartyScore = score;
      next.bestPartyScoreSource = source;
      next.bestPartyScoreAt = row.finished_at;
    }

    const tier = partyScoreTierFor(score);
    if (tier) {
      next.scoreTierCounts[tier] = (next.scoreTierCounts[tier] ?? 0) + 1;
      if (score >= FEED_PARTY_SCORE_MIN && tier !== 'mini') {
        const labelKey =
          PARTY_SCORE_TIERS.find((t) => t.id === tier)?.labelKey ?? 'scoreTierSuccess';
        const item: RecordFeedItem = {
          kind: 'party_score',
          value: score,
          tier,
          labelKey,
          source,
          id: `${row.finished_at}-party_score-${score}-${row.id.slice(0, 8)}`,
          finishedAt: row.finished_at,
          matchRef: row.id,
        };
        next.feed = [item, ...next.feed].slice(0, 40);
      }
    }
  }

  if (!changed) return store;
  next = { ...next, backfillSeen: [...seen].slice(-800) };
  savePlayerRecords(next, pid);
  return next;
}

function detailToArchive(detail: MatchDetail, profileId: string): PartyArchiveRecord | null {
  const slots = [...detail.players].sort((a, b) => a.slot_index - b.slot_index);
  if (!slots.length) return null;
  const humanIndex =
    typeof detail.my_slot_index === 'number' ? detail.my_slot_index : slots[0]!.slot_index;
  const maxSlot = Math.max(...slots.map((p) => p.slot_index));
  const bySlot = new Map(slots.map((p) => [p.slot_index, p]));
  const seatPlayers: { name: string; score: number }[] = [];
  for (let i = 0; i <= maxSlot; i++) {
    const p = bySlot.get(i);
    seatPlayers.push({
      name: p?.display_name || `Игрок ${i + 1}`,
      score: p?.final_score ?? 0,
    });
  }
  return buildPartyArchiveRecord(
    {
      dealNumber: detail.deals_count ?? detail.deal_history.length,
      dealHistory: detail.deal_history,
      players: seatPlayers,
    },
    {
      gameId: 0,
      humanIndex,
      profileId,
      settlementMode: detail.settlement_mode ?? 'points_only',
      buyIn: detail.buy_in,
      source: detail.is_offline ? 'offline' : 'online',
      cloudMatchId: detail.id,
      seatNames: seatPlayers.map((p) => p.name),
      matchKey: `cloud:${detail.id}`,
    },
  );
}

/**
 * Докачать deal_history по облачным матчам, которых нет в IndexedDB.
 * Приоритет: высокий итог, затем свежие.
 */
export async function hydrateCloudMatchesIntoArchive(opts: {
  userId: string;
  cloud: readonly MatchHistoryItem[];
  profileId?: string;
  limit?: number;
}): Promise<number> {
  const pid = opts.profileId ?? getPlayerProfile().profileId ?? '';
  if (!pid || !opts.userId || !opts.cloud.length) return 0;

  const local = await getPartyArchive(pid, 1500);
  const have = new Set(local.map((r) => r.cloudMatchId).filter((id): id is string => !!id));
  const candidates = opts.cloud
    .filter((r) => !r.interrupted && !have.has(r.id))
    .slice()
    .sort((a, b) => {
      const sa = a.final_score ?? -9999;
      const sb = b.final_score ?? -9999;
      if (sb !== sa) return sb - sa;
      return Date.parse(b.finished_at) - Date.parse(a.finished_at);
    })
    .slice(0, opts.limit ?? HYDRATE_MAX);

  let imported = 0;
  for (const row of candidates) {
    try {
      const detail = await getMatchDetail(row.id, opts.userId);
      if (!detail) continue;
      const rec = detailToArchive(detail, pid);
      if (!rec) continue;
      /* Даже без deal_history — итог/место обогащают каналы. */
      await appendPartyArchiveRecord(rec);
      imported += 1;
    } catch {
      /* next */
    }
  }
  return imported;
}
