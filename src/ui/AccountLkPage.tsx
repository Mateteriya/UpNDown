/**
 * Личный кабинет: профиль, аккаунт, рейтинг, архив партий (MatchArchiveHub).
 * ПК (≥1025px): full-page dashboard. Мобильный layout — CosmicCockpit.
 */

import { useEffect, useId, useState, useRef, type ReactNode } from 'react';
import {
  getLocalRating,
  getPlayerProfile,
  getUnfinishedOnlineGames,
  removeUnfinishedOnlineGame,
  type UnfinishedOnlineGame,
} from '../game/persistence';
import { loadLocalSkillView, toLocalSkillView, type LocalSkillView } from '../game/localSkillCache';
import { BidSkillLifetimeRow } from './BidSkillStatsPanel';
import { PlayerProgressPanel, ProgressSparkline } from './PlayerProgressPanel';
import { PlayerMilestonesPanel } from './PlayerMilestonesPanel';
import { getAiDifficulty, setAiDifficulty } from '../game/aiSettings';
import type { AIDifficulty } from '../game/types';
import { getAudioSettings, subscribeAudioSettings } from '../audio';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, getMyRatingSummary, type LeaderboardRow } from '../lib/onlineGameSupabase';
import { getMenuIdentityStatus } from '../lib/menuIdentityStatus';
import { getPartyArchive } from '../game/partyArchive';
import {
  buildPlayerProgressBundle,
  emptyPlayerProgressBundle,
  type PlayerProgressBundle,
} from '../game/playerProgressStats';
import { LK_CAST_PRIMARY, LK_CAST_HERO, preloadLkCastUrl } from '../lib/lkCastAssets';
import { authDebug, authDebugProbeSetItem, authDebugStorageSnapshot } from '../lib/authDebug';
import { CosmicCockpit, CosmicGlassClose, CosmicPhysButton } from './CosmicCockpit';
import { PlayerAvatar } from './PlayerAvatar';
import { LobbyBackButton } from './LobbyEntryActions';
import { MenuCapsuleButton } from './MenuEntryActions';
import { SupportMenuButton } from './SupportMenuButton';
import { LanguageSwitch } from './LanguageSwitch';
import { MatchArchiveHub } from './MatchArchiveHub';
import { AudioSettingsMixer, audioSettingsAreAudible } from './AudioSettingsPanel';
import { MenuSoundGlyph } from './MenuSoundGlyph';
import { MenuCapsuleCosmicTip } from './MenuCapsuleCosmicTip';
import { ResultsChipModeHelpButton, useResultsChipView } from './DealResultsSettlement';
import type { ResultsChipView } from '../game/resultsChipView';
import { getLocale, useT, formatYouName, type TFunc } from '../i18n';

const SCORE_TIP_SHOW_DELAY_MS = 320;
const STAT_TIP_SHOW_DELAY_MS = 280;

const PC_LK_MQ = '(min-width: 1025px)';

const AI_LEVELS: AIDifficulty[] = ['novice', 'amateur', 'expert'];

type LkPcStatTone = 'cyan' | 'violet' | 'magenta';

function LkPcStatTile({
  tone,
  value,
  label,
  tipText,
  tipDetail,
  railPct,
}: {
  tone: LkPcStatTone;
  value: ReactNode;
  label: string;
  tipText: string;
  tipDetail: string;
  railPct?: number | null;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const showTimerRef = useRef<number | null>(null);

  const clearShowTimer = () => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const scheduleShow = () => {
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setTipOpen(true);
    }, STAT_TIP_SHOW_DELAY_MS);
  };

  const hideTip = () => {
    clearShowTimer();
    setTipOpen(false);
  };

  useEffect(() => () => clearShowTimer(), []);

  const rail =
    railPct != null && Number.isFinite(railPct)
      ? Math.max(6, Math.min(100, railPct))
      : null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="listitem"
        className={`lk-pc-stat lk-pc-stat--${tone}`}
        aria-describedby={tipOpen ? tipId : undefined}
        aria-label={`${label}: ${typeof value === 'string' || typeof value === 'number' ? value : tipText}`}
        onPointerEnter={scheduleShow}
        onPointerLeave={hideTip}
        onFocus={scheduleShow}
        onBlur={hideTip}
      >
        <span className="lk-pc-stat__led" aria-hidden="true" />
        <span className="lk-pc-stat__value">{value}</span>
        <span className="lk-pc-stat__label">{label}</span>
        {rail != null ? (
          <span className="lk-pc-stat__rail" aria-hidden="true">
            <i style={{ width: `${rail}%` }} />
          </span>
        ) : null}
      </button>
      <MenuCapsuleCosmicTip
        open={tipOpen}
        anchorRef={btnRef}
        tipId={tipId}
        text={tipText}
        detail={tipDetail}
        wide
        preferBelow
        className="lk-pc-stat-tip"
      />
    </>
  );
}

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

