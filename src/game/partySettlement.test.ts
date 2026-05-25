import { describe, expect, it } from 'vitest';
import { computePartySettlement, PRIZE_POOL_SHARES, rawScoresFromDealHistory } from './partySettlement';
import type { DealResult } from './GameEngine';

const DEMO_DEALS: DealResult[] = [
  { dealNumber: 1, bids: [2, 3, 1, 2], takens: [2, 2, 3, 2], points: [20, -10, 3, 20] },
  { dealNumber: 2, bids: [5, 4, 0, 3], takens: [5, 4, 0, 1], points: [50, 40, 5, -20] },
  { dealNumber: 3, bids: [1, 2, 3, 4], takens: [1, 4, 2, 4], points: [10, 4, -10, 40] },
];

describe('computePartySettlement', () => {
  it('raw scores match demo party totals', () => {
    expect(rawScoresFromDealHistory(DEMO_DEALS, 4)).toEqual([80, 34, -2, 40]);
  });

  it('vs_average sums to zero', () => {
    const r = computePartySettlement(DEMO_DEALS, 4, 'vs_average');
    expect(r.sumChips).toBe(0);
    expect(r.rows.find((x) => x.playerIndex === 0)?.chips).toBe(42);
    expect(r.rows.find((x) => x.playerIndex === 2)?.chips).toBe(-40);
  });

  it('accuracy_bonus favors exact bids', () => {
    const r = computePartySettlement(DEMO_DEALS, 4, 'accuracy_bonus');
    expect(r.rows.find((x) => x.playerIndex === 1)?.chips).toBe(6);
    expect(r.chipWinnerIndices).toContain(0);
  });

  it('prize_pool for 4 players', () => {
    const r = computePartySettlement(DEMO_DEALS, 4, 'prize_pool', { buyIn: 100 });
    expect(r.rows.find((x) => x.playerIndex === 0)?.chips).toBe(100);
    expect(r.rows.find((x) => x.playerIndex === 3)?.chips).toBe(20);
    expect(r.inProfitIndices).toEqual([0, 3]);
  });

  it('prize_pool for 3 players uses 60/30/10', () => {
    expect(PRIZE_POOL_SHARES[3]).toEqual([0.6, 0.3, 0.1]);
    const deals3 = DEMO_DEALS.map((d) => ({
      ...d,
      bids: d.bids.slice(0, 3),
      points: d.points.slice(0, 3),
      takens: d.takens?.slice(0, 3),
    }));
    const r = computePartySettlement(deals3, 3, 'prize_pool', { buyIn: 100 });
    expect(r.rows).toHaveLength(3);
    expect(r.sumChips).toBe(0);
  });
});
