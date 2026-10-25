import { describe, expect, it } from 'vitest';
import { starGlyphTierFromBalance } from './starGlyphTier';

describe('starGlyphTierFromBalance', () => {
  it('maps balance bands', () => {
    expect(starGlyphTierFromBalance(0)).toBe('empty');
    expect(starGlyphTierFromBalance(1)).toBe('spark');
    expect(starGlyphTierFromBalance(9)).toBe('spark');
    expect(starGlyphTierFromBalance(10)).toBe('bright');
    expect(starGlyphTierFromBalance(100)).toBe('bright');
    expect(starGlyphTierFromBalance(101)).toBe('bold');
    expect(starGlyphTierFromBalance(999)).toBe('bold');
    expect(starGlyphTierFromBalance(1000)).toBe('premium');
    expect(starGlyphTierFromBalance(9999)).toBe('premium');
    expect(starGlyphTierFromBalance(10000)).toBe('mythic');
  });
});