function skillStyleLabel(tr: TFunc, style: LocalSkillView['style']): string {
  switch (style) {
    case 'sniper':
      return tr('cabinet.skillStyleSniper');
    case 'hunter':
      return tr('cabinet.skillStyleHunter');
    case 'cautious':
      return tr('cabinet.skillStyleCautious');
    case 'chaotic':
      return tr('cabinet.skillStyleChaotic');
    case 'learning':
      return tr('cabinet.skillStyleLearning');
    default:
      return tr('cabinet.skillStyleBalanced');
  }
}

function LkPcScoreModeRow({
  title,
  hint,
  tipDetail,
  selected,
  onSelect,
}: {
  title: string;
  hint: string;
  tipDetail: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const showTimerRef = useRef<number | null>(null);

  const clearShowTimer = () => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const scheduleShow = () => {
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setTipOpen(true);
    }, SCORE_TIP_SHOW_DELAY_MS);
  };

  const hideTip = () => {
    clearShowTimer();
    setTipOpen(false);
  };

  useEffect(() => () => clearShowTimer(), []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        role="tab"
        aria-selected={selected}
        aria-describedby={tipOpen ? tipId : undefined}
        className={['lk-pc-score-row', selected ? 'lk-pc-score-row--on' : ''].filter(Boolean).join(' ')}
        onClick={onSelect}
        onPointerEnter={scheduleShow}
        onPointerLeave={hideTip}
        onFocus={scheduleShow}
        onBlur={hideTip}
      >
        <span className="lk-pc-score-row__dot" aria-hidden="true" />
        <span className="lk-pc-score-row__copy">
          <span className="lk-pc-score-row__name">{title}</span>
          <span className="lk-pc-score-row__hint">{hint}</span>
        </span>
      </button>
      <MenuCapsuleCosmicTip
        open={tipOpen}
        anchorRef={btnRef}
        tipId={tipId}
        text={title}
        detail={tipDetail}
        wide
        className="lk-pc-score-tip"
      />
    </>
  );
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
  const [skillView, setSkillView] = useState<LocalSkillView>(() => toLocalSkillView(getLocalRating()));
  const [progress, setProgress] = useState<PlayerProgressBundle>(() => emptyPlayerProgressBundle());
  const [ladderMe, setLadderMe] = useState<(LeaderboardRow & { rank: number | null }) | null>(null);
  const [ladderMedianElo, setLadderMedianElo] = useState<number | null>(null);
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
  const [audio, setAudio] = useState(() => getAudioSettings());
  const [chipView, setChipView] = useResultsChipView();
  const [expandArchiveList, setExpandArchiveList] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<'theme' | 'sound' | 'ai' | 'score' | null>(null);
  const soundGlyphGradId = `lk-snd-${useId().replace(/:/g, '')}`;

  const loggedIn = !!(configured && user?.id);
  const winRate = skillView.winRateShown ?? 0;
  const avgBidAccuracy = skillView.accuracyPct;
  const gamesShown = skillView.matchesShown;
  const winsShown = skillView.winsShown;
  /** Онлайн из облака, если локальный архив ещё пуст по source=online */
  const progressForUi: PlayerProgressBundle =
    progress.online.matches > 0 || !online || online.games <= 0
      ? progress
      : {
          ...progress,
          online: {
            ...progress.online,
            matches: online.games,
            wins: online.wins,
            winRate: Math.round((online.wins / online.games) * 100),
          },
        };
  /** KPI онлайн не пропадают, если summary ещё грузится / упал — fallback на архив */
  const onlineKpi = loggedIn
    ? {
        games: online?.games ?? progressForUi.online.matches,
        wins: online?.wins ?? progressForUi.online.wins,
        points: online?.points ?? 0,
      }
    : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [view, archive] = await Promise.all([loadLocalSkillView(), getPartyArchive(undefined, 1500)]);
      if (cancelled) return;
      setSkillView(view);
      setProgress(buildPlayerProgressBundle(archive));
    })().catch(() => {});
    return () => {
      cancelled = true;
    };
    /* Перезагрузка при смене аккаунта / профиля — иначе мобилка может держать пустой skill. */
  }, [user?.id, displayName]);
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

  useEffect(() => subscribeAudioSettings(setAudio), []);

  useEffect(() => {
    if (focusSection === 'matches') setExpandArchiveList(true);
  }, [focusSection]);

  useEffect(() => {
    if (focusSection === 'rating') {
      scrollToAnchor('lk-stats-anchor');
    }
  }, [focusSection]);

  useEffect(() => {
    authDebug('AccountLkPage mount/auth', {
      configured,
      userId: user?.id ?? null,
      authLoading,
      storage: authDebugStorageSnapshot(),
    });
    authDebugProbeSetItem('AccountLkPage');
  }, [configured, user?.id, authLoading]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured || !user?.id) {
        authDebug('AccountLkPage rating skipped', {
          configured,
          userId: user?.id ?? null,
        });
        setOnline(null);
        setLadderMe(null);
        setLadderMedianElo(null);
        return;
      }
      authDebug('AccountLkPage getMyRatingSummary start', { userId: user.id });
      try {
        const [summary, board] = await Promise.all([
          getMyRatingSummary(user.id),
          getLeaderboard(50),
        ]);
        if (cancelled) return;
        authDebug('AccountLkPage getMyRatingSummary ok', {
          games: summary?.games ?? null,
        });
        setOnline(summary);
        setLadderMe(board.me ?? null);
        if (board.ok && board.rows.length > 0) {
          const mid = board.rows[Math.floor(board.rows.length / 2)]!;
          setLadderMedianElo(mid.elo);
        } else {
          setLadderMedianElo(null);
        }
      } catch (e) {
        authDebug('AccountLkPage getMyRatingSummary FAIL', {
          error: e instanceof Error ? e.message : String(e),
          storage: authDebugStorageSnapshot(),
        });
        if (!cancelled) {
          setOnline(null);
          setLadderMe(null);
          setLadderMedianElo(null);
        }
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
    setExpandArchiveList(true);
    scrollToAnchor('lk-archive-hub');
  };

  const unfinishedShown = [...unfinished].reverse().slice(0, 2);

  const archiveHub = (
    <MatchArchiveHub
      userId={user?.id ?? null}
      configured={configured}
      focus={archiveFocus}
      expandList={expandArchiveList}
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
            <div className="lk-page__pc-tools">
              {onOpenSupport ? (
                <SupportMenuButton className="lk-page__pc-support" onClick={onOpenSupport} />
              ) : null}
              <LanguageSwitch className="lk-page__lang" />
              <span className="lk-page__pc-live" aria-hidden="true">
                <span className="lk-page__pc-live-dot" />
                {t('cabinet.live')}
              </span>
            </div>
          </header>

          <div className="lk-page__pc-body">
            <section className="lk-pc-hero" aria-label={t('cabinet.profileAria')}>
              <div className="lk-pc-hero__identity">
                <div className="lk-pc-hero__avatar-stage">
                  <span className="lk-pc-hero__avatar-cosmos" aria-hidden="true" />
                  <button
                    type="button"
                    className="lk-pc-hero__avatar-ring"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onEditProfile();
                    }}
                    aria-label={t('cabinet.editNamePhoto')}
                  >
                    <span className="lk-pc-hero__avatar-spin" aria-hidden="true" />
                    <PlayerAvatar
                      name={displayName}
                      avatarDataUrl={avatarDataUrl}
                      avatarBgColor={getPlayerProfile().avatarBgColor}
                      sizePx={94}
                      nameBadge={loggedIn}
                    />
                    <span className="lk-pc-hero__avatar-glass" aria-hidden="true" />
                  </button>
                </div>
                <div className="lk-pc-hero__text">
                  <p className="lk-pc-hero__name" title={formatYouName(displayName, t)}>
                    {formatYouName(displayName, t)}
                  </p>
                  <p
                    className="lk-pc-hero__sub"
                    title={loggedIn && user?.email ? user.email : t('cabinet.noAccount')}
                  >
                    {loggedIn && user?.email
                      ? user.email
                      : t('cabinet.noAccount')}
                  </p>
                  {loggedIn ? (
                    <div className="lk-pc-hero__sign-out">
                      <MenuCapsuleButton
                        variant="signOut"
                        compact
                        title={t('cabinet.signOut')}
                        onClick={() => {
                          void signOut();
                        }}
                      />
                    </div>
                  ) : (
                    <div className="lk-pc-hero__sign-in">
                      <MenuCapsuleButton
                        variant="auth"
                        compact
                        title={authLoading ? t('cabinet.checking') : t('cabinet.signIn')}
                        disabled={authLoading}
                        onClick={onSignIn}
                      />
                    </div>
                  )}
                </div>
                <div className="lk-pc-hero__cast" aria-hidden="true">
                  <img className="lk-pc-hero__cast-img" src={LK_CAST_HERO.url} alt="" decoding="async" />
                  <div className="lk-pc-hero__cast-veil" />
                </div>
              </div>
              <div className="lk-pc-hero__capsules">
                <MenuCapsuleButton
                  variant="profile"
                  compact
                  title={t('cabinet.namePhoto')}
                  hint={t('cabinet.onDevice')}
                  onClick={() => onEditProfile()}
                />
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
              </div>
            </section>

            <div className="lk-pc-dash">
              <div className="lk-pc-dash__top">
              <section className="lk-pc-panel lk-pc-panel--settings" aria-labelledby="lk-pc-settings">
                <header className="lk-pc-panel__head">
                  <h2 id="lk-pc-settings" className="lk-pc-panel__title">
                    {t('cabinet.settings')}
                  </h2>
                </header>
                <div className="lk-pc-settings-glyphs" role="tablist" aria-label={t('cabinet.settings')}>
                  {(
                    [
                      {
                        id: 'theme' as const,
                        title: t('cabinet.theme'),
                        peek: t('cabinet.themeStd'),
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="12" cy="12" r="7.5" stroke="currentColor" strokeWidth="1.8" />
                            <path
                              d="M12 4.5v15M12 4.5c3.2 2.2 4.8 5 4.8 7.5S15.2 17.3 12 19.5M12 4.5C8.8 6.7 7.2 9.5 7.2 12s1.6 5.3 4.8 7.5"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />
                          </svg>
                        ),
                      },
                      {
                        id: 'sound' as const,
                        title: t('cabinet.soundFold'),
                        peek: audioSettingsAreAudible(audio)
                          ? t('cabinet.soundPeekOn')
                          : t('cabinet.soundPeekOff'),
                        icon: (
                          <MenuSoundGlyph
                            id="aurora-bars"
                            muted={!audioSettingsAreAudible(audio)}
                            gradId={soundGlyphGradId}
                          />
                        ),
                      },
                      {
                        id: 'ai' as const,
                        title: t('cabinet.aiFold'),
                        peek:
                          aiLevel === 'novice'
                            ? t('ai.novice')
                            : aiLevel === 'amateur'
                              ? t('ai.amateur')
                              : t('ai.expert'),
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none">
                            <rect x="6" y="7" width="12" height="10" rx="3" stroke="currentColor" strokeWidth="1.7" />
                            <circle cx="9.5" cy="12" r="1.2" fill="currentColor" />
                            <circle cx="14.5" cy="12" r="1.2" fill="currentColor" />
                            <path
                              d="M12 4v2.2M8 18.5 9.2 16M16 18.5 14.8 16"
                              stroke="currentColor"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                            />
                          </svg>
                        ),
                      },
                      {
                        id: 'score' as const,
                        title: t('cabinet.scoreFoldShort'),
                        peek:
                          chipView === 'accuracy_bonus' ? t('settlement.accuracy') : t('settlement.average'),
                        icon: (
                          <svg viewBox="0 0 24 24" fill="none">
                            <circle cx="8.5" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
                            <circle cx="15.5" cy="12" r="3.2" stroke="currentColor" strokeWidth="1.7" />
                            <path
                              d="M8.5 10.6h0M15.5 10.6h0"
                              stroke="currentColor"
                              strokeWidth="2.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        ),
                      },
                    ] as const
                  ).map((item) => {
                    const on = settingsTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="tab"
                        aria-selected={on}
                        aria-expanded={on}
                        className={[
                          'lk-pc-setbtn',
                          `lk-pc-setbtn--${item.id}`,
                          on ? 'is-on' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => setSettingsTab((v) => (v === item.id ? null : item.id))}
                      >
                        <span className="lk-pc-setbtn__flare" aria-hidden="true" />
                        <span className="lk-pc-setbtn__glyph" aria-hidden="true">
                          {item.icon}
                        </span>
                        <span className="lk-pc-setbtn__copy">
                          <span className="lk-pc-setbtn__title">{item.title}</span>
                          <span className="lk-pc-setbtn__peek">{item.peek}</span>
                        </span>
                        <span className="lk-pc-setbtn__orb" aria-hidden="true">
                          <i />
                          <i />
                          <i />
                        </span>
                      </button>
                    );
                  })}
                </div>

                {settingsTab === 'theme' ? (
                  <div className="lk-pc-settings-pane" role="tabpanel">
                    <div className="lk-pc-theme">
                      <span className="lk-pc-theme__label">{t('cabinet.theme')}</span>
                      <span className="lk-pc-theme__chip">{t('cabinet.themeStd')}</span>
                    </div>
                  </div>
                ) : null}
                {settingsTab === 'sound' ? (
                  <div className="lk-pc-settings-pane" role="tabpanel">
                    <AudioSettingsMixer embedded />
                  </div>
                ) : null}
                {settingsTab === 'ai' ? (
                  <div className="lk-pc-settings-pane lk-pc-settings-pane--ai" role="tabpanel">
                    <div className="lk-pc-ai" role="radiogroup" aria-label={t('ai.title')}>
                      {AI_LEVELS.map((id) => {
                        const selected = aiLevel === id;
                        const title =
                          id === 'novice' ? t('ai.novice') : id === 'amateur' ? t('ai.amateur') : t('ai.expert');
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
                            <span className="lk-pc-ai__dot" aria-hidden="true" />
                            <span className="lk-pc-ai__title">{title}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ) : null}
                {settingsTab === 'score' ? (
                  <div className="lk-pc-settings-pane lk-pc-settings-pane--score" role="tabpanel">
                    <div className="lk-pc-score-lead-row">
                      <p className="lk-pc-score-lead">{t('cabinet.scorePickLead')}</p>
                      <div className="lk-pc-score-help-card">
                        <ResultsChipModeHelpButton chipView={chipView} className="lk-pc-score-help-btn" />
                        <span className="lk-pc-score-help-peek">{t('cabinet.scoreHelpPeek')}</span>
                      </div>
                    </div>
                    <div className="lk-pc-score-rows" role="tablist" aria-label={t('settlement.chipModesAria')}>
                      {(
                        [
                          {
                            id: 'accuracy_bonus' as ResultsChipView,
                            title: t('settlement.accuracy'),
                            hint: t('cabinet.scoreAccHint'),
                            tipDetail: t('cabinet.scoreTipAccDetail'),
                          },
                          {
                            id: 'vs_average' as ResultsChipView,
                            title: t('settlement.average'),
                            hint: t('cabinet.scoreAvgHint'),
                            tipDetail: t('cabinet.scoreTipAvgDetail'),
                          },
                        ] as const
                      ).map((row) => (
                        <LkPcScoreModeRow
                          key={row.id}
                          title={row.title}
                          hint={row.hint}
                          tipDetail={row.tipDetail}
                          selected={chipView === row.id}
                          onSelect={() => setChipView(row.id)}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </section>

              <section className="lk-pc-panel lk-pc-panel--activity" aria-labelledby="lk-pc-activity">
                <header className="lk-pc-panel__head">
                  <h2 id="lk-pc-activity" className="lk-pc-panel__title">
                    {t('cabinet.activity')}
                  </h2>
                </header>
                <div className="lk-pc-activity-card">
                  <span className="lk-pc-activity-card__flare" aria-hidden="true" />
                  <p className="lk-pc-activity-card__title">{t('cabinet.unfinishedOnline')}</p>
                  {unfinishedShown.length === 0 ? (
                    <div className="lk-pc-activity-card__idle">
                      <span className="lk-pc-activity-card__orb" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      <p className="lk-pc-activity-card__hint">{t('cabinet.activityIdleHint')}</p>
                    </div>
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
              </div>

              <section
                className={[
                  'lk-pc-panel lk-pc-panel--stats',
                  statsOpen ? 'lk-pc-panel--stats-open' : 'lk-pc-panel--stats-collapsed',
                ].join(' ')}
                id="lk-stats-anchor"
                aria-labelledby="lk-pc-stats"
              >
                <header className="lk-pc-panel__head lk-pc-panel__head--fold">
                  <h2 id="lk-pc-stats" className="lk-pc-panel__title">
                    {t('cabinet.myStats')}
                  </h2>
                  <button
                    type="button"
                    className={[
                      'lk-pc-panel__fold-check',
                      statsOpen ? 'lk-pc-panel__fold-check--on' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-expanded={statsOpen}
                    aria-controls="lk-pc-stats-body"
                    aria-label={statsOpen ? t('cabinet.collapseStats') : t('cabinet.expandStats')}
                    title={statsOpen ? t('cabinet.collapseStats') : t('cabinet.expandStats')}
                    onClick={() => setStatsOpen((v) => !v)}
                  >
                    <span className="lk-pc-panel__fold-orb" aria-hidden="true">
                      <i />
                      <i />
                      <i />
                    </span>
                  </button>
                </header>
                {!statsOpen ? (
                  <button
                    type="button"
                    className="lk-pc-stats-preview"
                    onClick={() => setStatsOpen(true)}
                    aria-expanded={false}
                    aria-controls="lk-pc-stats-body"
                  >
                    <div className="lk-pc-stats-preview__chips">
                      <span className="lk-pc-stats-preview__chip lk-pc-stats-preview__chip--cyan">
                        <span className="lk-pc-stats-preview__n">{progressForUi.offline.matches}</span>
                        <span className="lk-pc-stats-preview__l">{t('cabinet.progOffline')}</span>
                      </span>
                      <span className="lk-pc-stats-preview__chip lk-pc-stats-preview__chip--magenta">
                        <span className="lk-pc-stats-preview__n">
                          {onlineKpi ? onlineKpi.games : progressForUi.online.matches}
                        </span>
                        <span className="lk-pc-stats-preview__l">{t('cabinet.progOnline')}</span>
                      </span>
                      <span className="lk-pc-stats-preview__chip lk-pc-stats-preview__chip--violet">
                        <span className="lk-pc-stats-preview__n">
                          {skillView.accuracyPct != null ? `${skillView.accuracyPct}%` : '—'}
                        </span>
                        <span className="lk-pc-stats-preview__l">{t('cabinet.skillHeroLabel')}</span>
                      </span>
                      <span className="lk-pc-stats-preview__chip lk-pc-stats-preview__chip--gold">
                        <span className="lk-pc-stats-preview__n">
                          {ladderMe?.elo != null ? ladderMe.elo : gamesShown}
                        </span>
                        <span className="lk-pc-stats-preview__l">
                          {ladderMe?.elo != null ? 'ELO' : t('cabinet.deviceGames')}
                        </span>
                      </span>
                    </div>

                    {(skillView.bestExactStreak > 0 || skillView.style !== 'learning') && (
                      <div className="lk-pc-stats-preview__highlights">
                        {skillView.bestExactStreak > 0 ? (
                          <span
                            className={[
                              'lk-pc-stats-preview__streak',
                              skillView.currentExactStreak > 0
                                ? 'lk-pc-stats-preview__streak--live'
                                : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <span className="lk-pc-stats-preview__streak-n">
                              {skillView.bestExactStreak}
                            </span>
                            <span className="lk-pc-stats-preview__streak-copy">
                              <strong>{t('cabinet.statsPreviewStreak')}</strong>
                              <em>{t('cabinet.skillStreakHint')}</em>
                            </span>
                            {skillView.currentExactStreak > 0 ? (
                              <span className="lk-pc-stats-preview__streak-live">
                                {t('cabinet.skillStreakLive', { n: skillView.currentExactStreak })}
                              </span>
                            ) : null}
                          </span>
                        ) : null}
                        {skillView.style !== 'learning' ? (
                          <span className="lk-pc-stats-preview__style">
                            <span className="lk-pc-stats-preview__style-l">
                              {t('cabinet.statsPreviewStyle')}
                            </span>
                            <span className="lk-pc-stats-preview__style-n">
                              {skillStyleLabel(t, skillView.style)}
                            </span>
                          </span>
                        ) : null}
                      </div>
                    )}

                    <div className="lk-pc-stats-preview__dash">
                      {skillView.dealTotal > 0 ? (
                        <div className="lk-pc-stats-preview__bar" aria-hidden="true">
                          <i
                            className="lk-pc-stats-preview__seg lk-pc-stats-preview__seg--exact"
                            style={{ flex: skillView.exactPct || 0.001 }}
                          />
                          <i
                            className="lk-pc-stats-preview__seg lk-pc-stats-preview__seg--under"
                            style={{ flex: skillView.underPct || 0.001 }}
                          />
                          <i
                            className="lk-pc-stats-preview__seg lk-pc-stats-preview__seg--over"
                            style={{ flex: skillView.overPct || 0.001 }}
                          />
                        </div>
                      ) : null}
                      {(() => {
                        const accSeries = progressForUi.recentSeries
                          .map((p) => p.accuracyPct)
                          .filter((v): v is number => v != null);
                        if (accSeries.length < 2) return null;
                        return (
                          <div className="lk-pc-stats-preview__spark">
                            <ProgressSparkline values={accSeries.slice(-12)} compact />
                            <span className="lk-pc-stats-preview__spark-l">
                              {t('cabinet.statsPreviewTrend')}
                              {progressForUi.trend.accuracyDelta != null
                                ? ` ${
                                    progressForUi.trend.accuracyDelta > 0
                                      ? t('cabinet.progTrendAccShortUp', {
                                          n: progressForUi.trend.accuracyDelta,
                                        })
                                      : progressForUi.trend.accuracyDelta < 0
                                        ? t('cabinet.progTrendAccShortDown', {
                                            n: Math.abs(progressForUi.trend.accuracyDelta),
                                          })
                                        : t('cabinet.progTrendAccShortFlat')
                                  }`
                                : ''}
                            </span>
                            <div className="lk-pc-stats-preview__mini-bars" aria-hidden="true">
                              {accSeries.slice(-8).map((v, i) => (
                                <i
                                  key={i}
                                  style={{ height: `${Math.max(14, Math.min(100, v))}%` }}
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <span className="lk-pc-stats-preview__go">
                      <span className="lk-pc-stats-preview__go-stars" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                      {t('cabinet.statsOpenCta')}
                    </span>
                    <span className="lk-pc-stats-preview__hint">{t('cabinet.statsPreviewHint')}</span>
                  </button>
                ) : (
                  <div id="lk-pc-stats-body" className="lk-pc-panel__fold-body">
                    <div className="lk-pc-stats-stack">
                      <div className="lk-pc-stats lk-pc-stats--telemetry" role="list">
                      {onlineKpi ? (
                        <>
                          <LkPcStatTile
                            tone="cyan"
                            value={onlineKpi.games}
                            label={t('cabinet.onlineGames')}
                            tipText={t('cabinet.tipOnlineGames')}
                            tipDetail={t('cabinet.tipOnlineGamesDetail')}
                            railPct={
                              onlineKpi.games > 0 ? (onlineKpi.wins / onlineKpi.games) * 100 : 0
                            }
                          />
                          <LkPcStatTile
                            tone="magenta"
                            value={onlineKpi.wins}
                            label={t('cabinet.onlineWins')}
                            tipText={t('cabinet.tipOnlineWins')}
                            tipDetail={t('cabinet.tipOnlineWinsDetail')}
                            railPct={
                              onlineKpi.games > 0 ? (onlineKpi.wins / onlineKpi.games) * 100 : 0
                            }
                          />
                          <LkPcStatTile
                            tone="violet"
                            value={onlineKpi.points}
                            label={t('cabinet.onlinePts')}
                            tipText={t('cabinet.tipOnlinePts')}
                            tipDetail={t('cabinet.tipOnlinePtsDetail')}
                          />
                        </>
                      ) : null}
                      <LkPcStatTile
                        tone="cyan"
                        value={progressForUi.offline.matches}
                        label={t('cabinet.statCardOfflineGames')}
                        tipText={t('cabinet.tipOfflineGames')}
                        tipDetail={t('cabinet.tipOfflineGamesDetail')}
                        railPct={
                          progressForUi.offline.matches > 0
                            ? (progressForUi.offline.wins / progressForUi.offline.matches) * 100
                            : 0
                        }
                      />
                      <LkPcStatTile
                        tone="violet"
                        value={progressForUi.offline.wins}
                        label={t('cabinet.statCardOfflineWins')}
                        tipText={t('cabinet.tipOfflineWins')}
                        tipDetail={t('cabinet.tipOfflineWinsDetail')}
                      />
                      <LkPcStatTile
                        tone="violet"
                        value={gamesShown}
                        label={t('cabinet.deviceGames')}
                        tipText={t('cabinet.tipDeviceGames')}
                        tipDetail={t('cabinet.tipDeviceGamesDetail')}
                      />
                      <LkPcStatTile
                        tone="magenta"
                        value={
                          <>
                            {winsShown}
                            {gamesShown > 0 ? ` · ${winRate}%` : ''}
                          </>
                        }
                        label={t('cabinet.localWins')}
                        tipText={t('cabinet.tipLocalWins')}
                        tipDetail={t('cabinet.tipLocalWinsDetail')}
                        railPct={winRate}
                      />
                      {avgBidAccuracy != null && skillView.dealTotal <= 0 ? (
                        <LkPcStatTile
                          tone="cyan"
                          value={`${avgBidAccuracy}%`}
                          label={t('cabinet.bidAcc')}
                          tipText={t('cabinet.tipBidAcc')}
                          tipDetail={t('cabinet.tipBidAccDetail')}
                          railPct={avgBidAccuracy}
                        />
                      ) : null}
                      </div>
                      <PlayerMilestonesPanel
                        compact
                        skillView={skillView}
                        onlineWins={onlineKpi?.wins ?? progressForUi.online.wins}
                        elo={ladderMe?.elo ?? null}
                        userId={user?.id}
                      />
                    </div>
                    <BidSkillLifetimeRow view={skillView} showPremiumHint />
                    <PlayerProgressPanel
                      progress={progressForUi}
                      ladderMe={ladderMe}
                      ladderMedianElo={ladderMedianElo}
                      onOpenLeaderboard={onOpenRating}
                    />
                    {onOpenRating ? (
                      <button type="button" className="lk-pc-chip__btn" onClick={onOpenRating}>
                        {t('cabinet.leaderboard')}
                      </button>
                    ) : null}
                  </div>
                )}
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
        <LanguageSwitch className="lk-page__lang" />
        <CosmicGlassClose className="lk-page__close" onClick={onBack} aria-label={t('common.close')} />
        <CosmicCockpit className="lk-page__cockpit">
          <h1 className="lk-page__title cosmic-iridescent-text">{t('cabinet.title')}</h1>

          <div className="lk-page__profile">
            <PlayerAvatar
              name={displayName}
              avatarDataUrl={avatarDataUrl}
              avatarBgColor={getPlayerProfile().avatarBgColor}
              sizePx={72}
              nameBadge={loggedIn}
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
            <div className="lk-stat-cards" aria-label={t('cabinet.myStats')}>
              {onlineKpi ? (
                <>
                  <div className="lk-stat-card">
                    <span className="lk-stat-card__value">{onlineKpi.games}</span>
                    <span className="lk-stat-card__label">{t('cabinet.onlineGamesStat')}</span>
                    <span className="lk-stat-card__meter" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, onlineKpi.games * 8)}%` }} />
                    </span>
                  </div>
                  <div className="lk-stat-card lk-stat-card--ember">
                    <span className="lk-stat-card__value">{onlineKpi.wins}</span>
                    <span className="lk-stat-card__label">{t('cabinet.onlineWinsStat')}</span>
                    <span className="lk-stat-card__meter" aria-hidden="true">
                      <i
                        style={{
                          width: `${
                            onlineKpi.games > 0
                              ? Math.round((onlineKpi.wins / onlineKpi.games) * 100)
                              : 0
                          }%`,
                        }}
                      />
                    </span>
                  </div>
                  <div className="lk-stat-card lk-stat-card--aurora">
                    <span className="lk-stat-card__value">{onlineKpi.points}</span>
                    <span className="lk-stat-card__label">{t('cabinet.onlinePtsStat')}</span>
                    <span className="lk-stat-card__meter" aria-hidden="true">
                      <i style={{ width: `${Math.min(100, Math.abs(onlineKpi.points) / 20)}%` }} />
                    </span>
                  </div>
                </>
              ) : null}
              <div className="lk-stat-card lk-stat-card--gold">
                <span className="lk-stat-card__value">{progressForUi.offline.matches}</span>
                <span className="lk-stat-card__label">{t('cabinet.statCardOfflineGames')}</span>
                <span className="lk-stat-card__meter" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, progressForUi.offline.matches * 10)}%` }} />
                </span>
              </div>
              <div className="lk-stat-card lk-stat-card--ember">
                <span className="lk-stat-card__value">{progressForUi.offline.wins}</span>
                <span className="lk-stat-card__label">{t('cabinet.statCardOfflineWins')}</span>
                <span className="lk-stat-card__meter" aria-hidden="true">
                  <i
                    style={{
                      width: `${
                        progressForUi.offline.matches > 0
                          ? Math.round((progressForUi.offline.wins / progressForUi.offline.matches) * 100)
                          : 0
                      }%`,
                    }}
                  />
                </span>
              </div>
              <div className="lk-stat-card">
                <span className="lk-stat-card__value">{gamesShown}</span>
                <span className="lk-stat-card__label">{t('cabinet.deviceGamesStat')}</span>
                <span className="lk-stat-card__meter" aria-hidden="true">
                  <i style={{ width: `${Math.min(100, gamesShown * 8)}%` }} />
                </span>
              </div>
              <div className="lk-stat-card lk-stat-card--aurora">
                <span className="lk-stat-card__value">
                  {winsShown}
                  {gamesShown > 0 ? ` · ${winRate}%` : ''}
                </span>
                <span className="lk-stat-card__label">{t('cabinet.deviceWinsStat')}</span>
                <span className="lk-stat-card__meter" aria-hidden="true">
                  <i style={{ width: `${winRate}%` }} />
                </span>
              </div>
            </div>
            <PlayerMilestonesPanel
              skillView={skillView}
              onlineWins={onlineKpi?.wins ?? progressForUi.online.wins}
              elo={ladderMe?.elo ?? null}
              userId={user?.id}
            />
            <BidSkillLifetimeRow view={skillView} showPremiumHint />
            <PlayerProgressPanel
              progress={progressForUi}
              ladderMe={ladderMe}
              ladderMedianElo={ladderMedianElo}
              onOpenLeaderboard={onOpenRating}
            />
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
