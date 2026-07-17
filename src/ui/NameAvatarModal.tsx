/**
 * Модалка «Имя и фото»: ввод имени и опциональная загрузка фото (Data URL).
 * Селфи → системная камера; галерея → picker без capture.
 * Полный редактор аватарок — в онлайне / ЛК, не здесь.
 * Космический компактный UI; без autofocus — клавиатура только по тапу.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_AVATAR_IMAGE_SIZE_BYTES } from '../lib/avatarImage';
import { openGalleryPicker, openNativeCameraPicker } from '../lib/avatarCamera';
import {
  clearNameAvatarModalOpen,
  markNameAvatarModalOpen,
  persistAvatarToProfile,
} from '../lib/profileAvatarSave';
import { PlayerAvatar } from './PlayerAvatar';
import { AvatarNeonColorPicker } from './AvatarNeonColorPicker';
import '../styles/name-avatar-modal.css';

export const MAX_DISPLAY_NAME_LENGTH = 17;
const MAX_NAME_LENGTH = MAX_DISPLAY_NAME_LENGTH;
const MAX_IMAGE_SIZE_BYTES = MAX_AVATAR_IMAGE_SIZE_BYTES;
const DEFAULT_AVATAR_BG = '#1a0033';

export interface NameAvatarModalProps {
  initialDisplayName?: string;
  initialAvatarDataUrl?: string | null;
  initialAvatarBgColor?: string | null;
  /** Чтобы после камеры/перезагрузки вернуть ту же модалку (first-run / profile / …). */
  resumeMode?: 'first-run' | 'profile' | 'new-account';
  onConfirm: (profile: {
    displayName: string;
    avatarDataUrl?: string | null;
    avatarBgColor?: string | null;
  }) => void;
  onCancel?: () => void;
  title?: string;
  confirmLabel?: string;
  /** Сразу после выбора фото (камера на телефоне может перезагрузить страницу). */
  onPhotoCaptured?: (avatarDataUrl: string) => void;
}

