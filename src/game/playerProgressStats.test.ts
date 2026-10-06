import { describe, expect, it } from 'vitest';
import type { PartyArchiveRecord } from './partyArchive';
import { buildPlayerProgressBundle } from './playerProgressStats';

function row(
  partial: Partial<PartyArchiveRecord> & {
    id: string;
    finishedAt: string;
    source: 'offline' | 'online';
    humanPlace: number;
    humanWon: boolean;
  },
): PartyArchiveRecord {
  return {
    profileId: 'p1',
    gameId: 1,
    playerCount: 4,
    settlementMode: 'points_only',
    humanIndex: 0,
    humanScore: 100,
    humanChips: 0,
    dealCount: 1,
    players: [],
    dealHistory: [
      {
        dealNumber: 1,
        bids: [3, 1, 1, 1],
        points: [30, 0, 0, 0],
        takens: [3, 1, 1, 1],
      },
    ],
    ...partial,
  };
}

describe('playerProgressStats', () => {
  it('splits offline/online and finds highlights', () => {
    const archive: PartyArchiveRecord[] = [
      row({
        id: 'a',
        finishedAt: '2026-01-01T00:00:00.000Z',
        source: 'offline',
        humanPlace: 1,
        humanWon: true,
        dealHistory: [
          { dealNumber: 1, bids: [5, 1, 1, 1], points: [50, 0, 0, 0], takens: [5, 1, 1, 1] },
          { dealNumber: 2, bids: [2, 1, 1, 1], points: [-20, 0, 0, 0], takens: [0, 1, 1, 1] },
        ],
      }),
      row({
        id: 'b',
        finishedAt: '2026-01-02T00:00:00.000Z',
        source: 'online',
        humanPlace: 2,
        humanWon: false,
        dealHistory: [
          { dealNumber: 1, bids: [1, 1, 1, 1], points: [10, 0, 0, 0], takens: [1, 1, 1, 1] },
        ],
      }),
    ];
    const bundle = buildPlayerProgressBundle(archive);
    expect(bundle.offline.matches).toBe(1);
    expect(bundle.online.matches).toBe(1);
    expect(bundle.all.wins).toBe(1);
    expect(bundle.bestDeals[0]?.bid).toBe(5);
    expect(bundle.worstDeals[0]?.taken).toBe(0);
    expect(bundle.recentSeries.length).toBe(2);
  });

  it('keeps place-only matches in recentSeries when deal accuracy is missing', () => {
    const archive: PartyArchiveRecord[] = [
      row({
        id: 'place-only',
        finishedAt: '2026-01-03T00:00:00.000Z',
        source: 'online',
        humanPlace: 2,
        humanWon: false,
        dealHistory: [],
      }),
    ];
    const bundle = buildPlayerProgressBundle(archive);
    expect(bundle.recentSeries).toHaveLength(1);
    expect(bundle.recentSeries[0]?.accuracyPct).toBeNull();
    expect(bundle.recentSeries[0]?.place).toBe(2);
  });
});
