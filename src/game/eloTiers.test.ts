import { describe, expect, it } from 'vitest';
import { eloTierFor, eloTierProgress, ELO_TIERS } from './eloTiers';

describe('eloTiers', () => {
  it('maps elo to tiers', () => {
    expect(eloTierFor(1000).id).toBe('regular');
    expect(eloTierFor(879).id).toBe('novice');
    expect(eloTierFor(880).id).toBe('amateur');
    expect(eloTierFor(1540).id).toBe('legend');
  });

  it('keeps mid-ladder spans roughly even (~120)', () => {
    const mid = ELO_TIERS.filter((t) => t.maxElo != null && t.id !== 'novice');
    for (const t of mid) {
      const span = (t.maxElo as number) - t.minElo;
      expect(span).toBeGreaterThanOrEqual(110);
      expect(span).toBeLessThanOrEqual(170);
    }
  });

  it('computes progress to next tier', () => {
    const p = eloTierProgress(1060);
    expect(p.tier.id).toBe('regular');
    expect(p.next?.id).toBe('adept');
    expect(p.pointsToNext).toBe(60);
    expect(p.progressInTier).toBeCloseTo(0.5);
  });
});