export function NameAvatarModal({
  initialDisplayName = '',
  initialAvatarDataUrl = null,
  initialAvatarBgColor = null,
  resumeMode = 'profile',
  onConfirm,
  onCancel,
  title = 'Как к вам обращаться?',
  confirmLabel = 'Сохранить',
  onPhotoCaptured,
}: NameAvatarModalProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName.trim() || '');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(initialAvatarDataUrl ?? null);
  const [avatarBgColor, setAvatarBgColor] = useState<string>(
    initialAvatarBgColor && /^#[0-9A-Fa-f]{3,8}$/.test(initialAvatarBgColor.trim())
      ? initialAvatarBgColor.trim()
      : DEFAULT_AVATAR_BG,
  );
  const [bgNeon, setBgNeon] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inputFocused, setInputFocused] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const syncVisualViewport = useCallback(() => {
    const vv = window.visualViewport;
    const root = rootRef.current;
    if (!root) return;
    const h = vv?.height ?? window.innerHeight;
    root.style.setProperty('--nam-vvh', `${Math.round(h)}px`);
  }, []);

  useEffect(() => {
    syncVisualViewport();
    const vv = window.visualViewport;
    if (!vv) return;
    vv.addEventListener('resize', syncVisualViewport);
    vv.addEventListener('scroll', syncVisualViewport);
    return () => {
      vv.removeEventListener('resize', syncVisualViewport);
      vv.removeEventListener('scroll', syncVisualViewport);
    };
  }, [syncVisualViewport]);

  useEffect(() => {
    if (!inputFocused) return;
    syncVisualViewport();
    const id = window.setTimeout(() => {
      panelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }, 80);
    return () => window.clearTimeout(id);
  }, [inputFocused, syncVisualViewport]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError('Введите имя');
      return;
    }
    setError(null);
    clearNameAvatarModalOpen();
    onConfirm({
      displayName: name.slice(0, MAX_NAME_LENGTH),
      avatarDataUrl: avatarDataUrl ?? null,
      avatarBgColor,
    });
  };

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Выберите изображение (JPG, PNG и т.д.)');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(`Файл не больше ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024 / 1024)} МБ`);
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = async () => {
      let dataUrl = reader.result as string;
      try {
        dataUrl = await persistAvatarToProfile(dataUrl);
        setAvatarDataUrl(dataUrl);
        onPhotoCaptured?.(dataUrl);
        /* Не снимаем флаги здесь: на телефоне часто идёт перезагрузка ПОСЛЕ
           onChange — иначе модалка не откроется снова. Сброс только на Сохранить/Отмена. */
      } catch {
        setError('Не удалось обработать фото');
      }
    };
    reader.onerror = () => setError('Не удалось прочитать файл');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePhoto = () => {
    setAvatarDataUrl(null);
    if (galleryInputRef.current) galleryInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const nameLen = displayName.length;

  return (
    <>
      <div
        ref={rootRef}
        className={['name-avatar-modal', inputFocused ? 'name-avatar-modal--input-focus' : '']
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => e.target === e.currentTarget && onCancel?.()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-avatar-modal-title"
      >
        <div
          ref={panelRef}
          className="name-avatar-modal__panel"
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="name-avatar-modal-title" className="name-avatar-modal__title">
            {title}
          </h2>
          <form className="name-avatar-modal__form" onSubmit={handleSubmit}>
            <div className="name-avatar-modal__identity">
              <div className="name-avatar-modal__avatar-col">
                <PlayerAvatar
                  name={displayName || '?'}
                  avatarDataUrl={avatarDataUrl}
                  avatarBgColor={avatarBgColor}
                  sizePx={52}
                />
                {!avatarDataUrl ? (
                  <div className="name-avatar-modal__bg-palette" aria-label="Цвет фона аватара">
                    <AvatarNeonColorPicker
                      color={avatarBgColor}
                      onChange={setAvatarBgColor}
                      neonBrush={bgNeon}
                      onNeonBrushChange={setBgNeon}
                      hideExternalModeToggle
                      className="name-avatar-modal__color-picker"
                    />
                  </div>
                ) : (
                  <p className="name-avatar-modal__bg-note">Фон виден без фото</p>
                )}
              </div>
              <div className="name-avatar-modal__name-block">
                <div className="name-avatar-modal__name-meta">
                  <span className="name-avatar-modal__hint">Имя в игре</span>
                  <span className="name-avatar-modal__count" aria-live="polite">
                    {nameLen}/{MAX_NAME_LENGTH}
                  </span>
                </div>
                <input
                  id="name-avatar-input"
                  className="name-avatar-modal__input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                  onFocus={() => setInputFocused(true)}
                  onBlur={() => setInputFocused(false)}
                  maxLength={MAX_NAME_LENGTH}
                  placeholder="Коснитесь, чтобы ввести"
                  enterKeyHint="done"
                  autoComplete="nickname"
                  autoCorrect="off"
                  spellCheck={false}
                />
              </div>
            </div>

            <div className="name-avatar-modal__photo-row">
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageFileChange}
                style={{ display: 'none' }}
              />
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handleImageFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="name-avatar-modal__chip name-avatar-modal__chip--selfie"
                onClick={() => {
                  markNameAvatarModalOpen(resumeMode);
                  openNativeCameraPicker(cameraInputRef.current);
                }}
                title="Сделать селфи"
              >
                Селфи
              </button>
              <button
                type="button"
                className="name-avatar-modal__chip name-avatar-modal__chip--gallery"
                onClick={() => openGalleryPicker(galleryInputRef.current)}
                title="Фото с устройства"
              >
                Галерея
              </button>
              {avatarDataUrl ? (
                <button
                  type="button"
                  className="name-avatar-modal__chip name-avatar-modal__chip--remove"
                  onClick={removePhoto}
                >
                  Убрать
                </button>
              ) : null}
            </div>

            {error ? <p className="name-avatar-modal__error">{error}</p> : null}

            <div className="name-avatar-modal__actions">
              {onCancel ? (
                <button
                  type="button"
                  className="name-avatar-modal__btn name-avatar-modal__btn--ghost"
                  onClick={() => {
                    clearNameAvatarModalOpen();
                    onCancel();
                  }}
                >
                  Отмена
                </button>
              ) : null}
              <button type="submit" className="name-avatar-modal__btn name-avatar-modal__btn--primary">
                {confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
