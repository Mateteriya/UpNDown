/**
 * Lifetime-вехи + unlock косметики (рамки авы).
 * @see docs/METRICS-MAP-V1.md
 */

/** @todo v2: тема карт как вторая косметика (не полный рескин стола в этом MVP). */
export const CARD_THEME_COSMETIC_PLANNED = 'aurora' as const;

import type { AvatarFrameId } from '../lib/avatarEditorFrames';
import { eloTierFor, type EloTierId } from './eloTiers';
import { getPlayerProfile } from './persistence';
import type { BidPlayStyle } from './playerSkillStats';

export type MilestoneId =
  | 'streak_5'
  | 'streak_10'
  | 'exact_25'
  | 'exact_100'
  | 'online_wins_10'
  | 'elo_adept'
  | 'elo_expert'
  | 'style_formed'
  | 'gold_frame_premium';

export type MilestoneRewardType = 'badge' | 'title' | 'frame';

export type MilestoneReward = {
  type: MilestoneRewardType;
  /** i18n key suffix under cabinet.milestoneReward.* */
  titleKey?: string;
  frameId?: AvatarFrameId;
  premiumRequired?: boolean;
};

export type MilestoneDef = {
  id: MilestoneId;
  /** Target value for progress (1 for boolean goals) */
  target: number;
  reward: MilestoneReward;
  /**
   * 1..5 — показ в ЛК «топ-5». Остальные считаются для unlock/рамок,
   * но не засоряют список.
   */
  featuredRank?: 1 | 2 | 3 | 4 | 5;
  /** Культивируемые «звёзды» среди топ-5 */
  spotlight?: boolean;
};

export type MilestoneInput = {
  bestExactStreak: number;
  exactDeals: number;
  onlineWins: number;
  elo: number | null;
  style: BidPlayStyle;
};

export type MilestoneStatus = {
  id: MilestoneId;
  target: number;
  current: number;
  progress: number;
  unlocked: boolean;
  reward: MilestoneReward;
  featuredRank?: 1 | 2 | 3 | 4 | 5;
  spotlight?: boolean;
};

export type AchievementsStore = {
  unlocked: Partial<Record<MilestoneId, number>>;
  seen: Partial<Record<MilestoneId, number>>;
};

const STORAGE_PREFIX = 'updown_achievements_';

export const MILESTONE_DEFS: readonly MilestoneDef[] = [
  {
    id: 'streak_5',
    target: 5,
    reward: { type: 'frame', frameId: 'orbit', titleKey: 'streak5' },
    featuredRank: 1,
    spotlight: true,
  },
  {
    id: 'streak_10',
    target: 10,
    reward: { type: 'badge', titleKey: 'streak10' },
  },
  {
    id: 'exact_25',
    target: 25,
    reward: { type: 'badge', titleKey: 'exact25' },
  },
  {
    id: 'exact_100',
    target: 100,
    reward: { type: 'title', titleKey: 'exact100' },
    featuredRank: 3,
    spotlight: true,
  },
  {
    id: 'online_wins_10',
    target: 10,
    reward: { type: 'frame', frameId: 'neon', titleKey: 'onlineWins10' },
    featuredRank: 2,
    spotlight: true,
  },
  {
    id: 'elo_adept',
    target: 1100,
    reward: { type: 'badge', titleKey: 'eloAdept' },
  },
  {
    id: 'elo_expert',
    target: 1200,
    reward: { type: 'title', titleKey: 'eloExpert' },
    featuredRank: 4,
  },
  {
    id: 'style_formed',
    target: 1,
    reward: { type: 'title', titleKey: 'styleFormed' },
  },
  {
    id: 'gold_frame_premium',
    target: 1,
    reward: {
      type: 'frame',
      frameId: 'gold',
      titleKey: 'goldFrame',
      premiumRequired: true,
    },
    featuredRank: 5,
    spotlight: true,
  },
] as const;

/** Топ-5 вех для UI (порядок featuredRank). */
export const FEATURED_MILESTONE_IDS: readonly MilestoneId[] = MILESTONE_DEFS.filter(
  (d) => d.featuredRank != null,
)
  .slice()
  .sort((a, b) => (a.featuredRank ?? 99) - (b.featuredRank ?? 99))
  .map((d) => d.id);

const TIER_RANK: Record<EloTierId, number> = {
  novice: 0,
  amateur: 1,
  regular: 2,
  adept: 3,
  expert: 4,
  master: 5,
  legend: 6,
};

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function currentFor(def: MilestoneDef, input: MilestoneInput): number {
  switch (def.id) {
    case 'streak_5':
    case 'streak_10':
      return Math.max(0, input.bestExactStreak);
    case 'exact_25':
    case 'exact_100':
      return Math.max(0, input.exactDeals);
    case 'online_wins_10':
      return Math.max(0, input.onlineWins);
    case 'elo_adept':
    case 'elo_expert':
      return input.elo != null && Number.isFinite(input.elo) ? input.elo : 0;
    case 'style_formed':
      return input.style !== 'learning' ? 1 : 0;
    case 'gold_frame_premium':
      // Unlock condition: reached adept tier (same as elo_adept), rewarded only with premium
      if (input.elo == null || !Number.isFinite(input.elo)) return 0;
      return TIER_RANK[eloTierFor(input.elo).id] >= TIER_RANK.adept ? 1 : 0;
    default:
      return 0;
  }
}

