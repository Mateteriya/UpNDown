import { describe, expect, it } from 'vitest';
import { createGameOnline, startDeal, placeBid, getTricksInDeal, playerCountOf } from './GameEngine';
import { rotateStateForPlayer } from './rotateState';

/** Mimic UI: last bidder = only one null bid left (ours), no dealerIndex check */
function invalidBidByLastNull(state: ReturnType<typeof createGameOnline>, humanIdx = 0) {
  const isHumanBidding =
    (state.phase === 'bidding' || state.phase === 'dark-bidding') &&
    state.currentPlayerIndex === humanIdx;
  if (!isHumanBidding) return null;
  const n = playerCountOf(state);
  const nulls = [];
  for (let i = 0; i < n; i++) if (state.bids[i] == null) nulls.push(i);
  if (nulls.length !== 1 || nulls[0] !== humanIdx) return null;
  const others = [];
  for (let i = 0; i < n; i++) {
    if (i === humanIdx) continue;
    others.push(state.bids[i] as number);
  }
  return state.tricksInDeal - others.reduce((a, b) => a + b, 0);
}

describe('invalidBid-dealer-mismatch', () => {
  it('reports tricksInDeal for 3p early deals', () => {
    expect(getTricksInDeal(1, 3)).toBe(1);
    expect(getTricksInDeal(12, 3)).toBe(12);
  });

  it('if dealerIndex wrong but last-null true, dealer check fails current UI', () => {
    let s = createGameOnline(['A', 'B', 'C']);
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    s = placeBid(s, 2, 0);
    s = placeBid(s, 1, 0);
    // Corrupt dealerIndex as if rotation failed to map dealer (stays canonical while viewer is 0)
    // Viewer is seat 0 so OK. Simulate viewer seat 1 rotated wrongly leaving dealerIndex=1 instead of 0:
    const view = rotateStateForPlayer(s, 1); // dealer is 0, me is 1 — not my turn
    expect(view.currentPlayerIndex).not.toBe(0);

    // Force: me is dealer (canonical 1), last to bid, but forget to rotate dealerIndex
    let s2 = createGameOnline(['A', 'B', 'C']);
    s2 = { ...s2, dealerIndex: 1, dealNumber: 1 };
    s2 = startDeal(s2);
    while (s2.currentPlayerIndex !== 1) s2 = placeBid(s2, s2.currentPlayerIndex, 0);
    const broken = {
      ...rotateStateForPlayer(s2, 1),
      dealerIndex: 1, // BUG: left as canonical
    };
    expect(broken.currentPlayerIndex).toBe(0);
    expect(broken.dealerIndex).toBe(1); // !== humanIdx 0
    // Current UI:
    const ui = (() => {
      if (broken.dealerIndex !== 0) return null;
      return 1;
    })();
    expect(ui).toBeNull();
    // Last-null approach:
    expect(invalidBidByLastNull(broken)).toBe(broken.tricksInDeal - 0);
  });
});
