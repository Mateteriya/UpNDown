/**
 * Нижнее меню по тапу на свою аватарку (мобильная + онлайн): статистика сразу в карточке,
 * под ней — действия профиля (и пауза в онлайне).
 */

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { AvatarEditorModal } from './AvatarEditorModal';
import type { GameState } from '../game/GameEngine';
import { getBidAccuracyInGame } from '../game/playerBidAccuracy';
import { getLocalRating } from '../game/persistence';
import { MAX_DISPLAY_NAME_LENGTH } from './NameAvatarModal';
import { PlayerAvatar } from './PlayerAvatar';
import { useDesktopProfileUi } from './useDesktopProfileUi';

export interface UserAvatarMenuSheetProps {
  displayName: string;
  avatarDataUrl?: string | null;
  state: GameState;
  offlineMode: boolean;
  showPause: boolean;
  takingPause: boolean;
  onClose: () => void;
  onOpenProfileModal?: () => void;
  /** Сохранить новую аватарку (фото / рисунок) в профиль. */
  onSaveAvatar?: (avatarDataUrl: string | null) => void;
  /** Сразу после снимка — синхронизация слота, если вкладка перезагрузится. */
  onPhotoCaptured?: (avatarDataUrl: string) => void;
  /** Сохранить имя без отдельной модалки профиля. */
  onSaveDisplayName?: (displayName: string) => void;
  onTakePause?: () => void | Promise<void>;
}

const ICON_STROKE = 2.1;

