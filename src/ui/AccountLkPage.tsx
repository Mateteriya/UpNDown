/**
 * Личный кабинет: профиль (локально), аккаунт (облако), рейтинг и история.
 */

import { useEffect, useState } from 'react';
import { getLocalRating, getPlayerProfile } from '../game/persistence';
import { getPartyHistory, type PartyHistoryRecord } from '../game/partyHistory';
import { useAuth } from '../contexts/AuthContext';
import { getMyMatchHistory, getMyRatingSummary, type MatchHistoryItem } from '../lib/onlineGameSupabase';
import { CosmicCockpit, CosmicGlassClose, CosmicPhysButton } from './CosmicCockpit';
import { PlayerAvatar } from './PlayerAvatar';

export type AccountLkPageProps = {
  onBack: () => void;
  displayName: string;
  avatarDataUrl?: string | null;
  onEditProfile: () => void;
  onOpenRating: () => void;
  onOpenHistory: () => void;
  onSignIn: () => void;
};

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

function LocalPartyRow({ row }: { row: PartyHistoryRecord }) {
  return (
    <li className="lk-page__match">
      <span className="lk-page__match-meta">{formatWhen(row.finishedAt)} · офлайн</span>
      <span className="lk-page__match-body">
        Место {row.humanPlace} · {row.humanScore >= 0 ? '+' : ''}
        {row.humanScore} очк.
        {row.humanWon ? ' · победа' : ''}
      </span>
    </li>
  );
}

function CloudMatchRow({ row }: { row: MatchHistoryItem }) {
  const score = row.final_score != null ? `${row.final_score >= 0 ? '+' : ''}${row.final_score}` : '—';
  const place = row.place != null ? `место ${row.place}` : '—';
  return (
    <li className="lk-page__match lk-page__match--cloud">
      <span className="lk-page__match-meta">
        {formatWhen(row.finished_at)} · {row.is_offline ? 'офлайн' : 'онлайн'}
      </span>
      <span className="lk-page__match-body">
        {place} · {score} очк.
        {row.interrupted ? ' · прервана' : ''}
      </span>
    </li>
  );
}

