import { describe, expect, it } from 'vitest';
import type { DealResult } from './GameEngine';
import {
  detectMatchHighlights,
  partyScoreTierFor,
  pickPrimaryCelebration,
} from './matchHighlights';

function deal(n: number, bid: number, taken: number, points: number): DealResult {
  return {
    dealNumber: n,
    bids: [bid, 0, 0],
    points: [points, 0, 0],
    takens: [taken, 0, 0],
  };
}

describe('partyScoreTierFor', () => {
  it('maps thresholds', () => {
    expect(partyScoreTierFor(299)).toBeNull();
    expect(partyScoreTierFor(300)).toBe('mini');
    expect(partyScoreTierFor(400)).toBe('success');
    expect(partyScoreTierFor(500)).toBe('great');
    expect(partyScoreTierFor(600)).toBe('rare');
    expect(partyScoreTierFor(700)).toBe('legendary');
    expect(partyScoreTierFor(800)).toBe('incredible');
    expect(partyScoreTierFor(900)).toBe('mythic');
    expect(partyScoreTierFor(1000)).toBe('unreal');
  });
});

describe('detectMatchHighlights', () => {
  it('detects party score tier and place first', () => {
    const hs = detectMatchHighlights({
      dealHistory: [deal(1, 2, 2, 20)],
      players: [{ score: 420 }, { score: 100 }, { score: 80 }],
      humanIndex: 0,
      source: 'offline',
    });
    expect(hs.some((h) => h.kind === 'party_score' && h.tier === 'success' && h.value === 420)).toBe(
      true,
    );
    expect(hs.some((h) => h.kind === 'place_first')).toBe(true);
  });

  it('detects exact 10/10 and perfect party', () => {
    const history = [
      deal(1, 10, 10, 100),
      deal(2, 3, 3, 30),
      deal(3, 1, 1, 10),
    ];
    const hs = detectMatchHighlights({
      dealHistory: history,
      players: [{ score: 140 }, { score: 50 }, { score: 40 }],
      humanIndex: 0,
      source: 'online',
    });
    expect(hs.some((h) => h.kind === 'exact_deal' && h.value === 10 && h.labelKey === 'exactDeal10')).toBe(
      true,
    );
    expect(hs.some((h) => h.kind === 'perfect_party' && h.value === 3)).toBe(true);
  });

  it('detects exact streak >= 5', () => {
    const history = Array.from({ length: 5 }, (_, i) => deal(i + 1, 1, 1, 10));
    const hs = detectMatchHighlights({
      dealHistory: history,
      players: [{ score: 50 }, { score: 40 }, { score: 30 }],
      humanIndex: 0,
      source: 'offline',
    });
    expect(hs.some((h) => h.kind === 'exact_streak' && h.value === 5)).toBe(true);
  });

  it('picks strongest celebration', () => {
    const hs = detectMatchHighlights({
      dealHistory: [deal(1, 10, 10, 100)],
      players: [{ score: 720 }, { score: 100 }, { score: 80 }],
      humanIndex: 0,
      source: 'online',
    });
    const primary = pickPrimaryCelebration(hs);
    expect(primary?.kind).toBe('party_score');
    expect(primary?.tier).toBe('legendary');
  });
});
