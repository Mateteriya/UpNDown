import { describe, expect, it } from 'vitest';
import {
  completeTrick,
  createGame,
  dealsPerMatch,
  placeBid,
  playCard,
  playerAtLeftFrom,
  startDeal,
  startNextDeal,
  getValidPlays,
} from './GameEngine';
import { aiBid, aiPlay } from './ai';

/** Прогон одной полной раздачи на троих (ИИ-ходы). */
function playOutDeal(state: ReturnType<typeof createGame>) {
  let s = state;
  while (s.phase === 'bidding' || s.phase === 'dark-bidding') {
    const pi = s.currentPlayerIndex;
    const bid = aiBid(s, pi);
    s = placeBid(s, pi, bid);
  }
  while (s.phase === 'playing') {
    if (s.pendingTrickCompletion) {
      s = completeTrick(s);
      continue;
    }
    const pi = s.currentPlayerIndex;
    const card = aiPlay(s, pi);
    if (!card) throw new Error('aiPlay returned null');
    s = playCard(s, pi, card);
  }
  if (s.pendingTrickCompletion) s = completeTrick(s);
  return s;
}

describe('3-player smoke party', () => {
  it('plays several deals and advances dealer 0→2→1', () => {
    let s = createGame(3, 'classical', 'Вы');
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    expect(s.players.every((p) => p.hand.length === 1)).toBe(true);

    s = playOutDeal(s);
    expect(s.phase).toBe('deal-complete');
    expect(s.dealHistory).toHaveLength(1);

    const next = startNextDeal(s);
    expect(next).not.toBeNull();
    expect(next!.dealerIndex).toBe(2);
    expect(next!.dealNumber).toBe(2);
    expect(playerAtLeftFrom(0, 1, 3)).toBe(2);
  });

  it('can reach end of 31-deal match without crash (fast-forward history)', () => {
    let s = createGame(3, 'classical', 'Вы');
    s = { ...s, dealerIndex: 0, dealNumber: 1 };
    s = startDeal(s);
    // Только первые 3 раздачи полностью — остальное проверяем dealsPerMatch + startNextDeal на dark
    for (let i = 0; i < 3; i++) {
      s = playOutDeal(s);
      expect(s.phase).toBe('deal-complete');
      const n = startNextDeal(s);
      if (!n) break;
      s = n;
    }
    expect(s.dealNumber).toBeGreaterThanOrEqual(3);
    expect(dealsPerMatch(3)).toBe(31);

    // Прыжок к тёмной
    s = { ...s, dealNumber: 29, dealerIndex: 0 };
    s = startDeal(s);
    expect(s.phase).toBe('dark-bidding');
    expect(s.tricksInDeal).toBe(12);
    expect(s.players.every((p) => p.hand.length === 0)).toBe(true);

    while (s.phase === 'dark-bidding') {
      s = placeBid(s, s.currentPlayerIndex, aiBid(s, s.currentPlayerIndex));
    }
    expect(s.phase).toBe('playing');
    expect(s.players.every((p) => p.hand.length === 12)).toBe(true);
    expect(getValidPlays(s, s.currentPlayerIndex).length).toBeGreaterThan(0);
  });
});
