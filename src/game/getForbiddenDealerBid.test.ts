import { describe, expect, it } from 'vitest';
import { createGameOnline, placeBid, startDeal } from './GameEngine';
import { getForbiddenDealerBid } from './rules';
import { rotateStateForPlayer } from './rotateState';

describe('getForbiddenDealerBid', () => {
  it('marks forbidden digit for last bidder on 3p (offline indices)', () => {
    let s = createGameOnline(['A', 'B', 'C']);
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    // dealer 0 → order 2 → 1 → 0
    expect(s.currentPlayerIndex).toBe(2);
    s = placeBid(s, 2, 0);
    s = placeBid(s, 1, 0);
    expect(s.currentPlayerIndex).toBe(0);
    // tricksInDeal=1, others sum=0 → forbidden=1
    expect(getForbiddenDealerBid(s, 0)).toBe(1);
    expect(getForbiddenDealerBid(s, 1)).toBeNull();
  });

  it('works after rotate for every 3p seat as dealer (online view)', () => {
    for (const my of [0, 1, 2] as const) {
      let s = createGameOnline(['A', 'B', 'C']);
      s = { ...s, dealerIndex: my, dealNumber: 1 };
      s = startDeal(s);
      while (s.currentPlayerIndex !== my) {
        s = placeBid(s, s.currentPlayerIndex, 0);
      }
      const view = rotateStateForPlayer(s, my);
      expect(view.currentPlayerIndex).toBe(0);
      const forbidden = getForbiddenDealerBid(view, 0);
      expect(forbidden).not.toBeNull();
      expect(forbidden!).toBeGreaterThanOrEqual(0);
      expect(forbidden!).toBeLessThanOrEqual(view.tricksInDeal);
      // Even if dealerIndex were wrong, last-bidder rule still finds it:
      const brokenDealer = { ...view, dealerIndex: 2 };
      expect(getForbiddenDealerBid(brokenDealer, 0)).toBe(forbidden);
    }
  });

  it('uses players[].bid fallback when bids[] hole (online desync)', () => {
    const state = {
      tricksInDeal: 2,
      bids: [null, null as number | null, 1],
      players: [{}, { bid: 0 }, { bid: 1 }],
    };
    // bids[1] null but players[1].bid=0 → others 0+1, forbidden=1
    expect(getForbiddenDealerBid(state, 0)).toBe(1);
  });
});
