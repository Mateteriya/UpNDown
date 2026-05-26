/**
 * Модалка «Ваш рейтинг»: статистика текущего профиля (игр, побед, точность заказов).
 */

import { useEffect, useState } from 'react';
import { getLocalRating, getPlayerProfile } from '../game/persistence';
import { getPartyHistory, type PartyHistoryRecord } from '../game/partyHistory';
import { SETTLEMENT_MODE_LABELS } from '../game/partySettlement';
import { useAuth } from '../contexts/AuthContext';
import { getMyMatchHistory, getMyRatingSummary, type MatchHistoryItem } from '../lib/onlineGameSupabase';
import { CosmicCockpit, CosmicPhysButton } from './CosmicCockpit';
import { PlayerAvatar } from './PlayerAvatar';
import { chipColor } from './DealResultsSettlement';

export interface RatingModalProps {
  onClose: () => void;
  playerAvatarDataUrl?: string | null;
}

function formatPartyDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso.slice(0, 10);
  }
}

function PartyHistoryRow({ row }: { row: PartyHistoryRecord }) {
  const chipsStr = `${row.humanChips >= 0 ? '+' : ''}${row.humanChips}`;
  return (
    <div className="rating-modal__history-row">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span className="rating-modal__history-meta">{formatPartyDate(row.finishedAt)}</span>
        <span className="rating-modal__history-meta">№{row.gameId}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
        <span className="rating-modal__history-body">
          Место {row.humanPlace} · {row.humanScore >= 0 ? '+' : ''}
          {row.humanScore} очк.
          {row.humanWon ? ' · победа' : ''}
        </span>
        <span style={{ fontSize: 14, fontWeight: 700, color: chipColor(row.humanChips) }}>
          {chipsStr} фиш.
        </span>
      </div>
      <span className="rating-modal__history-sub">
        {SETTLEMENT_MODE_LABELS[row.settlementMode]} · {row.dealCount} разд.
      </span>
    </div>
  );
}

function CloudMatchRow({ row }: { row: MatchHistoryItem }) {
  const when = formatPartyDate(row.finished_at);
  const score = row.final_score != null ? `${row.final_score >= 0 ? '+' : ''}${row.final_score}` : '—';
  const place = row.place != null ? `место ${row.place}` : '—';
  return (
    <div className="rating-modal__history-row rating-modal__history-row--cloud">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span className="rating-modal__history-meta">{when}</span>
        <span className="rating-modal__history-meta">{row.is_offline ? 'офлайн' : 'онлайн'}</span>
      </div>
      <span className="rating-modal__history-body">
        {place} · {score} очк.
        {row.interrupted ? ' · прервана' : ''}
      </span>
    </div>
  );
}

export function RatingModal({ onClose, playerAvatarDataUrl }: RatingModalProps) {
  const profile = getPlayerProfile();
  const rating = getLocalRating();
  const partyHistory = getPartyHistory(undefined, 12);
  const { user, configured } = useAuth();
  const [online, setOnline] = useState<{ games: number; ratedGames: number; wins: number; points: number } | null>(null);
  const [cloudMatches, setCloudMatches] = useState<MatchHistoryItem[] | null>(null);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      if (!configured || !user?.id) {
        setOnline(null);
        setCloudMatches(null);
        return;
      }
      const [s, hist] = await Promise.all([
        getMyRatingSummary(user.id),
        getMyMatchHistory(user.id, 12),
      ]);
      setOnline(s);
      setCloudMatches(hist);
    })().catch(() => {});
  }, [configured, user?.id]);

  const winRate = rating.gamesPlayed > 0 ? Math.round((rating.wins / rating.gamesPlayed) * 100) : 0;
  const avgBidAccuracy = rating.bidAccuracyCount > 0 ? Math.round(rating.bidAccuracySum / rating.bidAccuracyCount) : null;
  const showOfflineBlock = !(online && online.games > 0 && rating.gamesPlayed === 0);
  const loggedIn = !!(configured && user?.id);

  return (
    <div
      className="rating-modal"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.75)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="rating-modal-title"
    >
      <div className="rating-modal__shell" onClick={(e) => e.stopPropagation()}>
        <CosmicCockpit dense className="rating-modal__cockpit">
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -4 }}>
            <CosmicPhysButton variant="secondary" onClick={onClose}>
              ×
            </CosmicPhysButton>
          </div>
          <h2 id="rating-modal-title" className="rating-modal__title cosmic-iridescent-text">
            Ваш рейтинг
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
            <PlayerAvatar name={profile.displayName} avatarDataUrl={playerAvatarDataUrl} sizePx={64} />
            <span className="rating-modal__name">{profile.displayName}</span>

            <p className="rating-modal__note">
              Облако: войдите в аккаунт и доиграйте офлайн-партию — статус на экране «Партия завершена».
            </p>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {loggedIn && online && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="rating-modal__stat-label">Онлайн: сыграно</span>
                    <span className="rating-modal__stat-value">{online.games} ({online.ratedGames})</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="rating-modal__stat-label">Онлайн: побед</span>
                    <span className="rating-modal__stat-value">{online.wins}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="rating-modal__stat-label">Онлайн: очки</span>
                    <span className="rating-modal__stat-value">{online.points}</span>
                  </div>
                  <hr style={{ border: 'none', borderTop: '1px solid rgba(167,139,250,0.35)', margin: '4px 0' }} />
                </>
              )}
              {showOfflineBlock && (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="rating-modal__stat-label">На устройстве: игр</span>
                    <span className="rating-modal__stat-value">{rating.gamesPlayed}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span className="rating-modal__stat-label">На устройстве: побед</span>
                    <span className="rating-modal__stat-value">{rating.wins}</span>
                  </div>
                  {rating.gamesPlayed > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="rating-modal__stat-label">Процент побед</span>
                      <span className="rating-modal__stat-value">{winRate}%</span>
                    </div>
                  )}
                  {avgBidAccuracy !== null && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span className="rating-modal__stat-label">Точность заказов</span>
                      <span className="rating-modal__stat-value">{avgBidAccuracy}%</span>
                    </div>
                  )}
                </>
              )}
            </div>

            <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="rating-modal__history-title">История на устройстве</div>
              <p className="rating-modal__history-hint">После полной офлайн-партии (28 раздач).</p>
              {partyHistory.length === 0 ? (
                <div className="rating-modal__history-empty">Пока нет записей — доиграйте партию до конца.</div>
              ) : (
                partyHistory.map((row) => <PartyHistoryRow key={row.id} row={row} />)
              )}
            </div>

            {loggedIn && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div className="rating-modal__history-title">История в аккаунте</div>
                <p className="rating-modal__history-hint">Тот же логин на другом телефоне — те же матчи.</p>
                {cloudMatches == null ? (
                  <div className="rating-modal__history-empty">Загрузка…</div>
                ) : cloudMatches.length === 0 ? (
                  <div className="rating-modal__history-empty">
                    В облаке пусто. Завершите офлайн-партию, будучи авторизованными.
                  </div>
                ) : (
                  cloudMatches.map((row) => <CloudMatchRow key={row.id} row={row} />)
                )}
              </div>
            )}
          </div>
        </CosmicCockpit>
      </div>
    </div>
  );
}
