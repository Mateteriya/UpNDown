import { describe, expect, it } from 'vitest';
import type { DealResult } from './GameEngine';
import {
  aggregatePlaceStats,
  applyDealOutcomesInOrder,
  applyMatchDealHistoryToSkillCounters,
  buildMatchSkillInsight,
  classifyBidBias,
  classifyBidPlayStyle,
  emptySkillCounters,
  resolveTakenForPlayer,
  skillPct,
  summarizeDealSkill,
  totalSkillDeals,
} from './playerSkillStats';

function deal(
  n: number,
  bid: number,
  taken: number,
  points: number,
  opts?: { inferTaken?: boolean },
): DealResult {
  return {
    dealNumber: n,
    bids: [bid, 1, 1, 1],
    points: [points, 0, 0, 0],
    ...(opts?.inferTaken ? {} : { takens: [taken, 1, 1, 1] }),
  };
}

describe('playerSkillStats', () => {
  it('summarizeDealSkill counts exact / under / over and streaks', () => {
    const history = [
      deal(1, 2, 2, 20),
      deal(2, 3, 1, -20),
      deal(3, 1, 1, 10),
      deal(4, 2, 4, 4),
      deal(5, 0, 0, 5),
    ];
    const s = summarizeDealSkill(history, 0);
    expect(s.deals).toBe(5);
    expect(s.exact).toBe(3);
    expect(s.under).toBe(1);
    expect(s.over).toBe(1);
    expect(s.accuracyPct).toBe(60);
    expect(s.bestExactStreak).toBe(1);
    expect(s.endingExactStreak).toBe(1);
    expect(s.worstMiss?.dealNumber).toBe(2);
    expect(s.worstMiss?.deltaTricks).toBe(2);
  });

  it('resolveTakenForPlayer falls back to points inference', () => {
    // +5 при bid 0 ⇒ taken 0
    const d = deal(1, 0, 99, 5, { inferTaken: true });
    expect(resolveTakenForPlayer(d, 0)).toBe(0);
  });

  it('aggregatePlaceStats averages places', () => {
    const stats = aggregatePlaceStats([
      { humanPlace: 1 },
      { humanPlace: 3 },
      { humanPlace: 2 },
    ]);
    expect(stats.placeCount).toBe(3);
    expect(stats.avgPlace).toBe(2);
  });

  it('applyDealOutcomesInOrder stitches exact streak across matches', () => {
    let c = emptySkillCounters();
    c = applyDealOutcomesInOrder(c, ['exact', 'exact'], 2);
    expect(c.currentExactStreak).toBe(2);
    expect(c.bestExactStreak).toBe(2);
    c = applyMatchDealHistoryToSkillCounters(
      c,
      [deal(1, 1, 1, 10), deal(2, 2, 2, 20), deal(3, 3, 1, -20)],
      0,
      1,
    );
    expect(c.exactDeals).toBe(4);
    expect(c.underDeals).toBe(1);
    expect(c.currentExactStreak).toBe(0);
    expect(c.bestExactStreak).toBe(4); // 2 prev + 2 exact at start of match
    expect(c.placeCount).toBe(2);
    expect(totalSkillDeals(c)).toBe(5);
  });

  it('skillPct and insight helpers', () => {
    expect(skillPct(3, 10)).toBe(30);
    expect(skillPct(0, 0)).toBeNull();
    const perfect = summarizeDealSkill([deal(1, 1, 1, 10), deal(2, 2, 2, 20)], 0);
    expect(buildMatchSkillInsight(perfect, 50).kind).toBe('perfect');
    const mixed = summarizeDealSkill(
      [deal(1, 2, 2, 20), deal(2, 3, 1, -20), deal(3, 1, 0, -10)],
      0,
    );
    const vs = buildMatchSkillInsight(mixed, 80);
    expect(vs.kind).toBe('vs_avg');
    expect(vs.deltaVsAvg).toBeLessThan(0);
  });

  it('classifies bid style and bias', () => {
    expect(classifyBidPlayStyle(58, 8, 34, 155)).toBe('hunter');
    expect(classifyBidPlayStyle(60, 18, 22, 80)).toBe('sniper');
    expect(classifyBidPlayStyle(40, 10, 50, 40)).toBe('hunter');
    expect(classifyBidPlayStyle(40, 50, 10, 40)).toBe('cautious');
    expect(classifyBidPlayStyle(50, 8, 34, 5)).toBe('learning');
    expect(classifyBidBias(8, 34, 155)).toBe('over');
    expect(classifyBidBias(34, 8, 155)).toBe('under');
  });
});