function AvatarMenuBtnIcon({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={['avatar-menu-sheet-btn-icon', className].filter(Boolean).join(' ')} aria-hidden>{children}</span>;
}

function AvatarMenuIconPhoto({ gradId }: { gradId: string }) {
  const g = `${gradId}-photo`;
  return (
    <svg className="avatar-menu-sheet-btn-icon-svg" viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <defs>
        <linearGradient id={g} x1="3" y1="5" x2="21" y2="19" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#a5f3fc" />
          <stop offset="50%" stopColor="#22d3ee" />
          <stop offset="100%" stopColor="#0891b2" />
        </linearGradient>
      </defs>
      <path
        d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
        fill="none"
        stroke={`url(#${g})`}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="4" fill="rgba(34,211,238,0.22)" stroke={`url(#${g})`} strokeWidth={ICON_STROKE} />
    </svg>
  );
}

function AvatarMenuIconName({ gradId }: { gradId: string }) {
  const g = `${gradId}-name`;
  return (
    <svg className="avatar-menu-sheet-btn-icon-svg" viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <defs>
        <linearGradient id={g} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#f5f3ff" />
          <stop offset="45%" stopColor="#e9d5ff" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        fill="rgba(167,139,250,0.15)"
        stroke={`url(#${g})`}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AvatarMenuIconEdit({ gradId }: { gradId: string }) {
  const g = `${gradId}-edit`;
  return (
    <svg className="avatar-menu-sheet-name-edit-icon" viewBox="0 0 24 24" width={14} height={14} aria-hidden>
      <defs>
        <linearGradient id={g} x1="4" y1="3" x2="20" y2="21" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fde68a" />
          <stop offset="50%" stopColor="#fbbf24" />
          <stop offset="100%" stopColor="#d97706" />
        </linearGradient>
      </defs>
      <path
        d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"
        fill="rgba(251, 191, 36, 0.12)"
        stroke={`url(#${g})`}
        strokeWidth={ICON_STROKE}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AvatarMenuIconPause({ gradId }: { gradId: string }) {
  const g = `${gradId}-pause`;
  return (
    <svg className="avatar-menu-sheet-btn-icon-svg" viewBox="0 0 24 24" width={18} height={18} aria-hidden>
      <defs>
        <linearGradient id={g} x1="5" y1="4" x2="19" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#fed7aa" />
          <stop offset="50%" stopColor="#fb923c" />
          <stop offset="100%" stopColor="#ea580c" />
        </linearGradient>
      </defs>
      <rect x="6" y="5" width="4" height="14" rx="1" fill={`url(#${g})`} />
      <rect x="14" y="5" width="4" height="14" rx="1" fill={`url(#${g})`} />
    </svg>
  );
}

export function UserAvatarMenuSheet({
  displayName,
  avatarDataUrl,
  state,
  offlineMode,
  showPause,
  takingPause,
  onClose,
  onOpenProfileModal,
  onSaveAvatar,
  onPhotoCaptured,
  onSaveDisplayName,
  onTakePause,
}: UserAvatarMenuSheetProps) {
  const isDesktopProfileUi = useDesktopProfileUi();
  const menuAvatarSizePx = isDesktopProfileUi ? 92 : 68;
  const iconGradPrefix = useId().replace(/:/g, '');
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [avatarEditorOpen, setAvatarEditorOpen] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [draftName, setDraftName] = useState(displayName);
  const [nameError, setNameError] = useState<string | null>(null);
  const p = state.players[0];
  const localRating = getLocalRating();
  const bidAccuracy = getBidAccuracyInGame(state.dealHistory ?? [], 0);
  const currentBid = state.bids[0];
  const inPlay =
    state.phase === 'playing' || state.phase === 'trick-complete' || state.phase === 'bidding' || state.phase === 'dark-bidding';

  useEffect(() => {
    if (!editingName) setDraftName(displayName);
  }, [displayName, editingName]);

  useEffect(() => {
    if (!editingName) return;
    const t = window.setTimeout(() => nameInputRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [editingName]);

  const cancelNameEdit = useCallback(() => {
    setEditingName(false);
    setDraftName(displayName);
    setNameError(null);
  }, [displayName]);

  const commitNameEdit = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setNameError('Введите имя');
      return;
    }
    const next = trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
    setNameError(null);
    if (next === displayName.trim()) {
      setEditingName(false);
      return;
    }
    onSaveDisplayName?.(next);
    setEditingName(false);
  }, [draftName, displayName, onSaveDisplayName]);

  const startNameEdit = useCallback(() => {
    if (!onSaveDisplayName) return;
    setDraftName(displayName);
    setNameError(null);
    setEditingName(true);
  }, [displayName, onSaveDisplayName]);

  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (editingName) {
          e.stopPropagation();
          cancelNameEdit();
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [onClose, editingName, cancelNameEdit]);

  const openProfile = () => {
    onOpenProfileModal?.();
    onClose();
  };

  const canEditName = !!onSaveDisplayName;

  return (
    <>
    <div
      className="avatar-menu-sheet-backdrop"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="presentation"
    >
      <div
        className={[
          'avatar-menu-sheet-card',
          'avatar-menu-sheet-root',
          isDesktopProfileUi ? 'avatar-menu-sheet-root--desktop' : '',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-menu-sheet-name"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="avatar-menu-sheet-card__glow" aria-hidden />
        <button type="button" className="avatar-menu-sheet-close" onClick={onClose} aria-label="Закрыть">
          <svg className="avatar-menu-sheet-close__icon" viewBox="0 0 24 24" width={12} height={12} aria-hidden>
            <path
              d="M18 6L6 18M6 6l12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.25}
              strokeLinecap="round"
            />
          </svg>
        </button>

        <div className="avatar-menu-sheet-header">
          <p className="avatar-menu-sheet-card__eyebrow" aria-hidden>
            {offlineMode ? 'Офлайн · ваш профиль' : 'Онлайн · ваш профиль'}
          </p>
          <div className="avatar-menu-sheet-header__main">
            <div className="avatar-menu-sheet-header__side avatar-menu-sheet-header__side--left">
              <div className="avatar-menu-sheet-name-panel">
                <div className="avatar-menu-sheet-name-panel__head">
                  <span className="avatar-menu-sheet-name-label">Имя:</span>
                  {canEditName ? (
                    <button
                      type="button"
                      className={[
                        'avatar-menu-sheet-name-trigger',
                        editingName ? 'avatar-menu-sheet-name-trigger--editing' : '',
                      ].join(' ')}
                      onClick={startNameEdit}
                      disabled={editingName}
                      aria-label={`Имя: ${displayName}. Нажмите, чтобы изменить`}
                    >
                      <span id="avatar-menu-sheet-name" className="avatar-menu-sheet-name">
                        {displayName}
                      </span>
                      <AvatarMenuIconEdit gradId={iconGradPrefix} />
                    </button>
                  ) : (
                    <span id="avatar-menu-sheet-name" className="avatar-menu-sheet-name avatar-menu-sheet-name--static">
                      {displayName}
                    </span>
                  )}
                </div>
                {editingName && canEditName && (
                  <div className="avatar-menu-sheet-name-edit" role="group" aria-label="Редактирование имени">
                    <input
                      ref={nameInputRef}
                      type="text"
                      className="avatar-menu-sheet-name-input"
                      value={draftName}
                      maxLength={MAX_DISPLAY_NAME_LENGTH}
                      autoComplete="nickname"
                      enterKeyHint="done"
                      aria-label="Новое имя"
                      aria-invalid={nameError ? true : undefined}
                      onChange={(e) => {
                        setDraftName(e.target.value);
                        if (nameError) setNameError(null);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitNameEdit();
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          e.stopPropagation();
                          cancelNameEdit();
                        }
                      }}
                    />
                    <div className="avatar-menu-sheet-name-edit__meta">
                      <span className="avatar-menu-sheet-name-edit__counter" aria-live="polite">
                        {draftName.trim().length}/{MAX_DISPLAY_NAME_LENGTH}
                      </span>
                      <div className="avatar-menu-sheet-name-edit__actions">
                        <button
                          type="button"
                          className="avatar-menu-sheet-name-edit__btn avatar-menu-sheet-name-edit__btn--save"
                          onClick={commitNameEdit}
                          aria-label="Сохранить имя"
                        >
                          Готово
                        </button>
                        <button
                          type="button"
                          className="avatar-menu-sheet-name-edit__btn avatar-menu-sheet-name-edit__btn--cancel"
                          onClick={cancelNameEdit}
                          aria-label="Отменить"
                        >
                          <svg className="avatar-menu-sheet-name-edit__cancel-icon" viewBox="0 0 24 24" width={13} height={13} aria-hidden>
                            <path
                              d="M18 6L6 18M6 6l12 12"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={2.5}
                              strokeLinecap="round"
                            />
                          </svg>
                        </button>
                      </div>
                    </div>
                    {nameError && (
                      <p className="avatar-menu-sheet-name-edit__error" role="alert">
                        {nameError}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>
            <div className="avatar-menu-sheet-header__avatar-col">
              <button
                type="button"
                className={[
                  'avatar-menu-sheet-avatar-stage',
                  onSaveAvatar ? 'avatar-menu-sheet-avatar-stage--clickable' : '',
                ].join(' ')}
                onClick={() => onSaveAvatar && setAvatarEditorOpen(true)}
                disabled={!onSaveAvatar}
                aria-label="Открыть редактор аватарки"
                title={onSaveAvatar ? 'Нажмите, чтобы увеличить и нарисовать аватар' : undefined}
              >
                <div className="avatar-menu-sheet-avatar-halo" aria-hidden />
                <div className="avatar-menu-sheet-avatar-ring">
                  <PlayerAvatar
                    name={displayName}
                    avatarDataUrl={avatarDataUrl}
                  sizePx={menuAvatarSizePx}
                  className="avatar-menu-sheet-avatar-face"
                  />
                </div>
              </button>
              {onSaveAvatar && (
                <p className="avatar-menu-sheet-avatar-tap-hint avatar-menu-sheet-avatar-tap-hint--prominent">
                  <span className="avatar-menu-sheet-avatar-tap-hint__line">Нажмите на аватар —</span>
                  <span className="avatar-menu-sheet-avatar-tap-hint__line">редактор</span>
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="avatar-menu-sheet-stats player-info-panel-stats">
          <div className="avatar-menu-sheet-stat-row">
            <span className="player-info-panel-label player-info-panel-label--party-score">Очки в партии</span>
            <span className="player-info-panel-value player-info-panel-value--party-score">
              {p.score >= 0 ? '+' : ''}
              {p.score}
            </span>
          </div>
          {inPlay && currentBid != null && (
            <div className="avatar-menu-sheet-stat-row">
              <span className="avatar-menu-sheet-stat-label">Текущий заказ</span>
              <span className="avatar-menu-sheet-stat-value">{currentBid}</span>
            </div>
          )}
          {state.phase === 'playing' && (
            <div className="avatar-menu-sheet-stat-row">
              <span className="avatar-menu-sheet-stat-label">Взяток в раздаче</span>
              <span className="avatar-menu-sheet-stat-value">{p.tricksTaken}</span>
            </div>
          )}
          <div className="avatar-menu-sheet-stat-row">
            <span className="player-info-panel-label player-info-panel-label--bid-accuracy-deal">
              Точность заказов в этой партии
            </span>
            <span className="player-info-panel-value player-info-panel-value--bid-accuracy-deal">{bidAccuracy}%</span>
          </div>
          {localRating && (
            <>
              <div className="avatar-menu-sheet-stat-row">
                <span className="avatar-menu-sheet-stat-label avatar-menu-sheet-stat-label--games">Игр сыграно</span>
                <span className="avatar-menu-sheet-stat-value avatar-menu-sheet-stat-value--games">
                  {localRating.gamesPlayed}
                </span>
              </div>
              <div className="avatar-menu-sheet-stat-row">
                <span className="avatar-menu-sheet-stat-label avatar-menu-sheet-stat-label--wins">Побед</span>
                <span className="avatar-menu-sheet-stat-value avatar-menu-sheet-stat-value--wins">
                  {localRating.wins}
                </span>
              </div>
              {localRating.bidAccuracyCount > 0 && (
                <div className="avatar-menu-sheet-stat-row">
                  <span className="avatar-menu-sheet-stat-label avatar-menu-sheet-stat-label--avg-accuracy">
                    Средняя точность заказов
                  </span>
                  <span className="avatar-menu-sheet-stat-value avatar-menu-sheet-stat-value--avg-accuracy">
                    {Math.round(localRating.bidAccuracySum / localRating.bidAccuracyCount)}%
                  </span>
                </div>
              )}
            </>
          )}
        </div>

        <div className="avatar-menu-sheet-actions">
          {(onOpenProfileModal || onSaveAvatar || onSaveDisplayName) && (
            <div className="avatar-menu-sheet-profile-row">
              <button
                type="button"
                className="avatar-menu-sheet-btn avatar-menu-sheet-btn--photo"
                onClick={() => {
                  if (onSaveAvatar) setAvatarEditorOpen(true);
                  else openProfile();
                }}
              >
                <AvatarMenuBtnIcon>
                  <AvatarMenuIconPhoto gradId={iconGradPrefix} />
                </AvatarMenuBtnIcon>
                <span className="avatar-menu-sheet-btn-label">Сменить фото</span>
              </button>
              <button
                type="button"
                className="avatar-menu-sheet-btn avatar-menu-sheet-btn--name"
                onClick={canEditName ? startNameEdit : openProfile}
              >
                <AvatarMenuBtnIcon>
                  <AvatarMenuIconName gradId={iconGradPrefix} />
                </AvatarMenuBtnIcon>
                <span className="avatar-menu-sheet-btn-label">Изменить имя</span>
              </button>
            </div>
          )}
          {showPause && onTakePause && (
            <button
              type="button"
              className="avatar-menu-sheet-btn avatar-menu-sheet-btn--pause"
              disabled={takingPause}
              onClick={() => void onTakePause()}
            >
              <AvatarMenuBtnIcon>
                <AvatarMenuIconPause gradId={iconGradPrefix} />
              </AvatarMenuBtnIcon>
              <span className="avatar-menu-sheet-btn-label">{takingPause ? 'Пауза…' : 'Взять паузу'}</span>
            </button>
          )}
        </div>
      </div>
    </div>
    {avatarEditorOpen && onSaveAvatar && (
      <AvatarEditorModal
        displayName={displayName}
        initialAvatarDataUrl={avatarDataUrl}
        onPhotoCaptured={onPhotoCaptured}
        onSave={(url) => {
          onSaveAvatar(url);
          setAvatarEditorOpen(false);
        }}
        onCancel={() => setAvatarEditorOpen(false)}
      />
    )}
    </>
  );
}
