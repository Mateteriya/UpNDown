/**
 * Экран «Рейтинг»: ELO-лайт топ rated онлайн.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, type LeaderboardResult } from '../lib/onlineGameSupabase';
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

export function LeaderboardPage({ onBack, onGoToMenu, onSignIn, onOpenAccount }: LeaderboardPageProps) {
  const t = useT();
  const { user, configured } = useAuth();
  const [data, setData] = useState<LeaderboardResult | null>(null);
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

            {!configured ? (
              <p className="leaderboard-page__empty">{t('rating.serverOff')}</p>
            ) : !loggedIn ? (
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
            ) : data && !data.ok ? (
              <p className="leaderboard-page__empty">
                {data.error?.includes('updown_get_leaderboard') || data.error?.includes('does not exist')
                  ? t('rating.migration')
                  : data.error || t('rating.loadError')}
              </p>
            ) : (
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
            )}

            {onOpenAccount ? (
              <button type="button" className="leaderboard-page__link" onClick={onOpenAccount}>
                {t('rating.myStats')}
              </button>
            ) : null}

            <details className="leaderboard-page__how">
              <summary>{t('rating.howElo')}</summary>
              <p>{t('rating.howEloBody')}</p>
            </details>

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
