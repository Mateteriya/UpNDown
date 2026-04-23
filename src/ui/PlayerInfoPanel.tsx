/**
 * Панель по клику на аватар: увеличенное фото, имя и статистика игрока.
 * Показываем только то, что есть в приложении: имя, очки в партии, точность заказов в этой партии; для человека — ещё игр сыграно и побед.
 */

import { useEffect } from 'react';
import type { AIDifficulty, GameState } from '../game/GameEngine';
import { getTakenFromDealPoints } from '../game/scoring';
import { getLocalRating } from '../game/persistence';
import { PlayerAvatar } from './PlayerAvatar';
import { OfflineAiDifficultyOptionList } from './OfflineAiDifficultyOptionList';

export interface PlayerInfoPanelProps {
  state: GameState;
  playerIndex: number;
  playerAvatarDataUrl?: string | null;
  onClose: () => void;
  /** Мобильный short-VH: компактнее модалка (отступы/поля), кегли те же */
  viewportShort?: boolean;
  /** Офлайн-бот: выбор уровня в этой же панели (ПК и мобильная) */
  offlineAiDifficultyPicker?: {
    current: AIDifficulty;
    onSelect: (level: AIDifficulty) => void;
  };
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

export function PlayerInfoPanel({
  state,
  playerIndex,
  playerAvatarDataUrl,
  onClose,
  viewportShort = false,
  offlineAiDifficultyPicker,
}: PlayerInfoPanelProps) {
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
      className={['player-info-panel-root', viewportShort ? 'player-info-panel-root--short-vh' : ''].filter(Boolean).join(' ')}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10001,
        padding: viewportShort ? 10 : 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-info-panel-name"
    >
      <div
        className="player-info-panel-card"
        style={{
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: viewportShort ? 14 : 16,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          maxWidth: viewportShort ? 278 : 320,
          width: '100%',
          padding: viewportShort ? '5px 14px 14px' : 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            marginBottom: viewportShort ? -15 : -8,
            marginTop: viewportShort ? -2 : 0,
          }}
        >
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
              padding: viewportShort ? '1px 4px' : 4,
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: viewportShort ? 10 : 16 }}>
          <PlayerAvatar name={p.name} avatarDataUrl={isHuman ? playerAvatarDataUrl : undefined} sizePx={viewportShort ? 80 : 96} />
          <h2 id="player-info-panel-name" className="player-info-panel-player-name" style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: 'center' }}>
            {p.name}
          </h2>
          {!isHuman && (
            <span className="player-info-panel-ai-role">Игрок ИИ</span>
          )}
          <div className="player-info-panel-stats" style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: viewportShort ? 7 : 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="player-info-panel-label player-info-panel-label--party-score">Очки в партии</span>
              <span className="player-info-panel-value player-info-panel-value--party-score">{p.score >= 0 ? '+' : ''}{p.score}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="player-info-panel-label player-info-panel-label--bid-accuracy-deal">Точность заказов в этой партии</span>
              <span className="player-info-panel-value player-info-panel-value--bid-accuracy-deal">{bidAccuracy}%</span>
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
            {offlineAiDifficultyPicker && (
              <div
                className="ai-difficulty-popover-layer"
                style={{
                  width: '100%',
                  marginTop: viewportShort ? 4 : 6,
                  paddingTop: viewportShort ? 8 : 12,
                  borderTop: '1px solid rgba(148, 163, 184, 0.25)',
                }}
              >
                <div className="player-info-panel-ai-difficulty-heading">Уровень сложности ИИ</div>
                <OfflineAiDifficultyOptionList
                  current={offlineAiDifficultyPicker.current}
                  onSelect={offlineAiDifficultyPicker.onSelect}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
