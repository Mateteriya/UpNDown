/**
 * Панель по клику на аватар: крупное фото, роль, счёт и «Подробнее об игроке».
 * Сейчас — для всех слотов (в т.ч. ИИ офлайн) для проверки UI.
 */

import { useEffect, useRef, useState } from 'react';
import type { AIDifficulty, GameState } from '../game/GameEngine';
import { getBidAccuracyInGame } from '../game/playerBidAccuracy';
import { getLocalRating } from '../game/persistence';
import { avatarLikelyHas3dMagic } from '../lib/avatarPremium';
import { PlayerAvatar } from './PlayerAvatar';
import { OfflineAiDifficultyOptionList } from './OfflineAiDifficultyOptionList';
import { AiBotAvatarPicker } from './AiBotAvatarPicker';
import { PlayerAccountStatusMark } from './PlayerAccountStatusMark';
import { localizeAiDisplayName, useT } from '../i18n';

export type PlayerInfoDossier = {
  mode: 'offline' | 'online';
  /** Подпись компаса: Юг / Север / … */
  seatLabel: string;
  isHost?: boolean;
  /** Онлайн: человек ушёл / пауза → ИИ. */
  replacedByAi?: boolean;
  shortLabel?: string | null;
  /** Для слота «вы» (редко — обычно UserAvatarMenuSheet). */
  accountSignedIn?: boolean | null;
  accountWho?: string | null;
  onSignIn?: () => void;
};

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
  dossier?: PlayerInfoDossier;
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
  dossier,
}: PlayerInfoPanelProps) {
  const tr = useT();
  const p = state.players[playerIndex];
  const shownName = localizeAiDisplayName(
    p.id,
    playerDisplayName?.trim() || p.name,
    state.players.length,
  );
  const isSelf = playerIndex === 0;
  const isAiBot = isAiPlayer || p.id === 'ai1' || p.id === 'ai2' || p.id === 'ai3';
  const hasPhoto = !!playerAvatarDataUrl;
  const magic3d = avatarLikelyHas3dMagic(playerAvatarDataUrl);
  const avatarSizePx = hasPhoto
    ? viewportShort
      ? 128
      : 156
    : viewportShort
      ? 100
      : 120;
  const localRating = isSelf ? getLocalRating() : null;
  const bidAccuracy = getBidAccuracyInGame(state.dealHistory ?? [], playerIndex);
  const bid = state.bids[playerIndex];
  const tricks = p.tricksTaken ?? 0;
  const showDealLive =
    state.phase === 'bidding' || state.phase === 'playing' || state.phase === 'trick-complete';

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose]);

  const [aiAvatarPickerOpen, setAiAvatarPickerOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const panelRootRef = useRef<HTMLDivElement>(null);
  const avatarWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setAiAvatarPickerOpen(false);
    setDetailsOpen(true);
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

  const modeLine =
    dossier?.mode === 'online' ? tr('playerDossier.modeOnline') : tr('playerDossier.modeOffline');

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
          'player-info-panel-card--dossier',
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
            marginBottom: viewportShort ? -12 : -6,
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
            aria-label={tr('common.close')}
          >
            ×
          </button>
        </div>

        <div className="player-info-panel-dossier-hero">
          <div
            ref={avatarWrapRef}
            className={[
              'player-info-panel-avatar-wrap',
              'player-info-panel-avatar-wrap--dossier',
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
                  aiAvatarPickerOpen ? tr('ai.collapseAvatar') : tr('ai.expandAvatarPremium')
                }
                onClick={() => setAiAvatarPickerOpen((open) => !open)}
              >
                <span className="player-info-panel-ai-avatar-premium-toggle__main">
                  <span className="player-info-panel-ai-avatar-picker-heading__label">{tr('ai.avatar')}</span>
                  <span className="player-info-panel-ai-avatar-picker-heading__premium">{tr('ai.premium')}</span>
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

          <h2 id="player-info-panel-name" className="player-info-panel-player-name player-info-panel-player-name--dossier">
            {shownName}
          </h2>

          <div className="player-info-panel-role-row">
            {isSelf ? <span className="player-info-panel-chip player-info-panel-chip--you">{tr('playerDossier.you')}</span> : null}
            {isAiBot ? (
              <span className="player-info-panel-chip player-info-panel-chip--ai">{tr('ai.playerRole')}</span>
            ) : (
              <span className="player-info-panel-chip player-info-panel-chip--human">{tr('playerDossier.human')}</span>
            )}
            {dossier?.seatLabel ? (
              <span className="player-info-panel-chip player-info-panel-chip--seat">{dossier.seatLabel}</span>
            ) : null}
            {dossier?.isHost ? (
              <span className="player-info-panel-chip player-info-panel-chip--host">{tr('playerDossier.host')}</span>
            ) : null}
            {dossier?.replacedByAi ? (
              <span className="player-info-panel-chip player-info-panel-chip--pause">{tr('playerDossier.replacedAi')}</span>
            ) : null}
          </div>

          <p className="player-info-panel-mode-line">{modeLine}</p>

          {isSelf && dossier?.accountSignedIn != null ? (
            <PlayerAccountStatusMark
              signedIn={dossier.accountSignedIn}
              who={dossier.accountWho}
              onSignIn={dossier.onSignIn}
            />
          ) : null}

          <div
            className="player-info-panel-stats"
            style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: viewportShort ? 7 : 10 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="player-info-panel-label player-info-panel-label--party-score">{tr('avatarMenu.partyScore')}</span>
              <span className="player-info-panel-value player-info-panel-value--party-score">
                {p.score >= 0 ? '+' : ''}
                {p.score}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="player-info-panel-label player-info-panel-label--bid-accuracy-deal">
                {tr('avatarMenu.accuracyDeal')}
              </span>
              <span className="player-info-panel-value player-info-panel-value--bid-accuracy-deal">{bidAccuracy}%</span>
            </div>
          </div>

          <details
            className="player-info-panel-details"
            open={detailsOpen}
            onToggle={(e) => setDetailsOpen((e.target as HTMLDetailsElement).open)}
          >
            <summary className="player-info-panel-details__summary">{tr('playerDossier.moreAbout')}</summary>
            <div className="player-info-panel-details__body">
              {dossier?.shortLabel ? (
                <div className="player-info-panel-detail-row">
                  <span className="player-info-panel-detail-row__k">{tr('playerDossier.shortLabel')}</span>
                  <span className="player-info-panel-detail-row__v">{dossier.shortLabel}</span>
                </div>
              ) : null}
              {showDealLive ? (
                <>
                  <div className="player-info-panel-detail-row">
                    <span className="player-info-panel-detail-row__k">{tr('avatarMenu.currentBid')}</span>
                    <span className="player-info-panel-detail-row__v">
                      {bid == null ? '—' : String(bid)}
                    </span>
                  </div>
                  <div className="player-info-panel-detail-row">
                    <span className="player-info-panel-detail-row__k">{tr('avatarMenu.tricksInDeal')}</span>
                    <span className="player-info-panel-detail-row__v">{tricks}</span>
                  </div>
                </>
              ) : null}
              {offlineAiDifficultyPicker ? (
                <div className="player-info-panel-detail-row">
                  <span className="player-info-panel-detail-row__k">{tr('ai.levelGroup')}</span>
                  <span className="player-info-panel-detail-row__v">{offlineAiDifficultyPicker.current}</span>
                </div>
              ) : null}
              {isSelf && localRating ? (
                <>
                  <div className="player-info-panel-detail-row">
                    <span className="player-info-panel-detail-row__k">{tr('avatarMenu.gamesPlayed')}</span>
                    <span className="player-info-panel-detail-row__v">{localRating.gamesPlayed}</span>
                  </div>
                  <div className="player-info-panel-detail-row">
                    <span className="player-info-panel-detail-row__k">{tr('avatarMenu.wins')}</span>
                    <span className="player-info-panel-detail-row__v">{localRating.wins}</span>
                  </div>
                  {localRating.bidAccuracyCount > 0 ? (
                    <div className="player-info-panel-detail-row">
                      <span className="player-info-panel-detail-row__k">{tr('avatarMenu.accuracyAvg')}</span>
                      <span className="player-info-panel-detail-row__v">
                        {Math.round(localRating.bidAccuracySum / localRating.bidAccuracyCount)}%
                      </span>
                    </div>
                  ) : null}
                </>
              ) : null}
              {!isAiBot && dossier?.mode === 'online' && !dossier.replacedByAi ? (
                <div className="player-info-panel-detail-row">
                  <span className="player-info-panel-detail-row__k">{tr('playerDossier.presence')}</span>
                  <span className="player-info-panel-detail-row__v">{tr('playerDossier.presenceLive')}</span>
                </div>
              ) : null}
            </div>
          </details>

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
              <div className="player-info-panel-ai-difficulty-heading">{tr('ai.levelGroup')}</div>
              <OfflineAiDifficultyOptionList
                current={offlineAiDifficultyPicker.current}
                onSelect={offlineAiDifficultyPicker.onSelect}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
