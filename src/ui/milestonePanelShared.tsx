/**
 * Общие хелперы/глифы для «Звёзды и награды» и «Цели и возможности».
 */

import { useEffect, useMemo, useState } from 'react';
import { getPlayerProfile } from '../game/persistence';
import type { LocalSkillView } from '../game/localSkillCache';
import {
  evaluateMilestones,
  featuredMilestoneStatuses,
  markMilestonesSeen,
  syncAchievementsFromMilestones,
  type AchievementsStore,
  type MilestoneId,
  type MilestoneStatus,
} from '../game/playerMilestones';
import { loadPlayerRecords } from '../game/playerRecords';
import { AVATAR_EDITOR_FRAMES, type AvatarFrameId } from '../lib/avatarEditorFrames';
import { isMilestoneCosmeticPremiumEnabled } from '../lib/featureFlags';
import { useT, type TFunc } from '../i18n';

export function milestoneTitle(t: TFunc, id: MilestoneId): string {
  switch (id) {
    case 'streak_5':
      return t('cabinet.milestoneStreak5');
    case 'streak_10':
      return t('cabinet.milestoneStreak10');
    case 'exact_25':
      return t('cabinet.milestoneExact25');
    case 'exact_100':
      return t('cabinet.milestoneExact100');
    case 'online_wins_10':
      return t('cabinet.milestoneOnlineWins10');
    case 'elo_adept':
      return t('cabinet.milestoneEloAdept');
    case 'elo_expert':
      return t('cabinet.milestoneEloExpert');
    case 'style_formed':
      return t('cabinet.milestoneStyleFormed');
    case 'party_300':
      return t('cabinet.milestoneParty300');
    case 'party_400':
      return t('cabinet.milestoneParty400');
    case 'party_500':
      return t('cabinet.milestoneParty500');
    case 'exact_deal_10':
      return t('cabinet.milestoneExactDeal10');
    case 'gold_frame_premium':
      return t('cabinet.milestoneGoldFrame');
    case 'saturn_premium':
      return t('cabinet.milestoneSaturn');
    case 'neural_premium':
      return t('cabinet.milestoneNeural');
    case 'pulsar_premium':
      return t('cabinet.milestonePulsar');
    default:
      return id;
  }
}

export function milestoneDesc(t: TFunc, id: MilestoneId): string {
  switch (id) {
    case 'streak_5':
      return t('cabinet.milestoneDescStreak5');
    case 'exact_100':
      return t('cabinet.milestoneDescExact100');
    case 'online_wins_10':
      return t('cabinet.milestoneDescOnlineWins10');
    case 'elo_expert':
      return t('cabinet.milestoneDescEloExpert');
    case 'gold_frame_premium':
      return t('cabinet.milestoneDescGoldFrame');
    case 'saturn_premium':
      return t('cabinet.milestoneDescSaturn');
    case 'neural_premium':
      return t('cabinet.milestoneDescNeural');
    case 'pulsar_premium':
      return t('cabinet.milestoneDescPulsar');
    default:
      return '';
  }
}

export function milestoneHow(t: TFunc, id: MilestoneId): string {
  switch (id) {
    case 'streak_5':
      return t('cabinet.milestoneHowStreak5');
    case 'exact_100':
      return t('cabinet.milestoneHowExact100');
    case 'online_wins_10':
      return t('cabinet.milestoneHowOnlineWins10');
    case 'elo_expert':
      return t('cabinet.milestoneHowEloExpert');
    case 'gold_frame_premium':
      return t('cabinet.milestoneHowGoldFrame');
    case 'saturn_premium':
      return t('cabinet.milestoneHowSaturn');
    case 'neural_premium':
      return t('cabinet.milestoneHowNeural');
    case 'pulsar_premium':
      return t('cabinet.milestoneHowPulsar');
    default:
      return '';
  }
}

