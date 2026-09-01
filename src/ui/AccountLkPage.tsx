/**
 * Личный кабинет: профиль, аккаунт, рейтинг, архив партий (MatchArchiveHub).
 * ПК (≥1025px): full-page dashboard. Мобильный layout — CosmicCockpit.
 */

import { useEffect, useState, useRef } from 'react';
import {
  getLocalRating,
  getPlayerProfile,
  getUnfinishedOnlineGames,
  removeUnfinishedOnlineGame,
  type UnfinishedOnlineGame,
} from '../game/persistence';
import { getAiDifficulty, setAiDifficulty } from '../game/aiSettings';
import type { AIDifficulty } from '../game/types';
import { useAuth } from '../contexts/AuthContext';
import { getMyRatingSummary } from '../lib/onlineGameSupabase';
import { getMenuIdentityStatus } from '../lib/menuIdentityStatus';
import { LK_CAST_PRIMARY, LK_CAST_HERO, preloadLkCastUrl } from '../lib/lkCastAssets';
import { CosmicCockpit, CosmicGlassClose, CosmicPhysButton } from './CosmicCockpit';
import { PlayerAvatar } from './PlayerAvatar';
import { LobbyBackButton } from './LobbyEntryActions';
import { MenuCapsuleButton } from './MenuEntryActions';
import { SupportMenuButton } from './SupportMenuButton';
import { MatchArchiveHub } from './MatchArchiveHub';
import { getLocale, useT, formatYouName, type TFunc } from '../i18n';

const PC_LK_MQ = '(min-width: 1025px)';

const AI_LEVELS: AIDifficulty[] = ['novice', 'amateur', 'expert'];

export type AccountLkFocus = 'rating' | 'matches' | null;

export type AccountLkPageProps = {
  onBack: () => void;
  displayName: string;
  avatarDataUrl?: string | null;
  onEditProfile: () => void;
  onOpenRating?: () => void;
  onOpenHistory?: () => void;
  onSignIn: () => void;
  /** ПК: войти в незавершённую комнату по коду (открывает Онлайн). */
  onJoinUnfinished?: (code: string) => void;
  /** Открыть страницу донатов. */
  onOpenSupport?: () => void;
  /** Stub: страница Подписка / Премиум. */
  onOpenPremium?: () => void;
  focusSection?: AccountLkFocus;
  onContinueOffline?: () => void;
};

function identityBadgeLabel(status: 'guest' | 'profile' | 'account', tr: TFunc): string {
  if (status === 'guest') return tr('cabinet.guest');
  if (status === 'profile') return tr('cabinet.profile');
  return tr('cabinet.account');
}

function identityTitle(status: 'guest' | 'profile' | 'account', tr: TFunc): string {
  if (status === 'guest') return tr('cabinet.identityGuest');
  if (status === 'profile') return tr('cabinet.identityProfile');
  return tr('cabinet.identityAccount');
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(getLocale() === 'en' ? 'en-GB' : 'ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso.slice(0, 10);
  }
}

