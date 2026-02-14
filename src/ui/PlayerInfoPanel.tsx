/**
 * Панель по клику на аватар: увеличенное фото, имя и статистика игрока.
 * Показываем только то, что есть в приложении: имя, очки в партии, точность заказов в этой партии; для человека — ещё игр сыграно и побед.
 */

import { useEffect } from 'react';
import type { GameState } from '../game/GameEngine';
import { getTakenFromDealPoints } from '../game/scoring';
import { getLocalRating } from '../game/persistence';
import { PlayerAvatar } from './PlayerAvatar';

export interface PlayerInfoPanelProps {
  state: GameState;
  playerIndex: number;
  playerAvatarDataUrl?: string | null;
  onClose: () => void;
}

function getBidAccuracyInGame(dealHistory: GameState['dealHistory'], playerIndex: number): number {
  if (!dealHistory?.length) return 0;
  let met = 0;
  for (const deal of dealHistory) {
    const bid = deal.bids[playerIndex];
    const points = deal.points[playerIndex];
    if (bid == null) continue;
    const taken = getTakenFromDealPoints(bid, points);
    if (bid === taken) met++;
  }
  return Math.round((met / dealHistory.length) * 100);
}

export function PlayerInfoPanel({ state, playerIndex, playerAvatarDataUrl, onClose }: PlayerInfoPanelProps) {
  const p = state.players[playerIndex];
  const isHuman = playerIndex === 0;
  const localRating = isHuman ? getLocalRating() : null;
  const bidAccuracy = getBidAccuracyInGame(state.dealHistory ?? [], playerIndex);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-info-panel-name"
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 16,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          maxWidth: 320,
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <PlayerAvatar name={p.name} avatarDataUrl={isHuman ? playerAvatarDataUrl : undefined} sizePx={96} />
          <h2 id="player-info-panel-name" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9', textAlign: 'center' }}>
            {p.name}
          </h2>
          {!isHuman && (
            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Игрок ИИ</span>
          )}
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Очки в партии</span>
              <span style={{ fontSize: 18, fontWeight: 700, color: '#f8fafc' }}>{p.score >= 0 ? '+' : ''}{p.score}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 14, color: '#94a3b8' }}>Точность заказов в этой партии</span>
              <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{bidAccuracy}%</span>
            </div>
            {isHuman && localRating && (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>Игр сыграно</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{localRating.gamesPlayed}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontSize: 14, color: '#94a3b8' }}>Побед</span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{localRating.wins}</span>
                </div>
                {localRating.bidAccuracyCount > 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, color: '#94a3b8' }}>Средняя точность заказов</span>
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>{Math.round(localRating.bidAccuracySum / localRating.bidAccuracyCount)}%</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
