import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  evaluateMilestones,
  featuredMilestoneStatuses,
  syncAchievementsFromMilestones,
  unlockedFrameIds,
  loadAchievementsStore,
  emptyAchievementsStore,
  type MilestoneInput,
} from './playerMilestones';

const baseInput = (): MilestoneInput => ({
  bestExactStreak: 0,
  exactDeals: 0,
  onlineWins: 0,
  elo: 1000,
  style: 'learning',
});

describe('playerMilestones', () => {
  const pid = 'test-milestones-profile';

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

  it('evaluates streak and exact progress', () => {
    const statuses = evaluateMilestones({
      ...baseInput(),
      bestExactStreak: 5,
      exactDeals: 12,
    });
    const s5 = statuses.find((s) => s.id === 'streak_5')!;
    const s10 = statuses.find((s) => s.id === 'streak_10')!;
    const e25 = statuses.find((s) => s.id === 'exact_25')!;
    expect(s5.unlocked).toBe(true);
    expect(s5.progress).toBe(1);
    expect(s10.unlocked).toBe(false);
    expect(s10.progress).toBe(0.5);
    expect(e25.unlocked).toBe(false);
    expect(e25.progress).toBeCloseTo(12 / 25, 5);
  });

  it('unlocks style when not learning', () => {
    const locked = evaluateMilestones(baseInput()).find((s) => s.id === 'style_formed')!;
    expect(locked.unlocked).toBe(false);
    const open = evaluateMilestones({ ...baseInput(), style: 'sniper' }).find(
      (s) => s.id === 'style_formed',
    )!;
    expect(open.unlocked).toBe(true);
  });

  it('unlocks elo tiers by threshold', () => {
    const adept = evaluateMilestones({ ...baseInput(), elo: 1100 }).find((s) => s.id === 'elo_adept')!;
    const expert = evaluateMilestones({ ...baseInput(), elo: 1100 }).find((s) => s.id === 'elo_expert')!;
    expect(adept.unlocked).toBe(true);
    expect(expert.unlocked).toBe(false);
    const expertOk = evaluateMilestones({ ...baseInput(), elo: 1200 }).find((s) => s.id === 'elo_expert')!;
    expect(expertOk.unlocked).toBe(true);
  });

  it('syncs new unlocks and unlocks orbit frame from streak_5', () => {
    const statuses = evaluateMilestones({
      ...baseInput(),
      bestExactStreak: 5,
      onlineWins: 10,
    });
    const { newlyUnlocked, store } = syncAchievementsFromMilestones(statuses, pid, {
      premiumCosmeticEnabled: true,
    });
    expect(newlyUnlocked).toContain('streak_5');
    expect(newlyUnlocked).toContain('online_wins_10');
    expect(store.unlocked.streak_5).toBeTypeOf('number');
    const frames = unlockedFrameIds(store, statuses);
    expect(frames.has('cosmic')).toBe(true);
    expect(frames.has('orbit')).toBe(true);
    expect(frames.has('neon')).toBe(true);

    const again = syncAchievementsFromMilestones(statuses, pid);
    expect(again.newlyUnlocked).toEqual([]);
  });

  it('skips premium gold frame when premium disabled', () => {
    const statuses = evaluateMilestones({ ...baseInput(), elo: 1100 });
    const { newlyUnlocked, store } = syncAchievementsFromMilestones(statuses, pid, {
      premiumCosmeticEnabled: false,
    });
    expect(newlyUnlocked).not.toContain('gold_frame_premium');
    expect(store.unlocked.gold_frame_premium).toBeUndefined();
    expect(loadAchievementsStore(pid).unlocked.elo_adept).toBeTypeOf('number');
  });

  it('empty store loads cleanly', () => {
    expect(loadAchievementsStore(pid)).toEqual(emptyAchievementsStore());
  });

  it('exposes top-5 featured in stable order', () => {
    const featured = featuredMilestoneStatuses(evaluateMilestones(baseInput()));
    expect(featured.map((s) => s.id)).toEqual([
      'streak_5',
      'online_wins_10',
      'exact_100',
      'elo_expert',
      'gold_frame_premium',
    ]);
    expect(featured.filter((s) => s.spotlight).map((s) => s.id)).toEqual([
      'streak_5',
      'online_wins_10',
      'exact_100',
      'gold_frame_premium',
    ]);
  });
});
