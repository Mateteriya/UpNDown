/**
 * Локальная история завершённых офлайн-партий (по profileId).
 * @see docs/PARTY-SETTLEMENT-PLAN.md фаза F
 */

import { computePartySettlement } from './partySettlement';
import type { DealResult } from './GameEngine';
import { getPlayerProfile } from './persistence';
import { readResultsChipView, type ResultsChipView } from './resultsChipView';

const PARTY_HISTORY_KEY_PREFIX = 'updown_party_history_';
/** Журнал последних партий на устройстве (не рейтинг). ~50 партий/день × 30 дней. */
export const PARTY_HISTORY_MAX_STORED = 1500;
/** Старше — удаляем при записи. */
export const PARTY_HISTORY_RETENTION_DAYS = 90;

export interface PartyHistoryPlayerRow {
  name: string;
  score: number;
  chips: number;
  place: number;
}

export interface PartyHistoryRecord {
  id: string;
  finishedAt: string;
  profileId: string;
  gameId: number;
  playerCount: number;
  settlementMode: ResultsChipView;
  humanIndex: number;
  humanWon: boolean;
  humanPlace: number;
  humanScore: number;
  humanChips: number;
  dealCount: number;
  players: PartyHistoryPlayerRow[];
}

function historyKey(profileId: string): string {
  return PARTY_HISTORY_KEY_PREFIX + profileId;
}

function parseList(raw: string | null): PartyHistoryRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPartyHistoryRecord);
  } catch {
    return [];
  }
}

function isPartyHistoryRecord(x: unknown): x is PartyHistoryRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as PartyHistoryRecord;
  return (
    typeof r.id === 'string' &&
    typeof r.finishedAt === 'string' &&
    typeof r.profileId === 'string' &&
    typeof r.gameId === 'number' &&
    typeof r.playerCount === 'number' &&
    (r.settlementMode === 'accuracy_bonus' || r.settlementMode === 'vs_average') &&
    typeof r.humanPlace === 'number' &&
    typeof r.humanScore === 'number' &&
    typeof r.humanChips === 'number' &&
    Array.isArray(r.players)
  );
}

export function getPartyHistory(profileId?: string, limit = 10): PartyHistoryRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    if (!pid) return [];
    const list = parseList(localStorage.getItem(historyKey(pid)));
    return list.slice(0, Math.max(1, Math.min(limit, PARTY_HISTORY_MAX_STORED)));
  } catch {
    return [];
  }
}

export function buildPartyHistoryRecord(
  snap: { dealNumber: number; dealHistory?: DealResult[]; players: { name: string; score: number }[] },
  opts: { gameId: number; humanIndex?: number; profileId?: string; settlementMode?: ResultsChipView },
): PartyHistoryRecord | null {
  const profileId = opts.profileId ?? getPlayerProfile().profileId ?? '';
  if (!profileId) return null;
  const dealHistory = snap.dealHistory ?? [];
  if (dealHistory.length === 0) return null;

  const humanIndex = opts.humanIndex ?? 0;
  const playerCount = snap.players.length as 3 | 4;
  if (playerCount !== 3 && playerCount !== 4) return null;

  const settlementMode = opts.settlementMode ?? readResultsChipView();
  const settlement = computePartySettlement(dealHistory, playerCount, settlementMode);

  const sorted = snap.players
    .map((p, i) => ({
      name: p.name,
      score: p.score,
      chips: settlement.rows.find((r) => r.playerIndex === i)?.chips ?? 0,
      idx: i,
    }))
    .sort((a, b) => b.score - a.score);

  const maxScore = sorted[0]?.score ?? 0;
  const humanScore = snap.players[humanIndex]?.score ?? 0;
  const humanWon = humanScore === maxScore && sorted.filter((p) => p.score === maxScore).length === 1;
  const humanPlace = sorted.findIndex((p) => p.idx === humanIndex) + 1;
  const humanChips = settlement.rows.find((r) => r.playerIndex === humanIndex)?.chips ?? 0;

  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    finishedAt: new Date().toISOString(),
    profileId,
    gameId: opts.gameId,
    playerCount,
    settlementMode,
    humanIndex,
    humanWon,
    humanPlace,
    humanScore,
    humanChips,
    dealCount: dealHistory.length,
    players: sorted.map((p, rank) => ({
      name: p.name,
      score: p.score,
      chips: p.chips,
      place: rank + 1,
    })),
  };
}

function prunePartyHistoryList(list: PartyHistoryRecord[]): PartyHistoryRecord[] {
  const cutoff = Date.now() - PARTY_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const fresh = list.filter((r) => {
    const t = Date.parse(r.finishedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
  return fresh.slice(0, PARTY_HISTORY_MAX_STORED);
}

export function appendPartyHistoryRecord(record: PartyHistoryRecord): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const key = historyKey(record.profileId);
    const list = parseList(localStorage.getItem(key));
    const merged = [record, ...list.filter((r) => r.id !== record.id)];
    const next = prunePartyHistoryList(merged);
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
