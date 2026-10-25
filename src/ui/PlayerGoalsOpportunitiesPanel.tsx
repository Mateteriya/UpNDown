/**
 * Блок «Цели и возможности» — список достижений; на ПК раскрывается в среднюю колонку.
 */

import { useEffect } from 'react';
import type { LocalSkillView } from '../game/localSkillCache';
import type { MilestoneId } from '../game/playerMilestones';
import {
  MilestoneGlyph,
  frameSrc,
  itemTone,
  milestoneDesc,
  milestoneHow,
  milestoneTitle,
  rewardKindLabel,
  rewardLabel,
  useFeaturedMilestones,
} from './milestonePanelShared';

export function PlayerGoalsOpportunitiesPanel({
  skillView,
  onlineWins,
  elo,
  userId,
  compact,
  /** false = только шапка-toggle (левая колонка ПК) */
  showList = true,
  open,
  onOpenChange,
  focusId,
  onFocusIdChange,
}: {
  skillView: LocalSkillView;
  onlineWins: number;
  elo: number | null;
  userId?: string | null;
  compact?: boolean;
  showList?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  focusId: MilestoneId | null;
  onFocusIdChange: (id: MilestoneId | null) => void;
}) {
  const { t, featured, store, newlyUnlocked, unlockedCount, premiumOk, skillView: sv } =
    useFeaturedMilestones({
      skillView,
      onlineWins,
      elo,
      userId,
    });

  useEffect(() => {
    if (!focusId || !open || !showList) return;
    const el = document.getElementById(`milestone-row-${focusId}`);
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [focusId, open, showList]);

  return (
    <section
      className={[
        'milestones goals-ops milestones--profile stat-hud--alive',
        compact ? 'milestones--compact goals-ops--compact' : '',
        open ? 'goals-ops--open' : 'goals-ops--collapsed',
        showList ? 'goals-ops--with-list' : 'goals-ops--header-only',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t('cabinet.goalsTitle')}
    >
      <span className="stat-hud__corner stat-hud__corner--tl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--tr" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--bl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--br" aria-hidden="true" />
      <span className="milestones__panel-sheen" aria-hidden="true" />

      <div className="stat-hud__chrome" aria-hidden="true">
        <span className="stat-hud__led" />
        <span className="stat-hud__eyebrow">{t('cabinet.goalsEyebrow')}</span>
      </div>

      <header className="milestones__head">
        <button
          type="button"
          className="milestones__head-toggle"
          aria-expanded={open}
          aria-controls={showList ? 'goals-ops-body' : undefined}
          aria-label={open ? t('cabinet.goalsCollapse') : t('cabinet.goalsExpand')}
          title={t('cabinet.goalsToggle')}
          onClick={() => {
            onOpenChange(!open);
            if (open) onFocusIdChange(null);
          }}
        >
          <span className="milestones__head-main">
            <span className="milestones__head-titles">
              <h3 className="milestones__title">{t('cabinet.goalsTitle')}</h3>
              <span className="milestones__peek">
                {t('cabinet.milestonesUnlocked', { n: unlockedCount, total: featured.length })}
              </span>
            </span>
          </span>
          <span className="milestones__head-chev" aria-hidden="true" data-open={open ? '1' : '0'} />
        </button>
        {open && showList ? <p className="milestones__lead">{t('cabinet.goalsLead')}</p> : null}
        {!open && !showList ? (
          <p className="goals-ops__side-hint">{t('cabinet.goalsOpenSide')}</p>
        ) : null}
      </header>

      {showList ? (
        <div
          id="goals-ops-body"
          className={['milestones__body', open ? 'is-open' : ''].join(' ')}
          hidden={!open}
          aria-hidden={!open}
        >
          <ul className="milestones__list">
            {featured.map((s) => {
              const isOpen = store.unlocked[s.id] != null || s.unlocked;
              const isNew = newlyUnlocked.includes(s.id);
              const pct = Math.round(s.progress * 100);
              const premiumGate = Boolean(s.reward.premiumRequired && !premiumOk && s.unlocked);
              const expanded = focusId === s.id;
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
                    onClick={(e) => {
                      onFocusIdChange(expanded ? null : s.id);
                      /* Chrome Android: :focus-within + transform глушил соседние карточки */
                      (e.currentTarget as HTMLButtonElement).blur();
                    }}
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
                            : t('cabinet.milestoneClosed')}
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
                    {!expanded ? (
                      <p className="milestones__teaser">
                        {desc || how || t('cabinet.milestoneDetailProgress', {
                          current: s.current,
                          target: s.target,
                        })}
                      </p>
                    ) : null}
                    <span className="milestones__chev" aria-hidden="true" data-open={expanded ? '1' : '0'} />
                  </button>

                  {expanded ? (
                    <div className="milestones__detail-wrap is-open" aria-hidden={false}>
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
                  ) : null}
                </li>
              );
            })}
          </ul>

          {sv.style !== 'learning' ? (
            <p className="milestones__style-note">
              {t('cabinet.milestonesStyleNote', {
                style:
                  sv.style === 'sniper'
                    ? t('cabinet.skillStyleSniper')
                    : sv.style === 'hunter'
                      ? t('cabinet.skillStyleHunter')
                      : sv.style === 'cautious'
                        ? t('cabinet.skillStyleCautious')
                        : sv.style === 'chaotic'
                          ? t('cabinet.skillStyleChaotic')
                          : t('cabinet.skillStyleBalanced'),
              })}
            </p>
          ) : null}

          <p className="milestones__premium-hint">{t('cabinet.milestonesPremiumHint')}</p>
        </div>
      ) : null}
    </section>
  );
}
