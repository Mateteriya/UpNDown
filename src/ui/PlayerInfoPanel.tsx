/**
 * Панель по клику на аватар: увеличенное фото, имя и статистика игрока.
 */

import { useEffect, useRef, useState } from 'react';
import type { AIDifficulty, GameState } from '../game/GameEngine';
import { getBidAccuracyInGame } from '../game/playerBidAccuracy';
import { getLocalRating } from '../game/persistence';
import { avatarLikelyHas3dMagic } from '../lib/avatarPremium';
import { PlayerAvatar } from './PlayerAvatar';
import { OfflineAiDifficultyOptionList } from './OfflineAiDifficultyOptionList';
import { AiBotAvatarPicker } from './AiBotAvatarPicker';

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
  /** Премиум: выбор картинки аватара ИИ (под большим фото). */
  aiAvatarPicker?: {
    difficulty: AIDifficulty;
    currentVariant: number;
    onSelect: (variantIndex: number) => void;
  };
  /** Игрок управляется ИИ (офлайн-бот или онлайн-слот). */
  isAiPlayer?: boolean;
  /** Классы landscape-портала (совпадают с корнем стола). */
  portalRootClass?: string;
  /** Мобильная/планшетная вёрстка: прокручиваемая модалка. */
  layoutMobile?: boolean;
}

export function PlayerInfoPanel({
  state,
  playerIndex,
  playerDisplayName,
  playerAvatarDataUrl,
  onClose,
  viewportShort = false,
  offlineAiDifficultyPicker,
  aiAvatarPicker,
  isAiPlayer = false,
  portalRootClass,
  layoutMobile = false,
}: PlayerInfoPanelProps) {
  const p = state.players[playerIndex];
  const shownName = playerDisplayName?.trim() || p.name;
  const isSelf = playerIndex === 0;
  const isAiBot = isAiPlayer || p.id === 'ai1' || p.id === 'ai2' || p.id === 'ai3';
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

  const [aiAvatarPickerOpen, setAiAvatarPickerOpen] = useState(false);
  const panelRootRef = useRef<HTMLDivElement>(null);
  const avatarWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAiAvatarPickerOpen(false);
  }, [playerIndex]);

  const scrollAvatarIntoView = (behavior: ScrollBehavior = 'smooth') => {
    const root = panelRootRef.current;
    const avatar = avatarWrapRef.current;
    if (!root || !avatar) return;
    const rootRect = root.getBoundingClientRect();
    const avatarRect = avatar.getBoundingClientRect();
    const padTop = 12;
    if (avatarRect.top < rootRect.top + padTop) {
      root.scrollBy({ top: avatarRect.top - rootRect.top - padTop, behavior });
    }
  };

  useEffect(() => {
    if (!aiAvatarPickerOpen) return;
    const t = window.setTimeout(() => scrollAvatarIntoView('smooth'), 300);
    return () => window.clearTimeout(t);
  }, [aiAvatarPickerOpen]);

  useEffect(() => {
    if (!aiAvatarPickerOpen || !aiAvatarPicker) return;
    scrollAvatarIntoView('smooth');
  }, [aiAvatarPicker?.currentVariant, aiAvatarPickerOpen]);

  return (
    <div
      ref={panelRootRef}
      className={[
        'player-info-panel-root',
        layoutMobile ? 'player-info-panel-root--mobile-scroll' : '',
        viewportShort ? 'player-info-panel-root--short-vh' : '',
        portalRootClass,
      ]
        .filter(Boolean)
        .join(' ')}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="player-info-panel-name"
    >
      <div
        className={[
          'player-info-panel-card',
          viewportShort ? 'player-info-panel-card--short-vh' : '',
        ]
          .filter(Boolean)
          .join(' ')}
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
            ref={avatarWrapRef}
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
          {aiAvatarPicker ? (
            <div
              className={[
                'player-info-panel-ai-avatar-picker-wrap',
                aiAvatarPickerOpen ? 'player-info-panel-ai-avatar-picker-wrap--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <button
                type="button"
                className="player-info-panel-ai-avatar-premium-toggle"
                aria-expanded={aiAvatarPickerOpen}
                aria-controls="player-info-panel-ai-avatar-picker-body"
                aria-label={
                  aiAvatarPickerOpen
                    ? 'Свернуть выбор аватара ИИ'
                    : 'Развернуть выбор аватара ИИ (Премиум)'
                }
                onClick={() => setAiAvatarPickerOpen((open) => !open)}
              >
                <span className="player-info-panel-ai-avatar-premium-toggle__main">
                  <span className="player-info-panel-ai-avatar-picker-heading__label">Аватар ИИ</span>
                  <span className="player-info-panel-ai-avatar-picker-heading__premium">Премиум</span>
                </span>
                <span className="player-info-panel-ai-avatar-premium-toggle__chevron" aria-hidden />
              </button>
              <div
                id="player-info-panel-ai-avatar-picker-body"
                className={[
                  'player-info-panel-ai-avatar-picker-body',
                  aiAvatarPickerOpen ? 'player-info-panel-ai-avatar-picker-body--open' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <div className="player-info-panel-ai-avatar-picker-body__inner">
                  <AiBotAvatarPicker
                    difficulty={aiAvatarPicker.difficulty}
                    currentVariant={aiAvatarPicker.currentVariant}
                    onSelect={aiAvatarPicker.onSelect}
                  />
                </div>
              </div>
            </div>
          ) : null}
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
