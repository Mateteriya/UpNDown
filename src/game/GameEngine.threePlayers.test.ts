import { describe, expect, it } from 'vitest';
import {
  createGame,
  dealsPerMatch,
  getDealType,
  getTricksInDeal,
  playerAtLeftFrom,
  playerCountOf,
  playCard,
  startDeal,
  placeBid,
  completeTrick,
} from './GameEngine';
import type { Card } from './types';

describe('3-player deal cycle', () => {
  it('dealsPerMatch(3) is 31 and (4) is 28', () => {
    expect(dealsPerMatch(3)).toBe(31);
    expect(dealsPerMatch(4)).toBe(28);
  });

  it('getTricksInDeal for 3: up 1→12, plateau, down 11→1, specials at 12', () => {
    for (let d = 1; d <= 12; d++) expect(getTricksInDeal(d, 3)).toBe(d);
    expect(getTricksInDeal(13, 3)).toBe(12);
    expect(getTricksInDeal(14, 3)).toBe(12);
    expect(getTricksInDeal(15, 3)).toBe(11);
    expect(getTricksInDeal(25, 3)).toBe(1);
    expect(getTricksInDeal(26, 3)).toBe(12);
    expect(getTricksInDeal(28, 3)).toBe(12);
    expect(getTricksInDeal(29, 3)).toBe(12);
    expect(getTricksInDeal(31, 3)).toBe(12);
  });

  it('getDealType for 3: normal through 25, no-trump 26–28, dark 29–31', () => {
    expect(getDealType(25, 3)).toBe('normal');
    expect(getDealType(26, 3)).toBe('no-trump');
    expect(getDealType(28, 3)).toBe('no-trump');
    expect(getDealType(29, 3)).toBe('dark');
    expect(getDealType(31, 3)).toBe('dark');
  });

  it('4-player schedule unchanged', () => {
    expect(getTricksInDeal(9)).toBe(9);
    expect(getTricksInDeal(12)).toBe(9);
    expect(getTricksInDeal(13)).toBe(8);
    expect(getTricksInDeal(20)).toBe(1);
    expect(getDealType(20)).toBe('normal');
    expect(getDealType(21)).toBe('no-trump');
    expect(getDealType(25)).toBe('dark');
    expect(getDealType(28)).toBe('dark');
  });
});

describe('3-player createGame and turn order', () => {
  it('createGame(3) has three players and no East seat index', () => {
    const g = createGame(3, 'classical', 'Тест');
    expect(g.players).toHaveLength(3);
    expect(playerCountOf(g)).toBe(3);
    expect(g.players[0]!.id).toBe('human');
    expect(g.players[1]!.id).toBe('ai1');
    expect(g.players[2]!.id).toBe('ai2');
    expect(g.bids).toHaveLength(3);
  });

  it('left-hand order is 0→2→1→0', () => {
    expect(playerAtLeftFrom(0, 1, 3)).toBe(2);
    expect(playerAtLeftFrom(2, 1, 3)).toBe(1);
    expect(playerAtLeftFrom(1, 1, 3)).toBe(0);
    expect(playerAtLeftFrom(0, 3, 3)).toBe(0);
  });

  it('startDeal deals three hands and completes a 3-card trick', () => {
    let s = createGame(3, 'classical', 'Вы');
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    expect(s.players).toHaveLength(3);
    expect(s.players.every((p) => p.hand.length === 1)).toBe(true);
    expect(s.bids).toHaveLength(3);

    // Force bids valid for 1 trick (sum ≠ 1 → e.g. 0,0,0 invalid? sum must not equal tricks)
    // isValidBidSum: sum !== tricksInDeal for dealer responsibility — all non-null and sum != tricks
    const order = [s.currentPlayerIndex];
    for (let i = 0; i < 2; i++) order.push(playerAtLeftFrom(order[i]!, 1, 3));
    // Place 0, 0, then dealer adjusts — simpler: bid 0 for first two, last bids 0 if sum would be 1...
    // tricks=1; bids 0,0,0 sum=0 ok; or 1,0,0 sum=1 invalid for dealer
    s = placeBid(s, order[0]!, 0);
    s = placeBid(s, order[1]!, 0);
    s = placeBid(s, order[2]!, 0);
    expect(s.phase).toBe('playing');

    const playOne = (state: typeof s, pi: number): typeof s => {
      const card = state.players[pi]!.hand[0] as Card;
      return playCard(state, pi, card);
    };

    let cur = s.currentPlayerIndex;
    s = playOne(s, cur);
    expect(s.currentTrick).toHaveLength(1);
    cur = s.currentPlayerIndex;
    s = playOne(s, cur);
    expect(s.currentTrick).toHaveLength(2);
    cur = s.currentPlayerIndex;
    s = playOne(s, cur);
    expect(s.pendingTrickCompletion).not.toBeNull();
    expect(s.pendingTrickCompletion!.cards).toHaveLength(3);
    s = completeTrick(s);
    expect(s.phase).toBe('deal-complete');
  });
});
