/**
 * Панель по клику на аватар: увеличенное фото, имя и статистика игрока.
 */

import { useEffect } from 'react';
import type { AIDifficulty, GameState } from '../game/GameEngine';
import { getBidAccuracyInGame } from '../game/playerBidAccuracy';
import { getLocalRating } from '../game/persistence';
import { avatarLikelyHas3dMagic } from '../lib/avatarPremium';
import { PlayerAvatar } from './PlayerAvatar';
import { OfflineAiDifficultyOptionList } from './OfflineAiDifficultyOptionList';

export interface PlayerInfoPanelProps {
  state: GameState;
  playerIndex: number;
  /** Имя из слота комнаты (актуальнее state.players). */
  playerDisplayName?: string;
  playerAvatarDataUrl?: string | null;
  onClose: () => void;
  viewportShort?: boolean;
  offlineAiDifficultyPicker?: {
    current: AIDifficulty;
    onSelect: (level: AIDifficulty) => void;
  };
}

export function PlayerInfoPanel({
  state,
  playerIndex,
  playerDisplayName,
  playerAvatarDataUrl,
  onClose,
  viewportShort = false,
  offlineAiDifficultyPicker,
}: PlayerInfoPanelProps) {
  const p = state.players[playerIndex];
  const shownName = playerDisplayName?.trim() || p.name;
  const isSelf = playerIndex === 0;
  const isAiBot = p.id === 'ai1' || p.id === 'ai2' || p.id === 'ai3';
  const hasPhoto = !!playerAvatarDataUrl;
  const magic3d = avatarLikelyHas3dMagic(playerAvatarDataUrl);
  const avatarSizePx = hasPhoto ? (viewportShort ? 108 : 124) : viewportShort ? 80 : 96;
  const localRating = isSelf ? getLocalRating() : null;
  const bidAccuracy = getBidAccuracyInGame(state.dealHistory ?? [], playerIndex);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  return (
    <div
      className={['player-info-panel-root', viewportShort ? 'player-info-panel-root--short-vh' : '']
        .filter(Boolean)
        .join(' ')}
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
          maxWidth: viewportShort ? 300 : 340,
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
          <div
            className={[
              'player-info-panel-avatar-wrap',
              hasPhoto ? 'player-info-panel-avatar-wrap--photo' : '',
              magic3d ? 'player-info-panel-avatar-wrap--magic3d' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <PlayerAvatar name={shownName} avatarDataUrl={playerAvatarDataUrl} sizePx={avatarSizePx} />
          </div>
          <h2
            id="player-info-panel-name"
            className="player-info-panel-player-name"
            style={{ margin: 0, fontSize: 20, fontWeight: 700, textAlign: 'center' }}
          >
            {shownName}
          </h2>
          {isAiBot && <span className="player-info-panel-ai-role">Игрок ИИ</span>}
          <div
            className="player-info-panel-stats"
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: viewportShort ? 7 : 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="player-info-panel-label player-info-panel-label--party-score">Очки в партии</span>
              <span className="player-info-panel-value player-info-panel-value--party-score">
                {p.score >= 0 ? '+' : ''}
                {p.score}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="player-info-panel-label player-info-panel-label--bid-accuracy-deal">
                Точность заказов в этой партии
              </span>
              <span className="player-info-panel-value player-info-panel-value--bid-accuracy-deal">{bidAccuracy}%</span>
            </div>
            {isSelf && localRating && (
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
                    <span style={{ fontSize: 16, fontWeight: 600, color: '#f8fafc' }}>
                      {Math.round(localRating.bidAccuracySum / localRating.bidAccuracyCount)}%
                    </span>
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
