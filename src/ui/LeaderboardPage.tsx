/**
 * Экран «Рейтинг»: ELO-лайт топ + публичный Зал славы.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import {
  getHallOfFame,
  getLeaderboard,
  type HallOfFameKind,
  type HallOfFameResult,
  type HallOfFameScope,
  type LeaderboardResult,
} from '../lib/onlineGameSupabase';
import { CosmicCockpit, CosmicGlassClose } from './CosmicCockpit';
import { formatYouName, getLocale, useT, type TFunc } from '../i18n';

export type LeaderboardPageProps = {
  /** Крестик: назад туда, откуда открыли (ЛК или меню). */
  onBack: () => void;
  /** Явная кнопка «в главное меню». */
  onGoToMenu?: () => void;
  onSignIn?: () => void;
  onOpenAccount?: () => void;
};

function winRate(wins: number, games: number): string {
  if (games <= 0) return '—';
  return `${Math.round((wins / games) * 100)}%`;
}

function gamesLabel(n: number, tr: TFunc): string {
  if (getLocale() === 'en') return n === 1 ? tr('rating.game1') : tr('rating.games');
  if (n === 1) return tr('rating.game1');
  if (n >= 2 && n <= 4) return tr('rating.game2');
  return tr('rating.games');
}

type BoardTab = 'elo' | 'hof';