export function rewardLabel(t: TFunc, status: MilestoneStatus): string {
  const key = status.reward.titleKey;
  if (!key) return '';
  switch (key) {
    case 'streak5':
      return t('cabinet.milestoneRewardStreak5');
    case 'streak10':
      return t('cabinet.milestoneRewardStreak10');
    case 'exact25':
      return t('cabinet.milestoneRewardExact25');
    case 'exact100':
      return t('cabinet.milestoneRewardExact100');
    case 'onlineWins10':
      return t('cabinet.milestoneRewardOnlineWins10');
    case 'eloAdept':
      return t('cabinet.milestoneRewardEloAdept');
    case 'eloExpert':
      return t('cabinet.milestoneRewardEloExpert');
    case 'styleFormed':
      return t('cabinet.milestoneRewardStyleFormed');
    case 'party300':
      return t('cabinet.milestoneRewardParty300');
    case 'party400':
      return t('cabinet.milestoneRewardParty400');
    case 'party500':
      return t('cabinet.milestoneRewardParty500');
    case 'exactDeal10':
      return t('cabinet.milestoneRewardExactDeal10');
    case 'goldFrame':
      return t('cabinet.milestoneRewardGoldFrame');
    case 'saturn':
      return t('cabinet.milestoneRewardSaturn');
    case 'neural':
      return t('cabinet.milestoneRewardNeural');
    case 'pulsar':
      return t('cabinet.milestoneRewardPulsar');
    default:
      return key;
  }
}

export function rewardKindLabel(t: TFunc, status: MilestoneStatus): string {
  if (status.reward.type === 'frame') return t('cabinet.milestoneKindFrame');
  if (status.reward.type === 'title') return t('cabinet.milestoneKindTitle');
  return t('cabinet.milestoneKindBadge');
}

export function frameSrc(id: AvatarFrameId): string {
  return AVATAR_EDITOR_FRAMES.find((f) => f.id === id)?.src ?? '';
}

export function itemTone(id: MilestoneId): string {
  switch (id) {
    case 'streak_5':
      return 'cyan';
    case 'online_wins_10':
      return 'magenta';
    case 'exact_100':
      return 'violet';
    case 'elo_expert':
      return 'indigo';
    case 'gold_frame_premium':
    case 'saturn_premium':
      return 'gold';
    case 'neural_premium':
      return 'violet';
    case 'pulsar_premium':
      return 'cyan';
    default:
      return 'violet';
  }
}

export function MilestoneGlyph({ id }: { id: MilestoneId }) {
  const common = {
    viewBox: '0 0 32 32',
    width: 22,
    height: 22,
    fill: 'none',
    'aria-hidden': true as const,
  };
  switch (id) {
    case 'streak_5':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--streak">
          <path
            d="M5 24h4v-3H5v3Zm6-5h4v-5h-4v5Zm6-7h4V8h-4v4Zm6-6h4V4h-4v2Z"
            fill="currentColor"
            opacity="0.35"
          />
          <path
            d="M6 22.5 11 16l5 4 9-12"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="26" cy="8" r="2.2" fill="currentColor" />
        </svg>
      );
    case 'online_wins_10':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--online">
          <path d="M8 14a8 8 0 0 1 16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
          <path d="M11 17.5a5 5 0 0 1 10 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
          <path d="M14 22h4l1 3H13l1-3Z" fill="currentColor" />
          <path d="M12.5 22c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          <circle cx="16" cy="14" r="1.6" fill="currentColor" />
        </svg>
      );
    case 'exact_100':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--exact">
          <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.45" />
          <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="16" r="1.6" fill="currentColor" />
          <path d="M16 4v4M16 24v4M4 16h4M24 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      );
    case 'elo_expert':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--elo">
          <path d="M8 24h16M10 20h12M12 16h8M14 12h4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.4" />
          <path d="M16 7 20.5 14H11.5L16 7Z" fill="currentColor" />
          <path d="M16 14v8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
      );
    case 'gold_frame_premium':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--gold">
          <rect x="5.5" y="5.5" width="21" height="21" rx="6" stroke="currentColor" strokeWidth="2.2" opacity="0.4" />
          <rect x="9" y="9" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="2.4" fill="currentColor" />
          <path d="M16 6.5v2.2M16 23.3v2.2M6.5 16h2.2M23.3 16h2.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.75" />
        </svg>
      );
    case 'saturn_premium':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--saturn">
          <ellipse cx="16" cy="16" rx="13" ry="4.5" stroke="currentColor" strokeWidth="1.8" transform="rotate(-20 16 16)" opacity="0.55" />
          <ellipse cx="16" cy="16" rx="11" ry="3.2" stroke="currentColor" strokeWidth="1.4" transform="rotate(-20 16 16)" />
          <circle cx="16" cy="16" r="5.5" stroke="currentColor" strokeWidth="2" />
          <circle cx="16" cy="16" r="2" fill="currentColor" />
        </svg>
      );
    case 'neural_premium':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--neural">
          <path d="M9 10 16 16 23 9M16 16 10 23M16 16 23 22" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" opacity="0.55" />
          <circle cx="9" cy="10" r="2.2" fill="currentColor" />
          <circle cx="23" cy="9" r="2" fill="currentColor" />
          <circle cx="16" cy="16" r="2.6" fill="currentColor" />
          <circle cx="10" cy="23" r="2" fill="currentColor" />
          <circle cx="23" cy="22" r="2.2" fill="currentColor" />
        </svg>
      );
    case 'pulsar_premium':
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--pulsar">
          <circle cx="16" cy="14" r="8.5" stroke="currentColor" strokeWidth="1.6" opacity="0.35" />
          <path d="M16 3.5v4.5M7.5 8.5l3.2 2.4M24.5 8.5l-3.2 2.4M5.5 15h4M22.5 15h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          <circle cx="16" cy="14" r="3.8" fill="currentColor" />
          <ellipse cx="16" cy="22.5" rx="9.5" ry="2.6" stroke="currentColor" strokeWidth="1.8" />
          <ellipse cx="16" cy="22.5" rx="5.5" ry="1.4" stroke="currentColor" strokeWidth="1.3" opacity="0.55" />
        </svg>
      );
    default:
      return (
        <svg {...common} className="milestones__glyph">
          <circle cx="16" cy="16" r="6" fill="currentColor" />
        </svg>
      );
  }
}

