/**
 * Полный локальный архив партий (IndexedDB): summary + dealHistory.
 * Summary по-прежнему дублируется в localStorage через partyHistory.
 * @see docs/PARTY-SETTLEMENT-PLAN.md фаза F
 */

import type { DealResult } from './GameEngine';
import {
  PARTY_HISTORY_MAX_STORED,
  PARTY_HISTORY_RETENTION_DAYS,
  appendPartyHistoryRecord,
  buildPartyHistoryRecord,
  getPartyHistory,
  type PartyHistoryRecord,
} from './partyHistory';
import { getPlayerProfile } from './persistence';
import type { SettlementMode } from './partySettlement';
import type { ResultsChipView } from './resultsChipView';

const IDB_NAME = 'updown_party_archive';
const IDB_VERSION = 1;
const STORE = 'parties';

export type PartyArchiveSource = 'offline' | 'online';

export interface PartyArchiveRecord extends PartyHistoryRecord {
  dealHistory: DealResult[];
  source: PartyArchiveSource;
  /** Id матча в Supabase, если уже записан в облако */
  cloudMatchId?: string | null;
}

function isDealResult(x: unknown): x is DealResult {
  if (!x || typeof x !== 'object') return false;
  const d = x as DealResult;
  return (
    typeof d.dealNumber === 'number' &&
    Array.isArray(d.bids) &&
    Array.isArray(d.points)
  );
}

export function isPartyArchiveRecord(x: unknown): x is PartyArchiveRecord {
  if (!x || typeof x !== 'object') return false;
  const r = x as PartyArchiveRecord;
  return (
    typeof r.id === 'string' &&
    typeof r.finishedAt === 'string' &&
    typeof r.profileId === 'string' &&
    Array.isArray(r.players) &&
    Array.isArray(r.dealHistory) &&
    r.dealHistory.every(isDealResult) &&
    (r.source === 'offline' || r.source === 'online')
  );
}

export function prunePartyArchiveList(list: PartyArchiveRecord[]): PartyArchiveRecord[] {
  const cutoff = Date.now() - PARTY_HISTORY_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const fresh = list.filter((r) => {
    const t = Date.parse(r.finishedAt);
    return Number.isFinite(t) && t >= cutoff;
  });
  return fresh
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, PARTY_HISTORY_MAX_STORED);
}

export function buildPartyArchiveRecord(
  snap: { dealNumber: number; dealHistory?: DealResult[]; players: { name: string; score: number }[] },
  opts: {
    gameId: number;
    humanIndex?: number;
    profileId?: string;
    settlementMode?: SettlementMode | ResultsChipView;
    buyIn?: number | null;
    source?: PartyArchiveSource;
    cloudMatchId?: string | null;
  },
): PartyArchiveRecord | null {
  const base = buildPartyHistoryRecord(snap, opts);
  if (!base) return null;
  const dealHistory = (snap.dealHistory ?? []).map((d) => ({
    dealNumber: d.dealNumber,
    bids: [...d.bids],
    points: [...d.points],
    ...(d.takens ? { takens: [...d.takens] } : {}),
  }));
  return {
    ...base,
    dealHistory,
    source: opts.source ?? 'offline',
    cloudMatchId: opts.cloudMatchId ?? null,
  };
}

/** Summary без dealHistory — для localStorage-превью. */
export function toPartyHistorySummary(record: PartyArchiveRecord): PartyHistoryRecord {
  const {
    dealHistory: _dh,
    source: _src,
    cloudMatchId: _cm,
    ...summary
  } = record;
  return summary;
}

type IdbReq<T> = IDBRequest<T>;

function reqToPromise<T>(req: IdbReq<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb_error'));
  });
}

function openArchiveDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          const store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('profileId', 'profileId', { unique: false });
          store.createIndex('finishedAt', 'finishedAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** In-memory fallback when IndexedDB unavailable (SSR / tests). */
const memoryByProfile = new Map<string, PartyArchiveRecord[]>();

function memoryList(profileId: string): PartyArchiveRecord[] {
  return memoryByProfile.get(profileId) ?? [];
}

function memorySet(profileId: string, list: PartyArchiveRecord[]): void {
  memoryByProfile.set(profileId, prunePartyArchiveList(list));
}

/** Test helper: clear in-memory fallback. */
export function __resetPartyArchiveMemoryForTests(): void {
  memoryByProfile.clear();
}

async function readAllForProfile(profileId: string): Promise<PartyArchiveRecord[]> {
  const db = await openArchiveDb();
  if (!db) return memoryList(profileId);
  try {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const idx = store.index('profileId');
    const rows = await reqToPromise(idx.getAll(profileId));
    db.close();
    return prunePartyArchiveList((rows as unknown[]).filter(isPartyArchiveRecord));
  } catch {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    return memoryList(profileId);
  }
}

async function writeAllForProfile(profileId: string, list: PartyArchiveRecord[]): Promise<void> {
  const pruned = prunePartyArchiveList(list);
  const db = await openArchiveDb();
  if (!db) {
    memorySet(profileId, pruned);
    return;
  }
  try {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const existing = await reqToPromise(store.index('profileId').getAllKeys(profileId));
    for (const key of existing) {
      store.delete(key);
    }
    for (const row of pruned) {
      store.put(row);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb_tx'));
      tx.onabort = () => reject(tx.error ?? new Error('idb_abort'));
    });
    db.close();
  } catch {
    try {
      db.close();
    } catch {
      /* ignore */
    }
    memorySet(profileId, pruned);
  }
}

let migratePromise: Promise<void> | null = null;

/** Однократно: перенести summary из localStorage в IDB (без dealHistory). */
export function ensurePartyArchiveMigrated(profileId?: string): Promise<void> {
  const pid = profileId ?? getPlayerProfile().profileId ?? '';
  if (!pid) return Promise.resolve();
  if (!migratePromise) {
    migratePromise = (async () => {
      try {
        const existing = await readAllForProfile(pid);
        if (existing.length > 0) return;
        const summaries = getPartyHistory(pid, PARTY_HISTORY_MAX_STORED);
        if (summaries.length === 0) return;
        const asArchive: PartyArchiveRecord[] = summaries.map((s) => ({
          ...s,
          dealHistory: [],
          source: 'offline' as const,
          cloudMatchId: null,
        }));
        await writeAllForProfile(pid, asArchive);
      } catch {
        /* ignore */
      }
    })();
  }
  return migratePromise;
}

export async function appendPartyArchiveRecord(record: PartyArchiveRecord): Promise<void> {
  try {
    appendPartyHistoryRecord(toPartyHistorySummary(record));
    await ensurePartyArchiveMigrated(record.profileId);
    const list = await readAllForProfile(record.profileId);
    const merged = [record, ...list.filter((r) => r.id !== record.id)];
    await writeAllForProfile(record.profileId, merged);
  } catch {
    /* ignore */
  }
}

export async function getPartyArchive(
  profileId?: string,
  limit = 40,
): Promise<PartyArchiveRecord[]> {
  try {
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    if (!pid) return [];
    await ensurePartyArchiveMigrated(pid);
    const list = await readAllForProfile(pid);
    return list.slice(0, Math.max(1, Math.min(limit, PARTY_HISTORY_MAX_STORED)));
  } catch {
    return [];
  }
}

export async function getPartyArchiveById(
  id: string,
  profileId?: string,
): Promise<PartyArchiveRecord | null> {
  const list = await getPartyArchive(profileId, PARTY_HISTORY_MAX_STORED);
  return list.find((r) => r.id === id) ?? null;
}
