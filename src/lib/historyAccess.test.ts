import { describe, expect, it } from 'vitest';
import { gateDealHistoryForViewer, isFullDealRow } from './historyAccess';
import type { DealResult } from '../game/GameEngine';

function deal(n: number): DealResult {
  return { dealNumber: n, bids: [1, 2, 3, 4], points: [10, 20, -5, 0], takens: [1, 2, 0, 4] };
}

describe('gateDealHistoryForViewer', () => {
  it('keeps all full when premium', () => {
    const deals = [deal(1), deal(2), deal(3), deal(4)];
    const gated = gateDealHistoryForViewer(deals, { premium: true });
    expect(gated).toHaveLength(4);
    expect(gated.every(isFullDealRow)).toBe(true);
  });

  it('full only last 3 for free', () => {
    const deals = [deal(1), deal(2), deal(3), deal(4), deal(5)];
    const gated = gateDealHistoryForViewer(deals, { premium: false, fullLimit: 3 });
    expect(gated).toHaveLength(5);
    expect(isFullDealRow(gated[0]!)).toBe(false);
    expect(isFullDealRow(gated[1]!)).toBe(false);
    expect(isFullDealRow(gated[2]!)).toBe(true);
    expect(isFullDealRow(gated[4]!)).toBe(true);
    expect(gated[0]).toMatchObject({ dealNumber: 1, points: [10, 20, -5, 0] });
    expect((gated[0] as { bids?: unknown }).bids).toBeUndefined();
  });
});
