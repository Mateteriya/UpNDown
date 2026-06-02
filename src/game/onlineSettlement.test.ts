import { describe, expect, it } from 'vitest';
import { computePartySettlement } from './partySettlement';
import type { DealResult } from './GameEngine';

const DEMO_DEALS: DealResult[] = [
  { dealNumber: 1, bids: [2, 3, 1, 2], takens: [2, 2, 3, 2], points: [20, -10, 3, 20] },
  { dealNumber: 2, bids: [5, 4, 0, 3], takens: [5, 4, 0, 1], points: [50, 40, 5, -20] },
  { dealNumber: 3, bids: [1, 2, 3, 4], takens: [1, 4, 2, 4], points: [10, 4, -10, 40] },
];

/** Acceptance: онлайн finish_game должен совпадать с клиентским computePartySettlement. */
describe('online prize_pool settlement (wave 1)', () => {
  it('matches demo party chip distribution for buy-in 100', () => {
    const r = computePartySettlement(DEMO_DEALS, 4, 'prize_pool', { buyIn: 100 });
    expect(r.rows.find((x) => x.playerIndex === 0)?.chips).toBe(100);
    expect(r.rows.find((x) => x.playerIndex === 3)?.chips).toBe(20);
    expect(r.middleLine).toBe('Банк: 400 (по 100 с человека)');
  });

  it('sum of net chips is zero for 3 players', () => {
    const deals3 = DEMO_DEALS.map((d) => ({
      ...d,
      bids: d.bids.slice(0, 3),
      points: d.points.slice(0, 3),
      takens: d.takens?.slice(0, 3),
    }));
    const r = computePartySettlement(deals3, 3, 'prize_pool', { buyIn: 100 });
    expect(r.sumChips).toBe(0);
  });
});
