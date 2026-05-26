import { describe, it, expect, beforeEach, vi } from 'vitest';
import { appendPartyHistoryRecord, getPartyHistory, buildPartyHistoryRecord } from './partyHistory';
import type { DealResult } from './GameEngine';

const PID = '11111111-1111-4111-a111-111111111111';

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

describe('partyHistory', () => {
  beforeEach(() => {
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

  it('builds and stores a record', () => {
    const snap = {
      dealNumber: 28,
      dealHistory: minimalDealHistory(),
      players: [
        { name: 'Вы', score: 100 },
        { name: 'A', score: 80 },
        { name: 'B', score: 60 },
        { name: 'C', score: 40 },
      ],
    };
    const rec = buildPartyHistoryRecord(snap, {
      gameId: 42,
      profileId: PID,
      settlementMode: 'accuracy_bonus',
    });
    expect(rec).not.toBeNull();
    expect(rec!.humanPlace).toBe(1);
    appendPartyHistoryRecord(rec!);
    const list = getPartyHistory(PID, 5);
    expect(list).toHaveLength(1);
    expect(list[0].gameId).toBe(42);
    expect(list[0].humanChips).toBeTypeOf('number');
  });
});
