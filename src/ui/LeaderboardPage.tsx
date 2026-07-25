/**
 * Экран «Рейтинг»: ELO-лайт топ rated онлайн.
 */

import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getLeaderboard, type LeaderboardResult } from '../lib/onlineGameSupabase';
import { CosmicCockpit, CosmicGlassClose, CosmicPhysButton } from './CosmicCockpit';

export type LeaderboardPageProps = {
  onBack: () => void;
  onSignIn?: () => void;
  onOpenAccount?: () => void;
};

function winRate(wins: number, games: number): string {
  if (games <= 0) return '—';
  return `${Math.round((wins / games) * 100)}%`;
}

export function LeaderboardPage({ onBack, onSignIn, onOpenAccount }: LeaderboardPageProps) {
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
            error: 'Не удалось загрузить рейтинг',
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
  }, [configured, user?.id]);

  const loggedIn = !!(configured && user?.id);

  return (
    <div className="lk-page leaderboard-page">
      <div className="lk-page__shell">
        <CosmicGlassClose className="lk-page__close" onClick={onBack} aria-label="Закрыть" />
        <CosmicCockpit className="lk-page__cockpit">
          <h1 className="lk-page__title cosmic-iridescent-text">Рейтинг</h1>
          <p className="leaderboard-page__lead">
            ELO по завершённым <strong>онлайн</strong> партиям (rated). Офлайн с ИИ в таблицу не
            входит.
          </p>

          {!configured ? (
            <p className="lk-page__empty">Сервер не настроен.</p>
          ) : !loggedIn ? (
            <div className="leaderboard-page__gate">
              <p className="lk-page__empty">Войдите в аккаунт, чтобы видеть таблицу лидеров.</p>
              {onSignIn ? (
                <CosmicPhysButton variant="primary" onClick={onSignIn}>
                  Войти
                </CosmicPhysButton>
              ) : null}
            </div>
          ) : loading ? (
            <p className="lk-page__empty">Загрузка…</p>
          ) : data && !data.ok ? (
            <p className="lk-page__empty">
              {data.error?.includes('updown_get_leaderboard') || data.error?.includes('does not exist')
                ? 'На Supabase не применена миграция рейтинга (APPLY-PLAYER-RATINGS-PROD.sql).'
                : data.error || 'Ошибка загрузки'}
            </p>
          ) : (
            <>
              {data?.me ? (
                <div className="leaderboard-page__me">
                  <span className="leaderboard-page__me-label">Вы</span>
                  <span className="leaderboard-page__me-body">
                    {data.me.rank != null ? `#${data.me.rank}` : 'вне топа'}
                    {' · '}
                    ELO {data.me.elo}
                    {' · '}
                    {data.me.games} игр · {winRate(data.me.wins, data.me.games)} побед
                  </span>
                </div>
              ) : (
                <p className="leaderboard-page__me-hint">
                  Сыграйте rated онлайн до конца — появится ваш ELO.
                </p>
              )}

              <ol className="leaderboard-page__list">
                {(data?.rows ?? []).length === 0 ? (
                  <li className="lk-page__empty">Пока никого в рейтинге. Будьте первыми.</li>
                ) : (
                  (data?.rows ?? []).map((row) => {
                    const isMe = row.user_id === user?.id;
                    return (
                      <li
                        key={row.user_id}
                        className={`leaderboard-page__row${isMe ? ' leaderboard-page__row--me' : ''}`}
                      >
                        <span className="leaderboard-page__rank">#{row.rank}</span>
                        <span className="leaderboard-page__name">{row.display_name}</span>
                        <span className="leaderboard-page__elo">{row.elo}</span>
                        <span className="leaderboard-page__meta">
                          {row.games} · {winRate(row.wins, row.games)}
                        </span>
                      </li>
                    );
                  })
                )}
              </ol>
            </>
          )}

          {onOpenAccount ? (
            <button type="button" className="lk-page__text-link" onClick={onOpenAccount}>
              Моя статистика и история партий
            </button>
          ) : null}

          <p className="leaderboard-page__footnote">
            Хотите полную статистику офлайн-партий с ИИ, прогресс и облачную историю на всех
            устройствах — играйте <strong>в своём аккаунте</strong>: локальная история на устройстве
            дополнится сохранением в облако под вашим логином.
          </p>

          <CosmicPhysButton variant="secondary" onClick={onBack}>
            ← В главное меню
          </CosmicPhysButton>
        </CosmicCockpit>
      </div>
    </div>
  );
}