export function useFeaturedMilestones(opts: {
  skillView: LocalSkillView;
  onlineWins: number;
  elo: number | null;
  userId?: string | null;
}) {
  const t = useT();
  const { skillView, onlineWins, elo, userId } = opts;
  const profileId = getPlayerProfile().profileId ?? '';
  const premiumOk = isMilestoneCosmeticPremiumEnabled(userId);

  const statuses = useMemo(() => {
    const rec = loadPlayerRecords(profileId);
    return evaluateMilestones({
      bestExactStreak: skillView.bestExactStreak,
      exactDeals: skillView.rating.exactDeals,
      onlineWins,
      elo,
      style: skillView.style,
      bestPartyScore: rec.bestPartyScore,
      exactDeal10Count: rec.exactDeal10Count,
    });
  }, [
    skillView.bestExactStreak,
    skillView.rating.exactDeals,
    skillView.style,
    onlineWins,
    elo,
    profileId,
  ]);

  const featured = useMemo(() => featuredMilestoneStatuses(statuses), [statuses]);
  const [store, setStore] = useState<AchievementsStore>(() => ({ unlocked: {}, seen: {} }));
  const [newlyUnlocked, setNewlyUnlocked] = useState<MilestoneId[]>([]);

  useEffect(() => {
    const { store: next, newlyUnlocked: fresh } = syncAchievementsFromMilestones(
      statuses,
      profileId,
      { premiumCosmeticEnabled: premiumOk },
    );
    setStore(next);
    setNewlyUnlocked(fresh);
    if (fresh.length > 0) {
      const timer = window.setTimeout(() => {
        setStore(markMilestonesSeen(fresh, profileId));
        setNewlyUnlocked([]);
      }, 4500);
      return () => window.clearTimeout(timer);
    }
  }, [statuses, profileId, premiumOk]);

  const unlockedCount = featured.filter((s) => store.unlocked[s.id] != null).length;

  return {
    t,
    profileId,
    premiumOk,
    featured,
    store,
    newlyUnlocked,
    unlockedCount,
    skillView,
  };
}

export type FeaturedMilestonesBundle = ReturnType<typeof useFeaturedMilestones>;
