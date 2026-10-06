import { describe, expect, it } from 'vitest';
import { eloTierFor, eloTierProgress } from './eloTiers';

describe('eloTiers', () => {
  it('maps elo to tiers', () => {
    expect(eloTierFor(1000).id).toBe('regular');
    expect(eloTierFor(899).id).toBe('novice');
    expect(eloTierFor(1500).id).toBe('legend');
  });

  it('computes progress to next tier', () => {
    const p = eloTierProgress(1050);
    expect(p.tier.id).toBe('regular');
    expect(p.next?.id).toBe('adept');
    expect(p.pointsToNext).toBe(50);
    expect(p.progressInTier).toBeCloseTo(0.5);
  });
});
