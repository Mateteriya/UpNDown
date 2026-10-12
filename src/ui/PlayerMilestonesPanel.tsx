/**
 * Мобильный стек: «Звёзды и награды» + «Цели и возможности».
 * На ПК колонки собирает AccountLkPage.
 * @see docs/METRICS-MAP-V1.md
 */

import { useState } from 'react';
import type { LocalSkillView } from '../game/localSkillCache';
import type { MilestoneId } from '../game/playerMilestones';
import { PlayerGoalsOpportunitiesPanel } from './PlayerGoalsOpportunitiesPanel';
import { PlayerStarsRewardsPanel } from './PlayerStarsRewardsPanel';

export function PlayerMilestonesPanel({
  skillView,
  onlineWins,
  elo,
  userId,
  compact,
}: {
  skillView: LocalSkillView;
  onlineWins: number;
  elo: number | null;
  userId?: string | null;
  compact?: boolean;
}) {
  const [goalsOpen, setGoalsOpen] = useState(!compact);
  const [focusId, setFocusId] = useState<MilestoneId | null>(null);

  return (
    <div className={['milestones-stack', compact ? 'milestones-stack--compact' : ''].filter(Boolean).join(' ')}>
      <PlayerStarsRewardsPanel
        compact={compact}
        defaultOpen={!compact}
        skillView={skillView}
        onlineWins={onlineWins}
        elo={elo}
        userId={userId}
        onOpenGoal={(id) => {
          setGoalsOpen(true);
          setFocusId(id);
        }}
      />
      <PlayerGoalsOpportunitiesPanel
        compact={compact}
        skillView={skillView}
        onlineWins={onlineWins}
        elo={elo}
        userId={userId}
        showList
        open={goalsOpen}
        onOpenChange={setGoalsOpen}
        focusId={focusId}
        onFocusIdChange={setFocusId}
      />
    </div>
  );
}

export { PlayerStarsRewardsPanel } from './PlayerStarsRewardsPanel';
export { PlayerGoalsOpportunitiesPanel } from './PlayerGoalsOpportunitiesPanel';
