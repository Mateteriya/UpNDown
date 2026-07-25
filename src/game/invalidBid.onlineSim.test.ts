import { describe, expect, it } from 'vitest';
import { createGameOnline, startDeal, placeBid, playerCountOf } from './GameEngine';
import { rotateStateForPlayer } from './rotateState';

function computeInvalidBid(state: ReturnType<typeof createGameOnline>, humanIdx = 0) {
  const isHumanBidding =
    (state.phase === 'bidding' || state.phase === 'dark-bidding') &&
    state.currentPlayerIndex === humanIdx;
  if (!state || !isHumanBidding || state.dealerIndex !== humanIdx) return null;
  const n = playerCountOf(state);
  const others: number[] = [];
  for (let i = 0; i < n; i++) {
    if (i === humanIdx) continue;
    const b = state.bids[i];
    if (b === null || b === undefined) return null;
    others.push(b);
  }
  if (others.length !== n - 1) return null;
  return state.tricksInDeal - others.reduce((a, b) => a + b, 0);
}

describe('invalidBid-online-sim', () => {
  it('works for every 3p dealer/viewer when dealer is last', () => {
    for (const dealer of [0, 1, 2] as const) {
      for (const me of [0, 1, 2] as const) {
        let s = createGameOnline(['A', 'B', 'C']);
        s = { ...s, dealerIndex: dealer, dealNumber: 1 };
        s = startDeal(s);
        let guard = 0;
        while (s.currentPlayerIndex !== dealer && guard++ < 5) {
          s = placeBid(s, s.currentPlayerIndex, 1);
        }
        const view = rotateStateForPlayer(s, me);
        const inv = computeInvalidBid(view);
        if (dealer === me) {
          expect(view.dealerIndex).toBe(0);
          expect(view.currentPlayerIndex).toBe(0);
          expect(inv).toBe(s.tricksInDeal - 2); // two others bid 1 each
        } else {
          // not my turn as rotated - current should not be 0 if I'm not dealer... actually if I'm not dealer, current is dealer seat which rotates to non-0
          expect(view.currentPlayerIndex).not.toBe(0);
          expect(inv).toBeNull();
        }
      }
    }
  });

  it('fails like old bug if players=3 but loop checks bids[3]', () => {
    let s = createGameOnline(['A', 'B', 'C']);
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    s = placeBid(s, 2, 1);
    s = placeBid(s, 1, 1);
    // old code
    const b1 = s.bids[1], b2 = s.bids[2], b3 = s.bids[3];
    expect(b3).toBeUndefined();
    const oldReturnsNull = b1 === null || b2 === null || b3 === null || b3 === undefined;
    expect(oldReturnsNull).toBe(true);
    expect(computeInvalidBid(s)).toBe(s.tricksInDeal - 2);
  });

  it('4-length bids with players=3: playerCountOf loop OK; length-4 loop fails', () => {
    let s = createGameOnline(['A', 'B', 'C']);
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    s = placeBid(s, 2, 1);
    s = placeBid(s, 1, 1);
    // simulate padded bids array (online anomaly)
    const padded = { ...s, bids: [...s.bids, null] as (number|null)[] };
    expect(playerCountOf(padded)).toBe(3);
    expect(computeInvalidBid(padded)).toBe(padded.tricksInDeal - 2);
    // if wrongly used bids.length
    const nWrong = padded.bids.length;
    let fail = false;
    for (let i = 0; i < nWrong; i++) {
      if (i === 0) continue;
      if (padded.bids[i] == null) fail = true;
    }
    expect(fail).toBe(true);
  });

  it('players=4 with only 3 seats filled still breaks when East bid null', () => {
    let s = createGameOnline(['A', 'B', 'C', 'D']);
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    // 4p order: first=2, then 3, then 1, then 0
    s = placeBid(s, 2, 1);
    s = placeBid(s, 3, 1);
    s = placeBid(s, 1, 1);
    expect(computeInvalidBid(s)).toBe(s.tricksInDeal - 3);
  });
});