export function LeaderboardPage({ onBack, onGoToMenu, onSignIn, onOpenAccount }: LeaderboardPageProps) {
  const t = useT();
  const { user, configured } = useAuth();
  const [tab, setTab] = useState<BoardTab>('elo');
  const [data, setData] = useState<LeaderboardResult | null>(null);
  const [hof, setHof] = useState<HallOfFameResult | null>(null);
  const [hofKind, setHofKind] = useState<HallOfFameKind>('party_score');
  const [hofScope, setHofScope] = useState<HallOfFameScope>('rated_online');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured || !user?.id) {
        if (!cancelled) {
          setData(null);
          setLoading(false);
        }
        return;
      }
      setLoading(true);
      try {
        const res = await getLeaderboard(50);
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) {
          setData({
            ok: false,
            error: t('rating.loadFail'),
            ladder_kind: 'open',
            season_id: '',
            rows: [],
            me: null,
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, user?.id, t]);

  useEffect(() => {
    if (tab !== 'hof' || !configured) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await getHallOfFame(hofKind, hofScope, 25);
        if (!cancelled) setHof(res);
      } catch {
        if (!cancelled) {
          setHof({
            ok: false,
            kind: hofKind,
            scope: hofScope,
            rows: [],
            error: t('rating.loadFail'),
          });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tab, configured, hofKind, hofScope, t]);

  const loggedIn = !!(configured && user?.id);

  return (
    <div className="lk-page leaderboard-page">
      <div className="leaderboard-page__stage">
        <div className="lk-page__shell">
          <span className="leaderboard-page__bezel" aria-hidden />
          <span className="leaderboard-page__corner leaderboard-page__corner--tl" aria-hidden />
          <span className="leaderboard-page__corner leaderboard-page__corner--tr" aria-hidden />
          <span className="leaderboard-page__corner leaderboard-page__corner--bl" aria-hidden />
          <span className="leaderboard-page__corner leaderboard-page__corner--br" aria-hidden />
          <CosmicGlassClose className="leaderboard-page__close" onClick={onBack} label={t('common.close')} />
          <CosmicCockpit className="lk-page__cockpit" dense>
            <h1 className="leaderboard-page__title">{t('rating.title')}</h1>
            <p className="leaderboard-page__lead">{t('rating.lead')}</p>

            <div className="leaderboard-page__tabs" role="tablist" aria-label={t('rating.title')}>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'elo'}
                className={['leaderboard-page__tab', tab === 'elo' ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => setTab('elo')}
              >
                ELO
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'hof'}
                className={['leaderboard-page__tab', tab === 'hof' ? 'is-active' : ''].filter(Boolean).join(' ')}
                onClick={() => setTab('hof')}
              >
                {t('cabinet.hofTitle')}
              </button>
            </div>

            {!configured ? (
              <p className="leaderboard-page__empty">{t('rating.serverOff')}</p>
            ) : tab === 'elo' && !loggedIn ? (
              <div className="leaderboard-page__gate">
                <p className="leaderboard-page__empty">{t('rating.signInLead')}</p>
                {onSignIn ? (
                  <button type="button" className="leaderboard-page__home" onClick={onSignIn}>
                    <span className="leaderboard-page__home-glow" aria-hidden />
                    <span className="leaderboard-page__home-label">{t('cabinet.signIn')}</span>
                  </button>
                ) : null}
              </div>
            ) : loading ? (
              <p className="leaderboard-page__empty">{t('rating.loading')}</p>
            ) : tab === 'elo' && data && !data.ok ? (
              <p className="leaderboard-page__empty">
                {data.error?.includes('updown_get_leaderboard') || data.error?.includes('does not exist')
                  ? t('rating.migration')
                  : data.error || t('rating.loadError')}
              </p>
            ) : tab === 'elo' ? (
              <>
                {data?.me ? (
                  <div className="leaderboard-page__me">
                    <span className="leaderboard-page__me-kicker">{t('rating.you')}</span>
                    <div className="leaderboard-page__beam leaderboard-page__beam--you">
                      <span className="leaderboard-page__rank">
                        {data.me.rank != null ? `#${data.me.rank}` : '—'}
                      </span>
                      <span className="leaderboard-page__name">
                        {formatYouName(data.me.display_name, t)}
                      </span>
                      <span className="leaderboard-page__elo">{data.me.elo}</span>
                    </div>
                    <span className="leaderboard-page__meta">
                      {data.me.games} {gamesLabel(data.me.games, t)}
                      {' · '}
                      {t('rating.winsPct', { pct: winRate(data.me.wins, data.me.games) })}
                    </span>
                  </div>
                ) : (
                  <p className="leaderboard-page__me-hint">{t('rating.eloHint')}</p>
                )}

                <ol className="leaderboard-page__list">
                  {(data?.rows ?? []).length === 0 ? (
                    <li className="leaderboard-page__empty">{t('rating.empty')}</li>
                  ) : (
                    (data?.rows ?? []).map((row) => {
                      const isMe = row.user_id === user?.id;
                      const isLeader = Number(row.rank) === 1;
                      return (
                        <li
                          key={row.user_id}
                          className={[
                            'leaderboard-page__row',
                            isLeader ? 'leaderboard-page__row--leader' : '',
                            isMe ? 'leaderboard-page__row--me' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <span className="leaderboard-page__rank">#{row.rank}</span>
                          {isLeader ? (
                            <span className="leaderboard-page__star" aria-hidden>
                              ✦
                            </span>
                          ) : null}
                          <span className="leaderboard-page__name">{row.display_name}</span>
                          <span className="leaderboard-page__elo">{row.elo}</span>
                          <span className="leaderboard-page__meta">
                            {row.games} {gamesLabel(row.games, t)}
                            {' · '}
                            {t('rating.winsPct', { pct: winRate(row.wins, row.games) })}
                          </span>
                        </li>
                      );
                    })
                  )}
                </ol>
              </>
            ) : (
              <div className="leaderboard-page__hof">
                <p className="leaderboard-page__hof-eyebrow">{t('cabinet.hofEyebrow')}</p>
                <div className="leaderboard-page__hof-filters">
                  <label>
                    <span className="visually-hidden">{t('cabinet.hofKindScore')}</span>
                    <select
                      value={hofKind}
                      onChange={(e) => setHofKind(e.target.value as HallOfFameKind)}
                    >
                      <option value="party_score">{t('cabinet.hofKindScore')}</option>
                      <option value="exact_deal">{t('cabinet.hofKindExact')}</option>
                      <option value="perfect_party">{t('cabinet.hofKindPerfect')}</option>
                    </select>
                  </label>
                  <label>
                    <span className="visually-hidden">{t('cabinet.hofScopeRated')}</span>
                    <select
                      value={hofScope}
                      onChange={(e) => setHofScope(e.target.value as HallOfFameScope)}
                    >
                      <option value="rated_online">{t('cabinet.hofScopeRated')}</option>
                      <option value="online_all">{t('cabinet.hofScopeOnline')}</option>
                      <option value="offline_cloud">{t('cabinet.hofScopeOffline')}</option>
                    </select>
                  </label>
                </div>
                {hofScope === 'offline_cloud' ? (
                  <p className="leaderboard-page__me-hint">{t('cabinet.hofOfflineNote')}</p>
                ) : null}
                {hof && !hof.ok ? (
                  <p className="leaderboard-page__empty">
                    {hof.error?.includes('does not exist')
                      ? t('rating.migration')
                      : hof.error || t('rating.loadError')}
                  </p>
                ) : (
                  <ol className="leaderboard-page__list">
                    {(hof?.rows ?? []).length === 0 ? (
                      <li className="leaderboard-page__empty">{t('cabinet.hofEmpty')}</li>
                    ) : (
                      (hof?.rows ?? []).map((row) => {
                        const isMe = row.user_id === user?.id;
                        return (
                          <li
                            key={`${row.user_id}-${row.rank}-${row.created_at}`}
                            className={[
                              'leaderboard-page__row',
                              isMe ? 'leaderboard-page__row--me' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                          >
                            <span className="leaderboard-page__rank">#{row.rank}</span>
                            <span className="leaderboard-page__name">{row.display_name}</span>
                            <span className="leaderboard-page__elo">{row.value}</span>
                            <span className="leaderboard-page__meta">
                              {row.tier ? row.tier : row.kind}
                              {row.source === 'offline' ? ` · ${t('cabinet.recordsSourceOffline')}` : ''}
                            </span>
                          </li>
                        );
                      })
                    )}
                  </ol>
                )}
              </div>
            )}

            {onOpenAccount ? (
              <button type="button" className="leaderboard-page__link" onClick={onOpenAccount}>
                {t('rating.myStats')}
              </button>
            ) : null}

            {tab === 'elo' ? (
              <details className="leaderboard-page__how">
                <summary>{t('rating.howElo')}</summary>
                <p>{t('rating.howEloBody')}</p>
              </details>
            ) : null}

            <button type="button" className="leaderboard-page__home leaderboard-page__home--menu" onClick={onGoToMenu ?? onBack}>
              <span className="leaderboard-page__home-glow" aria-hidden />
              <span className="leaderboard-page__home-label">{t('rating.toMenu')}</span>
            </button>
          </CosmicCockpit>
        </div>
      </div>
    </div>
  );
}
