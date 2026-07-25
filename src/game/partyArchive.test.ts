import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DealResult } from './GameEngine';
import {
  buildPartyArchiveRecord,
  prunePartyArchiveList,
  toPartyHistorySummary,
  appendPartyArchiveRecord,
  getPartyArchive,
  __resetPartyArchiveMemoryForTests,
  type PartyArchiveRecord,
} from './partyArchive';
import { PARTY_HISTORY_MAX_STORED, PARTY_HISTORY_RETENTION_DAYS } from './partyHistory';

const PID = '22222222-2222-4222-a222-222222222222';

function minimalDealHistory(): DealResult[] {
  return [
    {
      dealNumber: 1,
      bids: [5, 4, 3, 2],
      points: [50, 40, -20, 10],
      takens: [5, 4, 3, 2],
    },
  ];
}

function snap() {
  return {
    dealNumber: 28,
    dealHistory: minimalDealHistory(),
    players: [
      { name: 'Вы', score: 100 },
      { name: 'A', score: 80 },
      { name: 'B', score: 60 },
      { name: 'C', score: 40 },
    ],
  };
}

describe('partyArchive', () => {
  beforeEach(() => {
    __resetPartyArchiveMemoryForTests();
    vi.stubGlobal('indexedDB', undefined);
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem(k: string) {
        return store[k] ?? null;
      },
      setItem(k: string, v: string) {
        store[k] = v;
      },
      removeItem(k: string) {
        delete store[k];
      },
    });
  });

  it('buildPartyArchiveRecord includes dealHistory and source', () => {
    const rec = buildPartyArchiveRecord(snap(), {
      gameId: 7,
      profileId: PID,
      settlementMode: 'accuracy_bonus',
      source: 'offline',
    });
    expect(rec).not.toBeNull();
    expect(rec!.dealHistory).toHaveLength(1);
    expect(rec!.dealHistory[0].dealNumber).toBe(1);
    expect(rec!.source).toBe('offline');
    expect(rec!.seatNames).toEqual(['Вы', 'A', 'B', 'C']);
  });

  it('toPartyHistorySummary strips dealHistory and cloud fields', () => {
    const full = buildPartyArchiveRecord(snap(), { gameId: 1, profileId: PID })!;
    const summary = toPartyHistorySummary(full);
    expect(summary).not.toHaveProperty('dealHistory');
    expect(summary.humanPlace).toBe(full.humanPlace);
    expect(summary.profileId).toBe(PID);
  });

  it('prunePartyArchiveList respects retention and max count', () => {
    const old = new Date(Date.now() - (PARTY_HISTORY_RETENTION_DAYS + 1) * 86400000).toISOString();
    const fresh = new Date().toISOString();
    const mk = (id: string, finishedAt: string): PartyArchiveRecord => ({
      ...buildPartyArchiveRecord(snap(), { gameId: 1, profileId: PID })!,
      id,
      finishedAt,
    });
    const list = [mk('old', old), mk('a', fresh), mk('b', fresh)];
    const pruned = prunePartyArchiveList(list);
    expect(pruned.some((r) => r.id === 'old')).toBe(false);
    expect(pruned.every((r) => r.finishedAt === fresh)).toBe(true);

    const many = Array.from({ length: PARTY_HISTORY_MAX_STORED + 5 }, (_, i) =>
      mk(`id-${i}`, new Date(Date.now() - i * 1000).toISOString()),
    );
    expect(prunePartyArchiveList(many)).toHaveLength(PARTY_HISTORY_MAX_STORED);
  });

  it('appendPartyArchiveRecord persists via memory fallback', async () => {
    const rec = buildPartyArchiveRecord(snap(), { gameId: 99, profileId: PID })!;
    await appendPartyArchiveRecord(rec);
    const list = await getPartyArchive(PID, 5);
    expect(list).toHaveLength(1);
    expect(list[0].gameId).toBe(99);
    expect(list[0].dealHistory).toHaveLength(1);
  });
});