export function evaluateMilestones(input: MilestoneInput): MilestoneStatus[] {
  return MILESTONE_DEFS.map((def) => {
    const current = currentFor(def, input);
    const progress = clamp01(def.target > 0 ? current / def.target : 0);
    return {
      id: def.id,
      target: def.target,
      current: Math.min(current, def.target),
      progress,
      unlocked: current >= def.target,
      reward: def.reward,
      featuredRank: def.featuredRank,
      spotlight: def.spotlight,
    };
  });
}

/** Только топ-5 для панели ЛК (остальные всё равно синкаются в store). */
export function featuredMilestoneStatuses(
  statuses: readonly MilestoneStatus[],
): MilestoneStatus[] {
  const byId = new Map(statuses.map((s) => [s.id, s]));
  return FEATURED_MILESTONE_IDS.map((id) => byId.get(id)).filter(
    (s): s is MilestoneStatus => s != null,
  );
}

function storageKey(profileId: string): string {
  return STORAGE_PREFIX + profileId;
}

export function emptyAchievementsStore(): AchievementsStore {
  return { unlocked: {}, seen: {} };
}

export function loadAchievementsStore(profileId?: string): AchievementsStore {
  try {
    if (typeof localStorage === 'undefined') return emptyAchievementsStore();
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    if (!pid) return emptyAchievementsStore();
    const raw = localStorage.getItem(storageKey(pid));
    if (!raw) return emptyAchievementsStore();
    const parsed = JSON.parse(raw) as AchievementsStore;
    return {
      unlocked: parsed?.unlocked && typeof parsed.unlocked === 'object' ? parsed.unlocked : {},
      seen: parsed?.seen && typeof parsed.seen === 'object' ? parsed.seen : {},
    };
  } catch {
    return emptyAchievementsStore();
  }
}

export function saveAchievementsStore(store: AchievementsStore, profileId?: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    if (!pid) return;
    localStorage.setItem(storageKey(pid), JSON.stringify(store));
  } catch {
    /* ignore quota */
  }
}

/** Записать новые unlock'и; вернуть id только что открытых. */
export function syncAchievementsFromMilestones(
  statuses: readonly MilestoneStatus[],
  profileId?: string,
  opts?: { premiumCosmeticEnabled?: boolean },
): { store: AchievementsStore; newlyUnlocked: MilestoneId[] } {
  const store = loadAchievementsStore(profileId);
  const newlyUnlocked: MilestoneId[] = [];
  const now = Date.now();
  const premiumOk = opts?.premiumCosmeticEnabled !== false;

  for (const s of statuses) {
    if (!s.unlocked) continue;
    if (s.reward.premiumRequired && !premiumOk) continue;
    if (store.unlocked[s.id] == null) {
      store.unlocked[s.id] = now;
      newlyUnlocked.push(s.id);
    }
  }

  if (newlyUnlocked.length > 0) saveAchievementsStore(store, profileId);
  return { store, newlyUnlocked };
}

export function markMilestonesSeen(ids: readonly MilestoneId[], profileId?: string): AchievementsStore {
  const store = loadAchievementsStore(profileId);
  const now = Date.now();
  let dirty = false;
  for (const id of ids) {
    if (store.unlocked[id] != null && store.seen[id] == null) {
      store.seen[id] = now;
      dirty = true;
    }
  }
  if (dirty) saveAchievementsStore(store, profileId);
  return store;
}

/** Рамки, доступные по вехам (без учёта premium-гейта — caller проверяет флаг). */
export function unlockedFrameIds(
  store: AchievementsStore,
  statuses?: readonly MilestoneStatus[],
): Set<AvatarFrameId> {
  const out = new Set<AvatarFrameId>();
  // cosmic всегда free baseline
  out.add('cosmic');

  const unlockedIds = new Set(
    Object.keys(store.unlocked).filter((id) => store.unlocked[id as MilestoneId] != null),
  );

  for (const def of MILESTONE_DEFS) {
    if (def.reward.type !== 'frame' || !def.reward.frameId) continue;
    if (unlockedIds.has(def.id)) out.add(def.reward.frameId);
  }

  // Also allow frames from currently-met milestones even before sync (optimistic)
  if (statuses) {
    for (const s of statuses) {
      if (!s.unlocked || s.reward.type !== 'frame' || !s.reward.frameId) continue;
      if (s.reward.premiumRequired) continue;
      out.add(s.reward.frameId);
    }
  }

  return out;
}

export function milestoneDefById(id: MilestoneId): MilestoneDef | undefined {
  return MILESTONE_DEFS.find((d) => d.id === id);
}

/** Какая веха открывает рамку (для UI lock-hint). */
export function milestoneForFrame(frameId: AvatarFrameId): MilestoneDef | undefined {
  return MILESTONE_DEFS.find((d) => d.reward.frameId === frameId);
}
