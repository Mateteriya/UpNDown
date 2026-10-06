/**
 * Lifetime топ-5 вех + награды в ЛК.
 * @see docs/METRICS-MAP-V1.md
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
import { AVATAR_EDITOR_FRAMES, type AvatarFrameId } from '../lib/avatarEditorFrames';
import { isMilestoneCosmeticPremiumEnabled } from '../lib/featureFlags';
import { useT, type TFunc } from '../i18n';

function milestoneTitle(t: TFunc, id: MilestoneId): string {
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
    case 'gold_frame_premium':
      return t('cabinet.milestoneGoldFrame');
    default:
      return id;
  }
}

function milestoneDesc(t: TFunc, id: MilestoneId): string {
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
    default:
      return '';
  }
}

function milestoneHow(t: TFunc, id: MilestoneId): string {
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
    default:
      return '';
  }
}

function rewardLabel(t: TFunc, status: MilestoneStatus): string {
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
    case 'goldFrame':
      return t('cabinet.milestoneRewardGoldFrame');
    default:
      return key;
  }
}

function rewardKindLabel(t: TFunc, status: MilestoneStatus): string {
  if (status.reward.type === 'frame') return t('cabinet.milestoneKindFrame');
  if (status.reward.type === 'title') return t('cabinet.milestoneKindTitle');
  return t('cabinet.milestoneKindBadge');
}

function frameSrc(id: AvatarFrameId): string {
  return AVATAR_EDITOR_FRAMES.find((f) => f.id === id)?.src ?? '';
}

function itemTone(id: MilestoneId): string {
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
      return 'gold';
    default:
      return 'violet';
  }
}

/** Уникальные глифы вех — не путать между собой. */
function MilestoneGlyph({ id }: { id: MilestoneId }) {
  const common = {
    viewBox: '0 0 32 32',
    width: 22,
    height: 22,
    fill: 'none',
    'aria-hidden': true as const,
  };
  switch (id) {
    case 'streak_5':
      /* Цепочка точных: 5 ступеней вверх */
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
      /* Онлайн-сигнал + кубок */
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--online">
          <path
            d="M8 14a8 8 0 0 1 16 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.45"
          />
          <path
            d="M11 17.5a5 5 0 0 1 10 0"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            opacity="0.7"
          />
          <path
            d="M14 22h4l1 3H13l1-3Z"
            fill="currentColor"
          />
          <path
            d="M12.5 22c0-2 1.5-3.5 3.5-3.5s3.5 1.5 3.5 3.5"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <circle cx="16" cy="14" r="1.6" fill="currentColor" />
        </svg>
      );
    case 'exact_100':
      /* Прицел снайпера */
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--exact">
          <circle cx="16" cy="16" r="9" stroke="currentColor" strokeWidth="1.8" opacity="0.45" />
          <circle cx="16" cy="16" r="4.5" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="16" cy="16" r="1.6" fill="currentColor" />
          <path
            d="M16 4v4M16 24v4M4 16h4M24 16h4"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'elo_expert':
      /* Лестница силы / тиры */
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--elo">
          <path
            d="M8 24h16M10 20h12M12 16h8M14 12h4"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            opacity="0.4"
          />
          <path
            d="M16 7 20.5 14H11.5L16 7Z"
            fill="currentColor"
          />
          <path
            d="M16 14v8"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'gold_frame_premium':
      /* Золотое кольцо-рамка */
      return (
        <svg {...common} className="milestones__glyph milestones__glyph--gold">
          <rect
            x="5.5"
            y="5.5"
            width="21"
            height="21"
            rx="6"
            stroke="currentColor"
            strokeWidth="2.2"
            opacity="0.4"
          />
          <rect
            x="9"
            y="9"
            width="14"
            height="14"
            rx="4"
            stroke="currentColor"
            strokeWidth="2"
          />
          <circle cx="16" cy="16" r="2.4" fill="currentColor" />
          <path
            d="M16 6.5v2.2M16 23.3v2.2M6.5 16h2.2M23.3 16h2.2"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.75"
          />
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
  /** Узкая колонка под KPI на ПК */
  compact?: boolean;
}) {
  const t = useT();
  const profileId = getPlayerProfile().profileId ?? '';
  const premiumOk = isMilestoneCosmeticPremiumEnabled(userId);
  const [openId, setOpenId] = useState<MilestoneId | null>(null);
  const [ribbonExpanded, setRibbonExpanded] = useState(false);

  const statuses = useMemo(
    () =>
      evaluateMilestones({
        bestExactStreak: skillView.bestExactStreak,
        exactDeals: skillView.rating.exactDeals,
        onlineWins,
        elo,
        style: skillView.style,
      }),
    [
      skillView.bestExactStreak,
      skillView.rating.exactDeals,
      skillView.style,
      onlineWins,
      elo,
    ],
  );

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

  const unlockedFeatured = featured.filter((s) => store.unlocked[s.id] != null);
  const unlockedCount = unlockedFeatured.length;

  return (
    <section
      className={[
        'milestones milestones--profile stat-hud--alive',
        compact ? 'milestones--compact' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t('cabinet.milestonesTitle')}
    >
      <span className="stat-hud__corner stat-hud__corner--tl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--tr" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--bl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--br" aria-hidden="true" />
      <span className="milestones__panel-sheen" aria-hidden="true" />

      <div className="stat-hud__chrome" aria-hidden="true">
        <span className="stat-hud__led" />
        <span className="stat-hud__eyebrow">{t('cabinet.milestonesEyebrow')}</span>
      </div>

      <header className="milestones__head">
        <h3 className="milestones__title">{t('cabinet.milestonesTitle')}</h3>
        <p className="milestones__lead">{t('cabinet.milestonesLead')}</p>
        <p className="milestones__peek">
          {t('cabinet.milestonesUnlocked', { n: unlockedCount, total: featured.length })}
        </p>
      </header>

      <aside
        className={['milestones__ribbon', ribbonExpanded ? 'milestones__ribbon--expanded' : '']
          .filter(Boolean)
          .join(' ')}
        aria-label={t('cabinet.milestonesRewards')}
      >
        <button
          type="button"
          className="milestones__ribbon-meta"
          aria-expanded={ribbonExpanded}
          onClick={() => {
            setRibbonExpanded((v) => !v);
            if (ribbonExpanded) setOpenId(null);
          }}
        >
          <span className="milestones__ribbon-title">{t('cabinet.milestonesRewards')}</span>
          <span className="milestones__ribbon-count">
            {unlockedCount}/{featured.length}
          </span>
        </button>
        <ul className="milestones__ribbon-list">
          {featured.map((s) => {
            const isOpen = store.unlocked[s.id] != null || s.unlocked;
            const kind = rewardKindLabel(t, s);
            const name = rewardLabel(t, s);
            const label = `${kind}: ${name}`;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={[
                    'milestones__ribbon-chip',
                    isOpen ? 'milestones__ribbon-chip--open' : 'milestones__ribbon-chip--locked',
                    s.reward.premiumRequired ? 'milestones__ribbon-chip--premium' : '',
                    openId === s.id ? 'milestones__ribbon-chip--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  title={label}
                  aria-label={label}
                  aria-pressed={ribbonExpanded && openId === s.id}
                  onClick={() => {
                    if (!ribbonExpanded) {
                      setRibbonExpanded(true);
                      setOpenId(s.id);
                      return;
                    }
                    if (openId === s.id) {
                      setRibbonExpanded(false);
                      setOpenId(null);
                      return;
                    }
                    setOpenId(s.id);
                  }}
                >
                  {s.reward.frameId ? (
                    <img
                      src={frameSrc(s.reward.frameId)}
                      alt=""
                      className="milestones__ribbon-frame"
                    />
                  ) : (
                    <span className="milestones__ribbon-glyph" aria-hidden="true">
                      <MilestoneGlyph id={s.id} />
                    </span>
                  )}
                  <span className="milestones__ribbon-chip-copy">
                    <span className="milestones__ribbon-chip-kind">{kind}</span>
                    <strong className="milestones__ribbon-chip-name">{name}</strong>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>

      <ul className="milestones__list">
        {featured.map((s) => {
          const isOpen = store.unlocked[s.id] != null || s.unlocked;
          const isNew = newlyUnlocked.includes(s.id);
          const pct = Math.round(s.progress * 100);
          const premiumGate = Boolean(s.reward.premiumRequired && !premiumOk && s.unlocked);
          const expanded = openId === s.id;
          const desc = milestoneDesc(t, s.id);
          const how = milestoneHow(t, s.id);
          const tone = itemTone(s.id);
          return (
            <li
              key={s.id}
              id={`milestone-row-${s.id}`}
              className={[
                'milestones__item',
                `milestones__item--${tone}`,
                isOpen ? 'milestones__item--open' : 'milestones__item--locked',
                isNew ? 'milestones__item--new' : '',
                s.reward.premiumRequired ? 'milestones__item--premium' : '',
                s.spotlight ? 'milestones__item--spotlight' : '',
                expanded ? 'milestones__item--expanded' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="milestones__item-sheen" aria-hidden="true" />
              <button
                type="button"
                className="milestones__item-btn"
                aria-expanded={expanded}
                onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
              >
                <div className="milestones__item-top">
                  <span className="milestones__badge" aria-hidden="true">
                    <MilestoneGlyph id={s.id} />
                  </span>
                  <div className="milestones__item-copy">
                    <strong className="milestones__name">{milestoneTitle(t, s.id)}</strong>
                    <span className="milestones__reward-line">
                      <span className="milestones__kind">{rewardKindLabel(t, s)}</span>
                      <em className="milestones__reward-name">{rewardLabel(t, s)}</em>
                    </span>
                  </div>
                  <span className="milestones__status">
                    {premiumGate
                      ? t('cabinet.milestonePremiumLock')
                      : isOpen
                        ? t('cabinet.milestoneOpen')
                        : `${s.current}/${s.target}`}
                  </span>
                </div>
                <div
                  className="milestones__bar"
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={milestoneTitle(t, s.id)}
                >
                  <i style={{ width: `${pct}%` }} />
                </div>
                {!expanded && desc ? <p className="milestones__teaser">{desc}</p> : null}
                <span className="milestones__chev" aria-hidden="true" data-open={expanded ? '1' : '0'} />
              </button>

              <div
                className={['milestones__detail-wrap', expanded ? 'is-open' : ''].join(' ')}
                aria-hidden={!expanded}
              >
                <div className="milestones__detail-inner">
                  <div className="milestones__detail">
                    <div className="milestones__detail-block milestones__detail-block--brief">
                      <span className="milestones__sec-label">{t('cabinet.milestoneSecBrief')}</span>
                      {desc ? <p className="milestones__detail-desc">{desc}</p> : null}
                      <span
                        className={[
                          'milestones__stamp',
                          isOpen
                            ? 'milestones__stamp--open'
                            : premiumGate
                              ? 'milestones__stamp--premium'
                              : 'milestones__stamp--prog',
                        ].join(' ')}
                      >
                        {premiumGate
                          ? t('cabinet.milestonePremiumStamp')
                          : isOpen
                            ? t('cabinet.milestoneUnlockedStamp')
                            : t('cabinet.milestoneLockedStamp')}
                      </span>
                    </div>

                    <div className="milestones__detail-block milestones__detail-block--hud">
                      <span className="milestones__sec-label">{t('cabinet.milestoneSecProgress')}</span>
                      <div className="milestones__hud">
                        <div
                          className={[
                            'milestones__hud-ring',
                            isOpen ? 'milestones__hud-ring--done' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ ['--m-pct' as string]: `${pct}` }}
                          aria-hidden="true"
                        >
                          <span className="milestones__hud-ring-glow" />
                          <strong className="milestones__hud-pct">
                            {isOpen ? '✓' : t('cabinet.milestonePctLabel', { pct })}
                          </strong>
                        </div>
                        <div className="milestones__hud-meta">
                          <p className="milestones__hud-frac">
                            {t('cabinet.milestoneDetailProgress', {
                              current: s.current,
                              target: s.target,
                            })}
                          </p>
                          {isOpen ? (
                            <p className="milestones__hud-note">{t('cabinet.milestoneDetailDone')}</p>
                          ) : (
                            <p className="milestones__hud-note">
                              {t('cabinet.milestoneRemaining', {
                                n: Math.max(0, s.target - s.current),
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div
                        className="milestones__hud-track"
                        role="progressbar"
                        aria-valuenow={pct}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <i style={{ width: `${pct}%` }} />
                        <span className="milestones__hud-track-glow" style={{ left: `${pct}%` }} />
                      </div>
                    </div>

                    {how ? (
                      <div className="milestones__detail-block milestones__detail-block--how">
                        <span className="milestones__sec-label">{t('cabinet.milestoneSecHow')}</span>
                        <p className="milestones__detail-how">{how}</p>
                      </div>
                    ) : null}

                    <div className="milestones__detail-block milestones__detail-block--prize">
                      <span className="milestones__sec-label">{t('cabinet.milestoneSecPrize')}</span>
                      <div className="milestones__prize">
                        <span className="milestones__prize-glyph" aria-hidden="true">
                          <MilestoneGlyph id={s.id} />
                        </span>
                        {s.reward.frameId ? (
                          <img
                            src={frameSrc(s.reward.frameId)}
                            alt=""
                            className="milestones__prize-frame"
                          />
                        ) : null}
                        <div className="milestones__prize-copy">
                          <span className="milestones__kind">{rewardKindLabel(t, s)}</span>
                          <strong className="milestones__prize-name">{rewardLabel(t, s)}</strong>
                          {isOpen ? (
                            <em className="milestones__prize-hint">{t('cabinet.milestoneDetailDone')}</em>
                          ) : s.reward.frameId ? (
                            <em className="milestones__prize-hint">{t('cabinet.avatarFrameLockedGoal')}</em>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {skillView.style !== 'learning' ? (
        <p className="milestones__style-note">
          {t('cabinet.milestonesStyleNote', {
            style:
              skillView.style === 'sniper'
                ? t('cabinet.skillStyleSniper')
                : skillView.style === 'hunter'
                  ? t('cabinet.skillStyleHunter')
                  : skillView.style === 'cautious'
                    ? t('cabinet.skillStyleCautious')
                    : skillView.style === 'chaotic'
                      ? t('cabinet.skillStyleChaotic')
                      : t('cabinet.skillStyleBalanced'),
          })}
        </p>
      ) : null}

      <p className="milestones__premium-hint">{t('cabinet.milestonesPremiumHint')}</p>
    </section>
  );
}
