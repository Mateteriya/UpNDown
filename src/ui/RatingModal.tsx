/**
 * Модалка «Ваш рейтинг»: статистика текущего профиля (игр, побед, точность заказов).
 */

import { useEffect, useState } from 'react';
import { getLocalRating, getPlayerProfile } from '../game/persistence';
import { useAuth } from '../contexts/AuthContext';
import { getMyRatingSummary } from '../lib/onlineGameSupabase';
import { PlayerAvatar } from './PlayerAvatar';

export interface RatingModalProps {
  onClose: () => void;
  playerAvatarDataUrl?: string | null;
}

export function RatingModal({ onClose, playerAvatarDataUrl }: RatingModalProps) {
  const profile = getPlayerProfile();
  const rating = getLocalRating();
  const { user, configured } = useAuth();
  const [online, setOnline] = useState<{ games: number; ratedGames: number; wins: number; points: number } | null>(null);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      if (!configured || !user?.id) { setOnline(null); return; }
      const s = await getMyRatingSummary(user.id);
      setOnline(s);
    })().catch(() => {});
  }, [configured, user?.id]);

  const winRate = rating.gamesPlayed > 0 ? Math.round((rating.wins / rating.gamesPlayed) * 100) : 0;
  const avgBidAccuracy = rating.bidAccuracyCount > 0 ? Math.round(rating.bidAccuracySum / rating.bidAccuracyCount) : null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
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
      <div
        style={{
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 16,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          maxWidth: 360,
          width: '100%',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <h2 id="rating-modal-title" style={{ margin: '0 0 16px', fontSize: 20, fontWeight: 700, color: '#f1f5f9', textAlign: 'center' }}>
          Ваш рейтинг
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <PlayerAvatar name={profile.displayName} avatarDataUrl={playerAvatarDataUrl} sizePx={64} />
          <span style={{ fontSize: 16, fontWeight: 600, color: '#e2e8f0' }}>{profile.displayName}</span>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {configured && user?.id && online && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>Онлайн: сыграно (рейтинговых)</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{online.games} ({online.ratedGames})</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>Онлайн: побед</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{online.wins}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>Онлайн: очки рейтинга</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{online.points}</span>
                </div>
                <hr style={{ border: 'none', borderTop: '1px solid rgba(148,163,184,0.25)' }} />
              </>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Игр сыграно</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{rating.gamesPlayed}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Побед</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{rating.wins}</span>
            </div>
            {rating.gamesPlayed > 0 && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>Процент побед</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{winRate}%</span>
              </div>
            )}
            {avgBidAccuracy !== null && (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, color: '#94a3b8' }}>Средняя точность заказов</span>
                <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{avgBidAccuracy}%</span>
              </div>
            )}
          </div>
          <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b', textAlign: 'center' }}>
            Глобальный рейтинг — скоро
          </p>
        </div>
      </div>
    </div>
  );
}