export function AccountLkPage({
  onBack,
  displayName,
  avatarDataUrl,
  onEditProfile,
  onOpenRating,
  onOpenHistory,
  onSignIn,
}: AccountLkPageProps) {
  const { user, configured, signOut, loading: authLoading } = useAuth();
  const rating = getLocalRating();
  const localHistory = getPartyHistory(undefined, 8);
  const [online, setOnline] = useState<{ games: number; ratedGames: number; wins: number; points: number } | null>(null);
  const [cloudMatches, setCloudMatches] = useState<MatchHistoryItem[] | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);

  const loggedIn = !!(configured && user?.id);
  const winRate = rating.gamesPlayed > 0 ? Math.round((rating.wins / rating.gamesPlayed) * 100) : 0;
  const avgBidAccuracy =
    rating.bidAccuracyCount > 0 ? Math.round(rating.bidAccuracySum / rating.bidAccuracyCount) : null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!configured || !user?.id) {
        setOnline(null);
        setCloudMatches(null);
        setCloudLoading(false);
        return;
      }
      setCloudLoading(true);
      try {
        const [summary, hist] = await Promise.all([
          getMyRatingSummary(user.id),
          getMyMatchHistory(user.id, 8),
        ]);
        if (!cancelled) {
          setOnline(summary);
          setCloudMatches(hist);
        }
      } catch {
        if (!cancelled) {
          setOnline(null);
          setCloudMatches([]);
        }
      } finally {
        if (!cancelled) setCloudLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, user?.id]);

  const recentMatches =
    loggedIn && cloudMatches && cloudMatches.length > 0
      ? cloudMatches
      : localHistory.length > 0
        ? localHistory
        : null;
  const recentIsCloud = !!(loggedIn && cloudMatches && cloudMatches.length > 0);

  return (
    <div className="lk-page">
      <div className="lk-page__shell">
        <CosmicGlassClose className="lk-page__close" onClick={onBack} aria-label="Закрыть" />
        <CosmicCockpit className="lk-page__cockpit">
          <h1 className="lk-page__title cosmic-iridescent-text">Личный кабинет</h1>

          <div className="lk-page__profile">
            <PlayerAvatar
              name={displayName}
              avatarDataUrl={avatarDataUrl}
              avatarBgColor={getPlayerProfile().avatarBgColor}
              sizePx={72}
            />
            <div className="lk-page__profile-text">
              <p className="lk-page__profile-name">{displayName}</p>
              {loggedIn && user?.email ? (
                <p className="lk-page__profile-email">{user.email}</p>
              ) : (
                <p className="lk-page__profile-email lk-page__profile-email--guest">Без аккаунта · только это устройство</p>
              )}
            </div>
          </div>

          <section className="lk-page__section lk-page__section--identity" aria-labelledby="lk-profile-title">
            <div className="lk-page__section-head">
              <h2 id="lk-profile-title" className="lk-page__section-title">
                Профиль
              </h2>
              <span className="lk-page__badge lk-page__badge--local">на устройстве</span>
            </div>
            <p className="lk-page__explain">
              Имя и фото для офлайн-партий и локальных игр. Работает без входа и остаётся на этом устройстве.
            </p>
            <div className="lk-page__actions lk-page__actions--in-section">
              <CosmicPhysButton variant="primary" onClick={onEditProfile}>
                Изменить имя и фото
              </CosmicPhysButton>
            </div>
          </section>

          <section className="lk-page__section lk-page__section--account" aria-labelledby="lk-account-title">
            <div className="lk-page__section-head">
              <h2 id="lk-account-title" className="lk-page__section-title">
                Аккаунт
              </h2>
              <span className={`lk-page__badge ${loggedIn ? 'lk-page__badge--online' : 'lk-page__badge--guest'}`}>
                {loggedIn ? 'облако' : 'не выполнен вход'}
              </span>
            </div>
            <p className="lk-page__explain">
              {loggedIn
                ? 'Вы вошли: доступны онлайн-игры, облачный рейтинг и история партий на всех устройствах.'
                : 'Вход нужен для онлайн-игр и сохранения рейтинга и истории в облаке. Без аккаунта можно играть офлайн под своим профилем.'}
            </p>
            <div className="lk-page__actions lk-page__actions--in-section">
              {loggedIn ? (
                <CosmicPhysButton
                  variant="secondary"
                  onClick={() => {
                    void signOut();
                  }}
                >
                  Выйти из аккаунта
                </CosmicPhysButton>
              ) : (
                <CosmicPhysButton variant="secondary" onClick={onSignIn}>
                  {authLoading ? 'Проверка…' : 'Войти в аккаунт'}
                </CosmicPhysButton>
              )}
            </div>
          </section>

          <section className="lk-page__section" aria-labelledby="lk-stats-title">
            <h2 id="lk-stats-title" className="lk-page__section-title">
              Статистика
            </h2>
            <div className="lk-page__stats">
              {loggedIn && online && (
                <>
                  <div className="lk-page__stat">
                    <span className="lk-page__stat-label">Онлайн · игр</span>
                    <span className="lk-page__stat-value">{online.games}</span>
                  </div>
                  <div className="lk-page__stat">
                    <span className="lk-page__stat-label">Онлайн · побед</span>
                    <span className="lk-page__stat-value">{online.wins}</span>
                  </div>
                  <div className="lk-page__stat">
                    <span className="lk-page__stat-label">Онлайн · очки</span>
                    <span className="lk-page__stat-value">{online.points}</span>
                  </div>
                </>
              )}
              <div className="lk-page__stat">
                <span className="lk-page__stat-label">На устройстве · игр</span>
                <span className="lk-page__stat-value">{rating.gamesPlayed}</span>
              </div>
              <div className="lk-page__stat">
                <span className="lk-page__stat-label">На устройстве · побед</span>
                <span className="lk-page__stat-value">
                  {rating.wins}
                  {rating.gamesPlayed > 0 ? ` (${winRate}%)` : ''}
                </span>
              </div>
              {avgBidAccuracy != null && (
                <div className="lk-page__stat">
                  <span className="lk-page__stat-label">Точность заказов</span>
                  <span className="lk-page__stat-value">{avgBidAccuracy}%</span>
                </div>
              )}
            </div>
            <div className="lk-page__section-links">
              <button type="button" className="lk-page__text-link" onClick={onOpenRating}>
                Подробный рейтинг
              </button>
              <button type="button" className="lk-page__text-link" onClick={onOpenHistory}>
                История партий
              </button>
            </div>
          </section>

          <section className="lk-page__section" aria-labelledby="lk-recent-title">
            <h2 id="lk-recent-title" className="lk-page__section-title">
              Недавние партии
            </h2>
            {cloudLoading && loggedIn ? (
              <p className="lk-page__empty">Загрузка из облака…</p>
            ) : recentMatches && recentMatches.length > 0 ? (
              <ul className="lk-page__match-list">
                {recentIsCloud
                  ? (recentMatches as MatchHistoryItem[]).map((row) => (
                      <CloudMatchRow key={row.id} row={row} />
                    ))
                  : (recentMatches as PartyHistoryRecord[]).map((row) => (
                      <LocalPartyRow key={row.id} row={row} />
                    ))}
              </ul>
            ) : (
              <p className="lk-page__empty">
                {loggedIn
                  ? 'Пока нет сохранённых партий. Завершите офлайн- или онлайн-игру — запись появится здесь.'
                  : 'Локальная история появится после офлайн-партий. Войдите в аккаунт, чтобы синхронизировать её между устройствами.'}
              </p>
            )}
          </section>

          <CosmicPhysButton variant="secondary" onClick={onBack}>
            ← В главное меню
          </CosmicPhysButton>
        </CosmicCockpit>
      </div>
    </div>
  );
}
