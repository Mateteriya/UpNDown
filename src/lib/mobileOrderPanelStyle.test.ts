import { describe, expect, it } from 'vitest';
import {
  resolveMobileOrderPanelChrome,
  resolveMobileOrderStateId,
} from './mobileOrderPanelStyle';

describe('resolveMobileOrderStateId', () => {
  it('maps bidding turn / wait', () => {
    expect(
      resolveMobileOrderStateId({
        bid: null,
        tricksTaken: 0,
        bidding: true,
        biddingTurn: true,
      }),
    ).toBe('biddingTurnNoBid');
    expect(
      resolveMobileOrderStateId({
        bid: null,
        tricksTaken: 0,
        bidding: true,
        biddingTurn: false,
      }),
    ).toBe('biddingNoBid');
  });

  it('maps zeroExact / chasing / hard under / rare8', () => {
    expect(
      resolveMobileOrderStateId({ bid: 0, tricksTaken: 0 }),
    ).toBe('zeroExact');
    expect(
      resolveMobileOrderStateId({ bid: 5, tricksTaken: 2, tricksLeftInDeal: 4 }),
    ).toBe('chasing');
    expect(
      resolveMobileOrderStateId({ bid: 6, tricksTaken: 1, tricksLeftInDeal: 2 }),
    ).toBe('under');
    expect(
      resolveMobileOrderStateId({ bid: 8, tricksTaken: 2, tricksLeftInDeal: 6 }),
    ).toBe('rare8');
  });

  it('collecting inherits outcome', () => {
    expect(
      resolveMobileOrderStateId({
        bid: 4,
        tricksTaken: 4,
        collecting: true,
      }),
    ).toBe('exact');
    expect(
      resolveMobileOrderStateId({
        bid: 3,
        tricksTaken: 5,
        collecting: true,
      }),
    ).toBe('over');
  });
});

describe('resolveMobileOrderPanelChrome', () => {
  it('removes thick over border for normal seats (dealer keeps lab/preset width)', () => {
    const normal = resolveMobileOrderPanelChrome({ stateId: 'over', role: 'normal' });
    expect(String(normal.wrapStyle['--mop-bw' as keyof typeof normal.wrapStyle])).toBe('2px');
    const dealer = resolveMobileOrderPanelChrome({ stateId: 'over', role: 'dealer' });
    // fill-only + dealerOver preset → 2; не ужимаем сдающего отдельно от лабы
    expect(Number.parseInt(String(dealer.wrapStyle['--mop-bw' as keyof typeof dealer.wrapStyle]), 10)).toBeGreaterThanOrEqual(2);
  });
});