function scrollToAnchor(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export function AccountLkPage({
  onBack,
  displayName,
  avatarDataUrl,
  onEditProfile,
  onSignIn,
  onJoinUnfinished,
  onOpenSupport,
  focusSection,
  onContinueOffline,
  onOpenRating,
  onOpenPremium,
}: AccountLkPageProps) {
  const t = useT();
  const { user, configured, signOut, loading: authLoading } = useAuth();
  const rating = getLocalRating();
  const [online, setOnline] = useState<{ games: number; ratedGames: number; wins: number; points: number } | null>(
    null,
  );
  const [isPc, setIsPc] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(PC_LK_MQ).matches,
  );
  const [aiLevel, setAiLevel] = useState<AIDifficulty>(() => getAiDifficulty());
  const [unfinished, setUnfinished] = useState<UnfinishedOnlineGame[]>(() => getUnfinishedOnlineGames());
  const [aiPulseId, setAiPulseId] = useState<AIDifficulty | null>(null);
  const aiPulseTimerRef = useRef<number | null>(null);

  const loggedIn = !!(configured && user?.id);
  const winRate = rating.gamesPlayed > 0 ? Math.round((rating.wins / rating.gamesPlayed) * 100) : 0;
  const avgBidAccuracy =
    rating.bidAccuracyCount > 0 ? Math.round(rating.bidAccuracySum / rating.bidAccuracyCount) : null;
  const identityStatus = getMenuIdentityStatus({
    displayName,
    avatarDataUrl,
    userEmail: user?.email ?? null,
  });
  const archiveFocus = focusSection === 'matches' ? 'matches' : null;

  useEffect(() => {
    const mq = window.matchMedia(PC_LK_MQ);
    const sync = () => setIsPc(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  useEffect(() => {
    if (!isPc) return;
    preloadLkCastUrl(LK_CAST_PRIMARY.url);
    preloadLkCastUrl(LK_CAST_HERO.url);
  }, [isPc]);

  useEffect(() => {
    return () => {
      if (aiPulseTimerRef.current != null) window.clearTimeout(aiPulseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (focusSection === 'rating') {
      scrollToAnchor('lk-stats-anchor');
    }
  }, [focusSection]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured || !user?.id) {
        setOnline(null);
        return;
      }
      try {
        const summary = await getMyRatingSummary(user.id);
        if (!cancelled) setOnline(summary);
      } catch {
        if (!cancelled) setOnline(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, user?.id]);

  const handleAiSelect = (level: AIDifficulty) => {
    setAiDifficulty(level);
    setAiLevel(level);
    setAiPulseId(level);
    if (aiPulseTimerRef.current != null) window.clearTimeout(aiPulseTimerRef.current);
    aiPulseTimerRef.current = window.setTimeout(() => {
      setAiPulseId(null);
      aiPulseTimerRef.current = null;
    }, 520);
  };

  const handleForgetUnfinished = (roomId: string) => {
    removeUnfinishedOnlineGame(roomId);
    setUnfinished(getUnfinishedOnlineGames());
  };

  const handleCapsuleRating = () => {
    scrollToAnchor('lk-stats-anchor');
  };

  const handleCapsuleHistory = () => {
    scrollToAnchor('lk-archive-hub');
  };

  const unfinishedShown = [...unfinished].reverse().slice(0, 2);

  const archiveHub = (
    <MatchArchiveHub
      userId={user?.id ?? null}
      configured={configured}
      focus={archiveFocus}
      onContinueOffline={onContinueOffline}
      onOpenRating={onOpenRating}
      onOpenPremium={onOpenPremium}
    />
  );

  if (isPc) {
    return (
      <div className="lk-page lk-page--pc">
        <div className="lk-page__pc-cast" aria-hidden="true">
          <img className="lk-page__pc-cast-img" src={LK_CAST_PRIMARY.url} alt="" decoding="async" />
          <div className="lk-page__pc-cast-scrim" />
          <div className="lk-page__pc-cast-glow" />
        </div>

        <div className="lk-page__pc-layout">
          <header className="lk-page__pc-top">
            <LobbyBackButton onClick={onBack} />
            <h1 className="lk-page__pc-title">{t('cabinet.title')}</h1>
            <span className="lk-page__pc-live" aria-hidden="true">
              <span className="lk-page__pc-live-dot" />
              {t('cabinet.live')}
            </span>
          </header>

          <div className="lk-page__pc-body">
            <section className="lk-pc-hero" aria-label={t('cabinet.profileAria')}>
              <div className="lk-pc-hero__identity">
                <div className="lk-pc-hero__avatar-ring">
                  <PlayerAvatar
                    name={displayName}
                    avatarDataUrl={avatarDataUrl}
                    avatarBgColor={getPlayerProfile().avatarBgColor}
                    sizePx={90}
                  />
                </div>
                <div className="lk-pc-hero__text">
                  <p className="lk-pc-hero__name">{formatYouName(displayName, t)}</p>
                  <p className="lk-pc-hero__sub">
                    {loggedIn && user?.email
                      ? user.email
                      : t('cabinet.noAccount')}
                  </p>
                  <span
                    className={`lk-page__badge lk-page__badge--${identityStatus === 'account' ? 'online' : identityStatus === 'profile' ? 'local' : 'guest'}`}
                    title={identityTitle(identityStatus, t)}
                  >
                    {identityBadgeLabel(identityStatus, t)}
                  </span>
                </div>
              </div>
              <div className="lk-pc-hero__cast" aria-hidden="true">
                <img className="lk-pc-hero__cast-img" src={LK_CAST_HERO.url} alt="" decoding="async" />
                <div className="lk-pc-hero__cast-veil" />
              </div>
              <div className="lk-pc-hero__capsules">
                <MenuCapsuleButton
                  variant="profile"
                  compact
                  title={t('cabinet.namePhoto')}
                  hint={t('cabinet.onDevice')}
                  onClick={onEditProfile}
                />
                {loggedIn ? (
                  <MenuCapsuleButton
                    variant="auth"
                    compact
                    title={t('cabinet.signOut')}
                    hint={t('cabinet.cloudAccount')}
                    onClick={() => {
                      void signOut();
                    }}
                  />
                ) : (
                  <MenuCapsuleButton
                    variant="auth"
                    compact
                    title={authLoading ? t('cabinet.checking') : t('cabinet.signIn')}
                    hint={t('cabinet.forOnlineCloud')}
                    onClick={onSignIn}
                  />
                )}
                <MenuCapsuleButton
                  variant="rating"
                  compact
                  title={t('menu.ratingTitle')}
                  hint={t('menu.ratingHint')}
                  onClick={onOpenRating ?? handleCapsuleRating}
                />
                <MenuCapsuleButton
                  variant="history"
                  compact
                  title={t('cabinet.history')}
                  hint={t('cabinet.allMatches')}
                  onClick={handleCapsuleHistory}
                />
                {onOpenSupport ? <SupportMenuButton onClick={onOpenSupport} /> : null}
              </div>
            </section>

            <div className="lk-pc-dash">
              <section className="lk-pc-panel lk-pc-panel--settings" aria-labelledby="lk-pc-settings">
                <header className="lk-pc-panel__head">
                  <h2 id="lk-pc-settings" className="lk-pc-panel__title">
                    {t('cabinet.settings')}
                  </h2>
                </header>
                <div className="lk-pc-theme">
                  <span className="lk-pc-theme__label">{t('cabinet.theme')}</span>
                  <span className="lk-pc-theme__chip">{t('cabinet.themeStd')}</span>
                </div>
                <p className="lk-pc-panel__hint">{t('cabinet.aiPickPill')}</p>
                <div className="lk-pc-ai" role="radiogroup" aria-label={t('ai.title')}>
                  {AI_LEVELS.map((id) => {
                    const selected = aiLevel === id;
                    const title =
                      id === 'novice' ? t('ai.novice') : id === 'amateur' ? t('ai.amateur') : t('ai.expert');
                    const hint =
                      id === 'novice' ? t('cabinet.aiSoft') : id === 'amateur' ? t('cabinet.aiPace') : t('cabinet.aiHard');
                    return (
                      <button
                        key={id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        className={[
                          'lk-pc-ai__pill',
                          `lk-pc-ai__pill--${id}`,
                          selected ? 'lk-pc-ai__pill--on' : '',
                          aiPulseId === id ? 'lk-pc-ai__pill--pulse' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => handleAiSelect(id)}
                      >
                        <span className="lk-pc-ai__ball" aria-hidden="true" />
                        <span className="lk-pc-ai__copy">
                          <span className="lk-pc-ai__title">{title}</span>
                          <span className="lk-pc-ai__hint">{hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section
                className="lk-pc-panel lk-pc-panel--stats"
                id="lk-stats-anchor"
                aria-labelledby="lk-pc-stats"
              >
                <header className="lk-pc-panel__head">
                  <h2 id="lk-pc-stats" className="lk-pc-panel__title">
                    {t('cabinet.myStats')}
                  </h2>
                </header>
                <div className="lk-pc-stats">
                  {loggedIn && online ? (
                    <>
                      <div className="lk-pc-stat">
                        <span className="lk-pc-stat__value">{online.games}</span>
                        <span className="lk-pc-stat__label">{t('cabinet.onlineGames')}</span>
                      </div>
                      <div className="lk-pc-stat">
                        <span className="lk-pc-stat__value">{online.wins}</span>
                        <span className="lk-pc-stat__label">{t('cabinet.onlineWins')}</span>
                      </div>
                      <div className="lk-pc-stat">
                        <span className="lk-pc-stat__value">{online.points}</span>
                        <span className="lk-pc-stat__label">{t('cabinet.onlinePts')}</span>
                      </div>
                    </>
                  ) : null}
                  <div className="lk-pc-stat">
                    <span className="lk-pc-stat__value">{rating.gamesPlayed}</span>
                    <span className="lk-pc-stat__label">{t('cabinet.deviceGames')}</span>
                  </div>
                  <div className="lk-pc-stat">
                    <span className="lk-pc-stat__value">
                      {rating.wins}
                      {rating.gamesPlayed > 0 ? ` · ${winRate}%` : ''}
                    </span>
                    <span className="lk-pc-stat__label">{t('cabinet.localWins')}</span>
                  </div>
                  {avgBidAccuracy != null ? (
                    <div className="lk-pc-stat">
                      <span className="lk-pc-stat__value">{avgBidAccuracy}%</span>
                      <span className="lk-pc-stat__label">{t('cabinet.bidAcc')}</span>
                    </div>
                  ) : null}
                </div>
                {onOpenRating ? (
                  <button type="button" className="lk-pc-chip__btn" onClick={onOpenRating}>
                    {t('cabinet.leaderboard')}
                  </button>
                ) : null}
              </section>

              <section className="lk-pc-panel lk-pc-panel--activity" aria-labelledby="lk-pc-activity">
                <header className="lk-pc-panel__head">
                  <h2 id="lk-pc-activity" className="lk-pc-panel__title">
                    {t('cabinet.activity')}
                  </h2>
                </header>

                <div className="lk-pc-activity-block">
                  <h3 className="lk-pc-activity-block__title">{t('cabinet.unfinishedOnline')}</h3>
                  {unfinishedShown.length === 0 ? (
                    <p className="lk-pc-activity-block__empty">{t('cabinet.empty')}</p>
                  ) : (
                    <ul className="lk-pc-chip-list">
                      {unfinishedShown.map((row) => (
                        <li key={`${row.roomId}-${row.leftAt}`} className="lk-pc-chip lk-pc-chip--warn">
                          <div className="lk-pc-chip__main">
                            <span className="lk-pc-chip__code">{row.code}</span>
                            <span className="lk-pc-chip__meta">{formatWhen(row.leftAt)}</span>
                          </div>
                          <div className="lk-pc-chip__actions">
                            {onJoinUnfinished ? (
                              <button
                                type="button"
                                className="lk-pc-chip__btn"
                                onClick={() => onJoinUnfinished(row.code)}
                              >
                                {t('cabinet.open')}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="lk-pc-chip__btn lk-pc-chip__btn--ghost"
                              onClick={() => handleForgetUnfinished(row.roomId)}
                            >
                              {t('cabinet.forget')}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>

              <section className="lk-pc-panel lk-pc-panel--archive" aria-label={t('cabinet.archiveAria')}>
                {archiveHub}
              </section>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="lk-page">
      <div className="lk-page__shell">
        <CosmicGlassClose className="lk-page__close" onClick={onBack} aria-label={t('common.close')} />
        <CosmicCockpit className="lk-page__cockpit">
          <h1 className="lk-page__title cosmic-iridescent-text">{t('cabinet.title')}</h1>

          <div className="lk-page__profile">
            <PlayerAvatar
              name={displayName}
              avatarDataUrl={avatarDataUrl}
              avatarBgColor={getPlayerProfile().avatarBgColor}
              sizePx={72}
            />
            <div className="lk-page__profile-text">
              <p className="lk-page__profile-name">{formatYouName(displayName, t)}</p>
              {loggedIn && user?.email ? (
                <p className="lk-page__profile-email">{user.email}</p>
              ) : (
                <p className="lk-page__profile-email lk-page__profile-email--guest">
                  {t('cabinet.noAccount')}
                </p>
              )}
              <span
                className={`lk-page__badge lk-page__badge--${identityStatus === 'account' ? 'online' : identityStatus === 'profile' ? 'local' : 'guest'}`}
                title={identityTitle(identityStatus, t)}
              >
                {identityBadgeLabel(identityStatus, t)}
              </span>
            </div>
          </div>

          <section className="lk-page__section lk-page__section--identity" aria-labelledby="lk-profile-title">
            <div className="lk-page__section-head">
              <h2 id="lk-profile-title" className="lk-page__section-title">
                {t('cabinet.profileSection')}
              </h2>
              <span className="lk-page__badge lk-page__badge--local">{t('cabinet.onDevice')}</span>
            </div>
            <p className="lk-page__explain">{t('cabinet.profileExplain')}</p>
            <div className="lk-page__actions lk-page__actions--in-section lk-page__actions--edit-profile">
              <CosmicPhysButton variant="primary" onClick={onEditProfile}>
                {t('cabinet.editNamePhoto')}
              </CosmicPhysButton>
            </div>
          </section>

          <section className="lk-page__section lk-page__section--account" aria-labelledby="lk-account-title">
            <div
              className={[
                'lk-page__section-head',
                'lk-page__section-head--account',
                loggedIn ? 'lk-page__section-head--account-online' : 'lk-page__section-head--account-offline',
              ].join(' ')}
            >
              <h2 id="lk-account-title" className="lk-page__section-title lk-page__section-title--framed">
                <span className="lk-page__section-title-text">{t('cabinet.accountSection')}</span>
              </h2>
              <span
                className={`lk-page__badge ${loggedIn ? 'lk-page__badge--online lk-page__badge--cloud' : 'lk-page__badge--guest lk-page__badge--noauth'}`}
              >
                {loggedIn ? (
                  <span className="lk-page__badge-dot" aria-hidden />
                ) : (
                  <span className="lk-page__badge-x" aria-hidden>
                    <span className="lk-page__badge-x-arm lk-page__badge-x-arm--a" />
                    <span className="lk-page__badge-x-arm lk-page__badge-x-arm--b" />
                  </span>
                )}
                <span className="lk-page__badge-label">{loggedIn ? t('cabinet.cloud') : t('cabinet.notSigned')}</span>
              </span>
            </div>
            <p className="lk-page__explain">
              {loggedIn ? t('cabinet.signedExplain') : t('cabinet.guestExplain')}
            </p>
            <div className="lk-page__actions lk-page__actions--in-section">
              {loggedIn ? (
                <div className="lk-page__actions-auth lk-page__actions-auth--out">
                  <CosmicPhysButton
                    variant="secondary"
                    onClick={() => {
                      void signOut();
                    }}
                  >
                    {t('cabinet.signOutAccount')}
                  </CosmicPhysButton>
                </div>
              ) : (
                <div className="lk-page__actions-auth lk-page__actions-auth--in">
                  <CosmicPhysButton variant="secondary" onClick={onSignIn}>
                    {authLoading ? t('cabinet.checking') : t('cabinet.signInAccount')}
                  </CosmicPhysButton>
                </div>
              )}
            </div>
          </section>

          <section
            className="lk-page__section"
            id="lk-stats-anchor"
            aria-labelledby="lk-stats-title"
          >
            <h2 id="lk-stats-title" className="lk-page__section-title">
              {t('cabinet.myStats')}
            </h2>
            <div className="lk-page__stats">
              {loggedIn && online && (
                <>
                  <div className="lk-page__stat">
                    <span className="lk-page__stat-label">{t('cabinet.onlineGamesStat')}</span>
                    <span className="lk-page__stat-value">{online.games}</span>
                  </div>
                  <div className="lk-page__stat">
                    <span className="lk-page__stat-label">{t('cabinet.onlineWinsStat')}</span>
                    <span className="lk-page__stat-value">{online.wins}</span>
                  </div>
                  <div className="lk-page__stat">
                    <span className="lk-page__stat-label">{t('cabinet.onlinePtsStat')}</span>
                    <span className="lk-page__stat-value">{online.points}</span>
                  </div>
                </>
              )}
              <div className="lk-page__stat">
                <span className="lk-page__stat-label">{t('cabinet.deviceGamesStat')}</span>
                <span className="lk-page__stat-value">{rating.gamesPlayed}</span>
              </div>
              <div className="lk-page__stat">
                <span className="lk-page__stat-label">{t('cabinet.deviceWinsStat')}</span>
                <span className="lk-page__stat-value">
                  {rating.wins}
                  {rating.gamesPlayed > 0 ? ` (${winRate}%)` : ''}
                </span>
              </div>
              {avgBidAccuracy != null && (
                <div className="lk-page__stat">
                  <span className="lk-page__stat-label">{t('cabinet.bidAccStat')}</span>
                  <span className="lk-page__stat-value">{avgBidAccuracy}%</span>
                </div>
              )}
            </div>
            <div className="lk-page__section-links">
              {onOpenRating ? (
                <button type="button" className="lk-page__text-link" onClick={onOpenRating}>
                  {t('cabinet.leaderboard')}
                </button>
              ) : (
                <button type="button" className="lk-page__text-link" onClick={handleCapsuleRating}>
                  {t('cabinet.myStats')}
                </button>
              )}
              <button type="button" className="lk-page__text-link" onClick={handleCapsuleHistory}>
                {t('cabinet.matchHistory')}
              </button>
              {onOpenSupport ? (
                <button type="button" className="lk-page__text-link" onClick={onOpenSupport}>
                  {t('support.title')}
                </button>
              ) : null}
            </div>
          </section>

          <section className="lk-page__section" aria-labelledby="lk-unfinished-title">
            <h2 id="lk-unfinished-title" className="lk-page__section-title">
              {t('cabinet.unfinishedOnline')}
            </h2>
            {unfinishedShown.length === 0 ? (
              <p className="lk-page__empty">{t('cabinet.empty')}</p>
            ) : (
              unfinishedShown.map((row) => (
                <div key={`${row.roomId}-${row.leftAt}`} className="lk-page__actions lk-page__actions--in-section">
                  <p className="lk-page__explain">
                    {t('cabinet.roomWhen', { code: row.code, when: formatWhen(row.leftAt) })}
                  </p>
                  <div className="lk-page__section-links">
                    {onJoinUnfinished ? (
                      <button
                        type="button"
                        className="lk-page__text-link"
                        onClick={() => onJoinUnfinished(row.code)}
                      >
                        {t('cabinet.open')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="lk-page__text-link"
                      onClick={() => handleForgetUnfinished(row.roomId)}
                    >
                      {t('cabinet.forget')}
                    </button>
                  </div>
                </div>
              ))
            )}
          </section>

          {archiveHub}

          <div className="lk-page__back">
            <CosmicPhysButton variant="secondary" onClick={onBack}>
              {t('rating.toMenu')}
            </CosmicPhysButton>
          </div>
        </CosmicCockpit>
      </div>
    </div>
  );
}
