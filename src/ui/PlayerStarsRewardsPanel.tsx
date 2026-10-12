/**
 * Блок «Звёзды и награды»: живой баланс → станции начисления → кошелёк → траты → лента.
 * Свёрнут: превью баланса + полоска наград.
 */

import { useEffect, useState } from 'react';
import type { LocalSkillView } from '../game/localSkillCache';
import type { MilestoneId } from '../game/playerMilestones';
import {
  STAR_AMOUNTS,
  STAR_EXACT_REWARDS_3P,
  STAR_EXACT_REWARDS_4P,
  getPlayerStars,
  giftStars,
  receiveStarLike,
  recordOnlineVisitToday,
  type PlayerStarsStore,
  type StarLedgerEntry,
} from '../game/playerStars';
import { StarBrandGlyph } from './StarBrandGlyph';
import {
  MilestoneGlyph,
  frameSrc,
  itemTone,
  milestoneDesc,
  rewardKindLabel,
  rewardLabel,
  useFeaturedMilestones,
} from './milestonePanelShared';
import { UpBrandMark } from './UpBrandGlyph';

type SourceKey = 'milestones' | 'likes' | 'play' | 'online';

const ONLINE_STREAK_DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

export function PlayerStarsRewardsPanel({
  skillView,
  onlineWins,
  elo,
  userId,
  compact,
  onOpenGoal,
  defaultOpen,
}: {
  skillView: LocalSkillView;
  onlineWins: number;
  elo: number | null;
  userId?: string | null;
  compact?: boolean;
  onOpenGoal?: (id: MilestoneId) => void;
  /** По умолчанию: на ПК свёрнут, на мобилке раскрыт */
  defaultOpen?: boolean;
}) {
  const { t, featured, store, unlockedCount, profileId } = useFeaturedMilestones({
    skillView,
    onlineWins,
    elo,
    userId,
  });
  const [panelOpen, setPanelOpen] = useState(defaultOpen ?? !compact);
  const [ribbonExpanded, setRibbonExpanded] = useState(false);
  const [brokenFrames, setBrokenFrames] = useState<Partial<Record<string, true>>>({});
  const [stars, setStars] = useState<PlayerStarsStore>(() => getPlayerStars(profileId));
  const [showHistory, setShowHistory] = useState(false);
  const [showGift, setShowGift] = useState(false);
  const [giftTo, setGiftTo] = useState('');
  const [giftAmt, setGiftAmt] = useState('1');
  const [giftMsg, setGiftMsg] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<MilestoneId | null>(null);
  const [balanceOpen, setBalanceOpen] = useState(false);
  const [sourceOpen, setSourceOpen] = useState<SourceKey | null>(null);
  const [upGlossOpen, setUpGlossOpen] = useState(false);

  useEffect(() => {
    setStars(recordOnlineVisitToday(profileId));
  }, [profileId]);

  const refreshStars = () => setStars(getPlayerStars(profileId));

  const onGift = () => {
    const n = Math.max(1, Math.floor(Number(giftAmt) || 0));
    const { ok } = giftStars(giftTo.trim() || 'stub', n, profileId);
    setGiftMsg(ok ? t('cabinet.starsGiftOk') : t('cabinet.starsGiftNeedBalance'));
    refreshStars();
  };

  const resetHud = () => {
    setShowGift(false);
    setShowHistory(false);
    setRibbonExpanded(false);
    setActiveId(null);
    setBalanceOpen(false);
    setSourceOpen(null);
    setUpGlossOpen(false);
    setGiftMsg(null);
  };

  const toggleSource = (key: SourceKey) => {
    setShowGift(false);
    setShowHistory(false);
    setBalanceOpen(false);
    setGiftMsg(null);
    setSourceOpen((v) => {
      if (v === key) {
        setUpGlossOpen(false);
        return null;
      }
      setUpGlossOpen(false);
      return key;
    });
  };

  const openGift = () => {
    setShowGift(true);
    setShowHistory(false);
    setBalanceOpen(false);
    setSourceOpen(null);
    setUpGlossOpen(false);
    setGiftMsg(null);
  };

  const sourceItems: {
    key: SourceKey;
    title: string;
    hint: string;
    tone: 'cyan' | 'magenta' | 'violet' | 'gold';
    upTitle?: boolean;
  }[] = [
    {
      key: 'likes',
      title: 'UP',
      hint: t('cabinet.starsSourceLikesHint'),
      tone: 'magenta',
      upTitle: true,
    },
    {
      key: 'milestones',
      title: t('cabinet.starsSourceMilestones'),
      hint: t('cabinet.starsSourceMilestonesHint'),
      tone: 'cyan',
    },
    {
      key: 'play',
      title: t('cabinet.starsSourcePlay'),
      hint: t('cabinet.starsSourcePlayHint'),
      tone: 'violet',
    },
    {
      key: 'online',
      title: t('cabinet.starsSourceOnline'),
      hint: t('cabinet.starsSourceOnlineHint'),
      tone: 'gold',
    },
  ];

  const activeSource = sourceItems.find((s) => s.key === sourceOpen) ?? null;
  const net = stars.earnedTotal - stars.givenTotal;
  const streakDays = Math.max(0, stars.loginStreakDays);
  const firstGoal = featured.find((s) => !(store.unlocked[s.id] != null || s.unlocked)) ?? featured[0];

  return (
    <section
      className={[
        'milestones stars-rewards milestones--profile stat-hud--alive',
        compact ? 'milestones--compact stars-rewards--compact' : '',
        panelOpen ? 'stars-rewards--open' : 'stars-rewards--collapsed',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t('cabinet.starsTitle')}
    >
      <span className="stat-hud__corner stat-hud__corner--tl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--tr" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--bl" aria-hidden="true" />
      <span className="stat-hud__corner stat-hud__corner--br" aria-hidden="true" />
      <span className="milestones__panel-sheen" aria-hidden="true" />

      <div className="stat-hud__chrome" aria-hidden="true">
        <span className="stat-hud__led" />
        <span className="stat-hud__eyebrow">{t('cabinet.starsEyebrow')}</span>
      </div>

      <header className="milestones__head stars-rewards__head">
        <button
          type="button"
          className="milestones__head-toggle"
          aria-expanded={panelOpen}
          aria-controls="stars-rewards-body"
          aria-label={panelOpen ? t('cabinet.starsCollapse') : t('cabinet.starsExpand')}
          title={t('cabinet.starsToggle')}
          onClick={() => {
            setPanelOpen((v) => {
              if (v) resetHud();
              return !v;
            });
          }}
        >
          <span className="milestones__head-main">
            <span className="milestones__head-titles">
              <h3 className="milestones__title">{t('cabinet.starsTitle')}</h3>
              <span className="milestones__peek">
                {t('cabinet.starsPeekBalance', { n: stars.balance })}
                {' · '}
                {t('cabinet.milestonesUnlocked', { n: unlockedCount, total: featured.length })}
              </span>
            </span>
          </span>
          <span className="milestones__head-chev" aria-hidden="true" data-open={panelOpen ? '1' : '0'} />
        </button>
      </header>

      {!panelOpen ? (
        <div className="stars-rewards__peek">
          <div className="stars-rewards__peek-balance" aria-hidden="true">
            <StarBrandGlyph className="stars-rewards__peek-star" size={26} pulse />
            <strong>{stars.balance}</strong>
            <em>
              {t('cabinet.starsEarned', { n: stars.earnedTotal })}
              {' · '}
              {t('cabinet.starsGiven', { n: stars.givenTotal })}
            </em>
          </div>
        </div>
      ) : null}

      <div
        id="stars-rewards-body"
        className={['stars-rewards__body', panelOpen ? 'is-open' : ''].join(' ')}
        hidden={!panelOpen}
      >
        <div className="stars-hud">
          {/* ——— Живой баланс ——— */}
          <button
            type="button"
            className={['stars-hud__hero', 'stars-hud__hero--btn', balanceOpen ? 'is-open' : '']
              .filter(Boolean)
              .join(' ')}
            aria-expanded={balanceOpen}
            title={t('cabinet.starsBalanceTap')}
            onClick={() => {
              setBalanceOpen((v) => !v);
              setSourceOpen(null);
              setShowGift(false);
              setShowHistory(false);
              setUpGlossOpen(false);
            }}
          >
            <div className="stars-hud__hero-star" aria-hidden="true">
              <StarBrandGlyph className="stars-hud__hero-glyph" size={52} pulse />
              <span className="stars-hud__hero-ring" />
            </div>
            <div className="stars-hud__balance-wrap">
              <span className="stars-hud__balance-label">
                {t('cabinet.starsBalanceLabel')}
                <i className="stars-hud__live-dot" aria-hidden="true" />
                <em className="stars-hud__live-tag">{t('cabinet.starsBalanceLive')}</em>
              </span>
              <span className="stars-hud__balance-row">
                <StarBrandGlyph size={28} />
                <strong className="stars-hud__balance" aria-live="polite">
                  {stars.balance}
                </strong>
                <span className="stars-hud__mini-chev" data-open={balanceOpen ? '1' : '0'} aria-hidden="true" />
              </span>
              <span className="stars-hud__meta">
                {t('cabinet.starsEarned', { n: stars.earnedTotal })}
                {' · '}
                {t('cabinet.starsGiven', { n: stars.givenTotal })}
              </span>
              <span className="stars-hud__meta stars-hud__meta--soft stars-hud__meta--marks">
                <UpBrandMark
                  value={stars.receivedLikes}
                  size="sm"
                  ariaLabel={t('cabinet.starsLikesAria', { n: stars.receivedLikes })}
                />
                <span aria-hidden="true">·</span>
                <span>{t('cabinet.starsLoginStreak', { n: stars.loginStreakDays })}</span>
              </span>
            </div>
          </button>
          {balanceOpen ? (
            <div className="stars-hud__reveal stars-hud__reveal--balance" role="region">
              <div className="stars-hud__reveal-body">
                <strong className="stars-hud__reveal-kicker">{t('cabinet.starsRevealKicker')}</strong>
                <ul className="stars-hud__stat-grid">
                  <li data-tip={t('cabinet.starsTipBalance')} aria-label={t('cabinet.starsTipBalance')}>
                    <strong className="stars-hud__stat-val">
                      <StarBrandGlyph size={15} />
                      <span>{stars.balance}</span>
                    </strong>
                    <em>{t('cabinet.starsStatBalance')}</em>
                  </li>
                  <li data-tip={t('cabinet.starsTipEarned')} aria-label={t('cabinet.starsTipEarned')}>
                    <strong className="stars-hud__stat-val">
                      <StarBrandGlyph size={15} />
                      <span>{stars.earnedTotal}</span>
                    </strong>
                    <em>{t('cabinet.starsStatEarned')}</em>
                  </li>
                  <li data-tip={t('cabinet.starsTipGiven')} aria-label={t('cabinet.starsTipGiven')}>
                    <strong className="stars-hud__stat-val">
                      <StarBrandGlyph size={15} />
                      <span>{stars.givenTotal}</span>
                    </strong>
                    <em>{t('cabinet.starsStatGiven')}</em>
                  </li>
                  <li data-tip={t('cabinet.starsTipNet')} aria-label={t('cabinet.starsTipNet')}>
                    <strong className="stars-hud__stat-val">
                      <StarBrandGlyph size={15} />
                      <span>{net}</span>
                    </strong>
                    <em>{t('cabinet.starsStatNet')}</em>
                  </li>
                  <li
                    className="stars-hud__stat-grid-up"
                    data-tip={t('cabinet.starsTipUps')}
                    aria-label={t('cabinet.starsTipUps')}
                  >
                    <UpBrandMark
                      value={stars.receivedLikes}
                      size="md"
                      ariaLabel={t('cabinet.starsLikesAria', { n: stars.receivedLikes })}
                    />
                    <em>{t('cabinet.starsStatLikes')}</em>
                  </li>
                  <li data-tip={t('cabinet.starsTipStreak')} aria-label={t('cabinet.starsTipStreak')}>
                    <strong className="stars-hud__stat-val stars-hud__stat-val--days">
                      <span>{stars.loginStreakDays}</span>
                      <i>{t('cabinet.starsStatDaysUnit')}</i>
                    </strong>
                    <em>{t('cabinet.starsStatStreak')}</em>
                  </li>
                </ul>
              </div>
            </div>
          ) : null}

          {/* ——— Станции начисления ——— */}
          <div className="stars-hud__sources-wrap">
            <h4 className="stars-hud__sources-title">{t('cabinet.starsSourcesTitle')}</h4>
            <ul className="stars-hud__sources">
              {sourceItems.map((s) => {
                const open = sourceOpen === s.key;
                return (
                  <li key={s.key}>
                    <button
                      type="button"
                      className={[
                        'stars-hud__source',
                        `stars-hud__source--${s.tone}`,
                        s.upTitle ? 'stars-hud__source--up' : '',
                        open ? 'is-open' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      aria-expanded={open}
                      onClick={() => toggleSource(s.key)}
                    >
                      {s.upTitle ? (
                        <UpBrandMark
                          className="stars-hud__source-up-mark"
                          size="md"
                          pulse={open}
                          ariaLabel="UP"
                        />
                      ) : (
                        <StarBrandGlyph className="stars-hud__source-star" size={20} pulse={open} />
                      )}
                      <span className="stars-hud__source-copy">
                        {s.upTitle ? null : <strong>{s.title}</strong>}
                        <em>{s.hint}</em>
                      </span>
                      <span className="stars-hud__mini-chev" data-open={open ? '1' : '0'} aria-hidden="true" />
                    </button>
                  </li>
                );
              })}
            </ul>

            {activeSource ? (
              <div
                className={[
                  'stars-hud__reveal',
                  'stars-hud__dock',
                  `stars-hud__reveal--${activeSource.tone}`,
                  'stars-hud__reveal--source',
                ].join(' ')}
                role="region"
              >
                {activeSource.upTitle ? (
                  <UpBrandMark value={1} signed size="lg" pulse ariaLabel="+1 UP" />
                ) : (
                  <StarBrandGlyph size={26} pulse />
                )}
                <div className="stars-hud__reveal-body">
                  {activeSource.upTitle ? null : (
                    <strong className="stars-hud__reveal-kicker">{activeSource.title}</strong>
                  )}

                  {/* —— UP —— */}
                  {activeSource.key === 'likes' ? (
                    <>
                      <p className="stars-hud__reveal-text">{t('cabinet.starsSourceLikesDetail')}</p>
                      <div className="stars-hud__dock-live">
                        <UpBrandMark
                          value={stars.receivedLikes}
                          size="md"
                          ariaLabel={t('cabinet.starsLikesAria', { n: stars.receivedLikes })}
                        />
                        <span className="stars-hud__dock-live-note">
                          {t('cabinet.starsDockUpLive', { n: STAR_AMOUNTS.like })}
                        </span>
                      </div>
                      <div className="stars-hud__gloss">
                        <button
                          type="button"
                          className={['stars-hud__gloss-link', upGlossOpen ? 'is-open' : '']
                            .filter(Boolean)
                            .join(' ')}
                          aria-expanded={upGlossOpen}
                          onClick={(e) => {
                            e.stopPropagation();
                            setUpGlossOpen((v) => !v);
                          }}
                        >
                          {t('cabinet.starsSourceLikesGloss')}
                        </button>
                        {upGlossOpen ? (
                          <p className="stars-hud__gloss-body">{t('cabinet.starsSourceLikesGlossDetail')}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        className="stars-hud__btn stars-hud__wallet-btn stars-hud__btn--demo stars-hud__btn--up"
                        title={t('cabinet.starsSimulateLikeHint')}
                        onClick={() => {
                          setStars(receiveStarLike('up', profileId));
                        }}
                      >
                        <span className="stars-hud__wallet-btn-label">{t('cabinet.starsSimulateLike')}</span>
                        <UpBrandMark value={1} signed size="xs" ariaLabel="+1 UP" />
                      </button>
                    </>
                  ) : null}

                  {/* —— Достижения —— */}
                  {activeSource.key === 'milestones' ? (
                    <>
                      <p className="stars-hud__reveal-text">{t('cabinet.starsSourceMilestonesDetail')}</p>
                      <div className="stars-hud__dock-live">
                        <strong className="stars-hud__dock-count">
                          {unlockedCount}/{featured.length}
                        </strong>
                        <span className="stars-hud__dock-live-note">
                          {t('cabinet.starsDockAchievementsLive', { n: STAR_AMOUNTS.milestone })}
                        </span>
                      </div>
                      {firstGoal ? (
                        <button
                          type="button"
                          className="stars-hud__btn stars-hud__wallet-btn"
                          onClick={() => {
                            setRibbonExpanded(true);
                            setActiveId(firstGoal.id);
                            onOpenGoal?.(firstGoal.id);
                          }}
                        >
                          <StarBrandGlyph size={16} />
                          <span className="stars-hud__wallet-btn-label">
                            {t('cabinet.starsDockAchievementsCta')}
                          </span>
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {/* —— Игра: тарифы сразу —— */}
                  {activeSource.key === 'play' ? (
                    <div
                      className="stars-hud__rates stars-hud__rates--dock"
                      role="group"
                      aria-label={t('cabinet.starsSourcePlayGloss')}
                    >
                      <div className="stars-hud__rate-chip stars-hud__rate-chip--win">
                        <span>{t('cabinet.starsPlayRateWin')}</span>
                        <strong>+{STAR_AMOUNTS.win} ★</strong>
                      </div>
                      <div className="stars-hud__rate-block">
                        <span className="stars-hud__rate-block-title">{t('cabinet.starsPlayRateStreak')}</span>
                        <div className="stars-hud__rate-row">
                          <span className="stars-hud__rate-chip">
                            <em>{t('cabinet.starsPlayRateStreak3')}</em>
                            <strong>+{STAR_AMOUNTS.streak3} ★</strong>
                          </span>
                          <span className="stars-hud__rate-arrow" aria-hidden="true">
                            →
                          </span>
                          <span className="stars-hud__rate-chip">
                            <em>{t('cabinet.starsPlayRateStreak5')}</em>
                            <strong>+{STAR_AMOUNTS.streak5} ★</strong>
                          </span>
                          <span className="stars-hud__rate-arrow" aria-hidden="true">
                            →
                          </span>
                          <span className="stars-hud__rate-chip">
                            <em>{t('cabinet.starsPlayRateStreakMore')}</em>
                            <strong>+{STAR_AMOUNTS.streak5} ★</strong>
                          </span>
                        </div>
                      </div>
                      <div className="stars-hud__rate-block">
                        <span className="stars-hud__rate-block-title">{t('cabinet.starsPlayRate4p')}</span>
                        <div className="stars-hud__rate-row stars-hud__rate-row--wrap">
                          {Object.entries(STAR_EXACT_REWARDS_4P).map(([tricks, starsAmt]) => (
                            <span key={`4p-${tricks}`} className="stars-hud__rate-chip">
                              <em>
                                {tricks}/{tricks}
                              </em>
                              <strong>+{starsAmt} ★</strong>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="stars-hud__rate-block">
                        <span className="stars-hud__rate-block-title">{t('cabinet.starsPlayRate3p')}</span>
                        <div className="stars-hud__rate-row stars-hud__rate-row--wrap">
                          {([7, 8, 9, 10, 12] as const).map((tricks) => {
                            const starsAmt = STAR_EXACT_REWARDS_3P[tricks];
                            const label =
                              tricks === 10 ? '10/10 · 11/11' : `${tricks}/${tricks}`;
                            return (
                              <span key={`3p-${tricks}`} className="stars-hud__rate-chip">
                                <em>{label}</em>
                                <strong>+{starsAmt} ★</strong>
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* —— Онлайн: streak meter —— */}
                  {activeSource.key === 'online' ? (
                    <>
                      <p className="stars-hud__reveal-text">{t('cabinet.starsSourceOnlineDetail')}</p>
                      <div
                        className="stars-hud__streak"
                        role="group"
                        aria-label={t('cabinet.starsDockStreakAria', { n: streakDays })}
                      >
                        {ONLINE_STREAK_DAYS.map((day) => {
                          const filled = streakDays >= day;
                          const bonus =
                            day === 3
                              ? STAR_AMOUNTS.onlineStreak3
                              : day === 7
                                ? STAR_AMOUNTS.onlineStreak7
                                : day === 1
                                  ? STAR_AMOUNTS.onlineDay
                                  : 0;
                          const isBonus = day === 3 || day === 7;
                          return (
                            <span
                              key={day}
                              className={[
                                'stars-hud__streak-day',
                                filled ? 'is-filled' : '',
                                isBonus ? 'is-bonus' : '',
                                streakDays === day ? 'is-current' : '',
                              ]
                                .filter(Boolean)
                                .join(' ')}
                              data-tip={
                                bonus > 0
                                  ? t('cabinet.starsDockStreakDayBonus', { day, n: bonus })
                                  : t('cabinet.starsDockStreakDay', { day })
                              }
                            >
                              <strong>{day}</strong>
                              {bonus > 0 ? <em>+{bonus}</em> : null}
                            </span>
                          );
                        })}
                      </div>
                      <p className="stars-hud__dock-live-note">
                        {t('cabinet.starsDockStreakNow', { n: streakDays })}
                      </p>
                    </>
                  ) : null}
                </div>
              </div>
            ) : null}
          </div>

          {/* ——— Кошелёк ——— */}
          <div className="stars-hud__actions-wrap">
            <h4 className="stars-hud__actions-title">{t('cabinet.starsActionsTitle')}</h4>
            <div className="stars-hud__actions">
              <button
                type="button"
                className={[
                  'stars-hud__btn',
                  'stars-hud__wallet-btn',
                  showGift ? 'stars-hud__btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={t('cabinet.starsGiftHint')}
                aria-expanded={showGift}
                onClick={() => {
                  if (showGift) {
                    setShowGift(false);
                    return;
                  }
                  openGift();
                }}
              >
                <StarBrandGlyph size={16} />
                <span className="stars-hud__wallet-btn-label">{t('cabinet.starsGift')}</span>
              </button>
              <button
                type="button"
                className={[
                  'stars-hud__btn',
                  'stars-hud__wallet-btn',
                  'stars-hud__btn--ghost',
                  showHistory ? 'stars-hud__btn--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={t('cabinet.starsHistoryHint')}
                aria-expanded={showHistory}
                onClick={() => {
                  setShowHistory((v) => !v);
                  setShowGift(false);
                  setBalanceOpen(false);
                  setSourceOpen(null);
                  setUpGlossOpen(false);
                  setGiftMsg(null);
                }}
              >
                <span className="stars-hud__wallet-btn-label">{t('cabinet.starsHistory')}</span>
              </button>
            </div>
          </div>

          {showGift ? (
            <div className="stars-hud__gift">
              <p className="stars-hud__gift-hint">{t('cabinet.starsGiftHint')}</p>
              <label className="stars-hud__field">
                <span>{t('cabinet.starsGiftPlaceholder')}</span>
                <input
                  value={giftTo}
                  onChange={(e) => setGiftTo(e.target.value)}
                  placeholder="player"
                />
              </label>
              <label className="stars-hud__field">
                <span>{t('cabinet.starsGiftAmount')}</span>
                <input
                  inputMode="numeric"
                  value={giftAmt}
                  onChange={(e) => setGiftAmt(e.target.value)}
                />
              </label>
              <button type="button" className="stars-hud__btn stars-hud__wallet-btn" onClick={onGift}>
                <StarBrandGlyph size={16} />
                <span className="stars-hud__wallet-btn-label">{t('cabinet.starsGiftSend')}</span>
              </button>
              {giftMsg ? <p className="stars-hud__gift-msg">{giftMsg}</p> : null}
            </div>
          ) : null}

          {showHistory ? (
            <ul className="stars-hud__ledger">
              {stars.ledger.length === 0 ? (
                <li className="stars-hud__ledger-empty">{t('cabinet.starsHistoryEmpty')}</li>
              ) : (
                stars.ledger.slice(0, 12).map((e) => <LedgerRow key={e.id} entry={e} />)
              )}
            </ul>
          ) : null}

          <div className="stars-hud__spend">
            <span className="stars-hud__spend-title">{t('cabinet.starsSpendTitle')}</span>
            <div className="stars-hud__spend-grid">
              <button
                type="button"
                className="stars-hud__spend-card"
                disabled
                title={t('cabinet.starsSpendCosmeticsHint')}
              >
                <StarBrandGlyph size={18} />
                <strong>{t('cabinet.starsSpendCosmetics')}</strong>
                <em>{t('cabinet.starsSpendSoon')}</em>
              </button>
              <button
                type="button"
                className="stars-hud__spend-card"
                disabled
                title={t('cabinet.starsSpendBadgesHint')}
              >
                <StarBrandGlyph size={18} />
                <strong>{t('cabinet.starsSpendBadges')}</strong>
                <em>{t('cabinet.starsSpendSoon')}</em>
              </button>
              <button
                type="button"
                className="stars-hud__spend-card"
                disabled
                title={t('cabinet.starsSpendBoostsHint')}
              >
                <StarBrandGlyph size={18} />
                <strong>{t('cabinet.starsSpendBoosts')}</strong>
                <em>{t('cabinet.starsSpendSoon')}</em>
              </button>
              <button
                type="button"
                className="stars-hud__spend-card stars-hud__spend-card--live"
                title={t('cabinet.starsSpendGiftHint')}
                onClick={openGift}
              >
                <StarBrandGlyph size={18} />
                <strong>{t('cabinet.starsSpendGift')}</strong>
                <em>{t('cabinet.starsSpendGiftEm')}</em>
              </button>
            </div>
          </div>
        </div>
      </div>

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
          aria-label={t('cabinet.milestonesRewardsToggle')}
          onClick={() => {
            if (!panelOpen) setPanelOpen(true);
            setRibbonExpanded((v) => !v);
            if (ribbonExpanded) setActiveId(null);
          }}
        >
          <span className="milestones__ribbon-title">{t('cabinet.milestonesRewards')}</span>
          <span className="milestones__ribbon-meta-end">
            <span className="milestones__ribbon-count">
              {unlockedCount}/{featured.length}
            </span>
            <span
              className="milestones__ribbon-chev"
              aria-hidden="true"
              data-open={ribbonExpanded ? '1' : '0'}
            />
          </span>
        </button>
        <ul className="milestones__ribbon-list">
          {featured.map((s) => {
            const isOpen = store.unlocked[s.id] != null || s.unlocked;
            const kind = rewardKindLabel(t, s);
            const name = rewardLabel(t, s);
            const desc = milestoneDesc(t, s.id);
            const stateLabel = isOpen
              ? t('cabinet.milestoneOpen')
              : `${t('cabinet.milestoneClosed')} · ${s.current}/${s.target}`;
            const label = desc
              ? `${name}. ${kind}. ${stateLabel}. ${desc}`
              : `${name}. ${kind}. ${stateLabel}`;
            return (
              <li key={s.id}>
                <button
                  type="button"
                  className={[
                    'milestones__ribbon-chip',
                    `milestones__ribbon-chip--${itemTone(s.id)}`,
                    isOpen ? 'milestones__ribbon-chip--open' : 'milestones__ribbon-chip--locked',
                    s.reward.premiumRequired ? 'milestones__ribbon-chip--premium' : '',
                    activeId === s.id ? 'milestones__ribbon-chip--active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={label}
                  aria-pressed={ribbonExpanded && activeId === s.id}
                  onClick={() => {
                    if (!panelOpen) setPanelOpen(true);
                    if (!ribbonExpanded) {
                      setRibbonExpanded(true);
                      setActiveId(s.id);
                      onOpenGoal?.(s.id);
                      return;
                    }
                    if (activeId === s.id) {
                      setRibbonExpanded(false);
                      setActiveId(null);
                      return;
                    }
                    setActiveId(s.id);
                    onOpenGoal?.(s.id);
                  }}
                >
                  <span
                    className={[
                      'milestones__ribbon-icon',
                      `milestones__ribbon-icon--${itemTone(s.id)}`,
                    ].join(' ')}
                    aria-hidden="true"
                  >
                    {s.reward.frameId && !brokenFrames[s.reward.frameId] ? (
                      <img
                        src={frameSrc(s.reward.frameId)}
                        alt=""
                        className={[
                          'milestones__ribbon-frame',
                          `milestones__ribbon-frame--${s.reward.frameId}`,
                        ].join(' ')}
                        onError={() =>
                          setBrokenFrames((prev) =>
                            s.reward.frameId ? { ...prev, [s.reward.frameId]: true } : prev,
                          )
                        }
                      />
                    ) : (
                      <span
                        className={[
                          'milestones__ribbon-glyph',
                          `milestones__ribbon-glyph--${itemTone(s.id)}`,
                        ].join(' ')}
                      >
                        <MilestoneGlyph id={s.id} />
                      </span>
                    )}
                  </span>
                  <span className="milestones__ribbon-chip-copy">
                    <span className="milestones__ribbon-chip-kind">{kind}</span>
                    <strong className="milestones__ribbon-chip-name">
                      <span className="milestones__ribbon-chip-name-text">{name}</span>
                    </strong>
                    <em className="milestones__ribbon-chip-state">{stateLabel}</em>
                  </span>
                  <span className="milestones__ribbon-tip" aria-hidden="true">
                    <strong className="milestones__ribbon-tip-name">{name}</strong>
                    <span className="milestones__ribbon-tip-kind">{kind}</span>
                    <em className="milestones__ribbon-tip-state">{stateLabel}</em>
                    {desc ? <span className="milestones__ribbon-tip-desc">{desc}</span> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </section>
  );
}

function LedgerRow({ entry }: { entry: StarLedgerEntry }) {
  const sign = entry.delta >= 0 ? '+' : '';
  return (
    <li>
      <span className="stars-hud__ledger-delta" data-pos={entry.delta >= 0 ? '1' : '0'}>
        {sign}
        {entry.delta}
      </span>
      <span className="stars-hud__ledger-reason">{entry.reason}</span>
      {entry.note ? <span className="stars-hud__ledger-note">{entry.note}</span> : null}
    </li>
  );
}
