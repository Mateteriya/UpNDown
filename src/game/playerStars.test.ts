import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  STAR_AMOUNTS,
  emptyPlayerStars,
  getPlayerStars,
  grantMilestoneStars,
  grantStars,
  giftStars,
  recordOnlineVisitToday,
  grantStarsForNewlyUnlockedMilestones,
  starsForExactBid,
} from './playerStars';

describe('playerStars', () => {
  const pid = 'test-stars-profile';

  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem(k: string) {
        return store[k] ?? null;
      },
      setItem(k: string, v: string) {
        store[k] = v;
      },
      removeItem(k: string) {
        delete store[k];
      },
    });
  });

  it('starts empty', () => {
    expect(getPlayerStars(pid)).toEqual(emptyPlayerStars());
  });

  it('grants and tracks earned', () => {
    const s = grantStars('win', STAR_AMOUNTS.win, { profileId: pid, key: 'win:1' });
    expect(s.balance).toBe(STAR_AMOUNTS.win);
    expect(s.earnedTotal).toBe(STAR_AMOUNTS.win);
    expect(s.ledger[0]?.reason).toBe('win');
  });

  it('milestone grant is idempotent', () => {
    grantMilestoneStars('streak_5', pid);
    grantMilestoneStars('streak_5', pid);
    const s = getPlayerStars(pid);
    expect(s.balance).toBe(STAR_AMOUNTS.milestone);
    expect(s.ledger.filter((e) => e.key === 'milestone:streak_5')).toHaveLength(1);
  });

  it('batch newly unlocked milestones', () => {
    grantStarsForNewlyUnlockedMilestones(['streak_5', 'online_wins_10'], pid);
    expect(getPlayerStars(pid).balance).toBe(STAR_AMOUNTS.milestone * 2);
  });

  it('gift fails without balance and succeeds with', () => {
    expect(giftStars('friend', 3, pid).ok).toBe(false);
    grantStars('adjust', 10, { profileId: pid, key: 'seed' });
    const { ok, store } = giftStars('friend', 3, pid);
    expect(ok).toBe(true);
    expect(store.balance).toBe(7);
    expect(store.givenTotal).toBe(3);
  });

  it('exact bid rewards by player count', () => {
    expect(starsForExactBid(4, 6)).toBe(1);
    expect(starsForExactBid(4, 9)).toBe(5);
    expect(starsForExactBid(3, 12)).toBe(10);
    expect(starsForExactBid(3, 10)).toBe(5);
    expect(starsForExactBid(4, 5)).toBe(0);
  });

  it('online visit once per day with streak bonus on day 3', () => {
    const d1 = new Date(2026, 9, 1);
    const d2 = new Date(2026, 9, 2);
    const d3 = new Date(2026, 9, 3);
    recordOnlineVisitToday(pid, d1);
    recordOnlineVisitToday(pid, d1);
    expect(getPlayerStars(pid).balance).toBe(STAR_AMOUNTS.onlineDay);
    expect(getPlayerStars(pid).loginStreakDays).toBe(1);

    recordOnlineVisitToday(pid, d2);
    expect(getPlayerStars(pid).loginStreakDays).toBe(2);
    expect(getPlayerStars(pid).balance).toBe(STAR_AMOUNTS.onlineDay * 2);

    recordOnlineVisitToday(pid, d3);
    const s = getPlayerStars(pid);
    expect(s.loginStreakDays).toBe(3);
    expect(s.balance).toBe(
      STAR_AMOUNTS.onlineDay * 3 + STAR_AMOUNTS.onlineStreak3,
    );
  });
});
