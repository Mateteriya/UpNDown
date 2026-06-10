/**
 * Модалка «Имя и фото»: ввод имени и опциональная загрузка фото (Data URL).
 * Селфи → полный редактор; галерея → отдельный picker без capture.
 */

import React, { useState, useRef } from 'react';
import { MAX_AVATAR_IMAGE_SIZE_BYTES } from '../lib/avatarImage';
import { openGalleryPicker } from '../lib/avatarCamera';
import { persistAvatarToProfile } from '../lib/profileAvatarSave';
import { PlayerAvatar } from './PlayerAvatar';
import { AvatarEditorModal } from './AvatarEditorModal';

export const MAX_DISPLAY_NAME_LENGTH = 17;
const MAX_NAME_LENGTH = MAX_DISPLAY_NAME_LENGTH;
const MAX_IMAGE_SIZE_BYTES = MAX_AVATAR_IMAGE_SIZE_BYTES;

export interface NameAvatarModalProps {
  initialDisplayName?: string;
  initialAvatarDataUrl?: string | null;
  onConfirm: (profile: { displayName: string; avatarDataUrl?: string | null }) => void;
  onCancel?: () => void;
  title?: string;
  confirmLabel?: string;
  /** Сразу после выбора фото (камера на телефоне может перезагрузить страницу). */
  onPhotoCaptured?: (avatarDataUrl: string) => void;
}

export function NameAvatarModal({
  initialDisplayName = '',
  initialAvatarDataUrl = null,
  onConfirm,
  onCancel,
  title = 'Как к вам обращаться?',
  confirmLabel = 'Сохранить',
  onPhotoCaptured,
}: NameAvatarModalProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName.trim() || '');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(initialAvatarDataUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const name = displayName.trim();
    if (!name) {
      setError('Введите имя');
      return;
    }
    setError(null);
    onConfirm({
      displayName: name.slice(0, MAX_NAME_LENGTH),
      avatarDataUrl: avatarDataUrl ?? null,
    });
  };

  const handleGalleryFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
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
  };

  return (
    <>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 16,
        }}
        onClick={(e) => e.target === e.currentTarget && !editorOpen && onCancel?.()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="name-avatar-modal-title"
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.3)',
            boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
            maxWidth: 360,
            width: '100%',
            padding: 24,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2 id="name-avatar-modal-title" style={{ margin: '0 0 20px', fontSize: 20, color: '#f1f5f9' }}>
            {title}
          </h2>
          <form onSubmit={handleSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <PlayerAvatar name={displayName || '?'} avatarDataUrl={avatarDataUrl} sizePx={64} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <label htmlFor="name-avatar-input" style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
                    Имя (до {MAX_NAME_LENGTH} символов)
                  </label>
                  <input
                    id="name-avatar-input"
                    type="text"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value.slice(0, MAX_NAME_LENGTH))}
                    maxLength={MAX_NAME_LENGTH}
                    placeholder="Как к вам обращаться?"
                    autoFocus
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      fontSize: 16,
                      borderRadius: 8,
                      border: '1px solid #475569',
                      background: '#0f172a',
                      color: '#f8fafc',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'center', flexWrap: 'wrap' }}>
                <input
                  ref={galleryInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleGalleryFileChange}
                  style={{ display: 'none' }}
                />
                <button
                  type="button"
                  onClick={() => setEditorOpen(true)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    borderRadius: 8,
                    border: '1px solid rgba(34, 211, 238, 0.45)',
                    background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                    color: '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  Селфи / редактор
                </button>
                <button
                  type="button"
                  onClick={() => openGalleryPicker(galleryInputRef.current)}
                  style={{
                    padding: '8px 16px',
                    fontSize: 14,
                    borderRadius: 8,
                    border: '1px solid #475569',
                    background: '#334155',
                    color: '#e2e8f0',
                    cursor: 'pointer',
                  }}
                >
                  {avatarDataUrl ? 'Из галереи' : 'Галерея'}
                </button>
                {avatarDataUrl && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    style={{
                      padding: '8px 16px',
                      fontSize: 14,
                      borderRadius: 8,
                      border: '1px solid #475569',
                      background: 'transparent',
                      color: '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Удалить фото
                  </button>
                )}
              </div>
              <span style={{ display: 'block', fontSize: 12, color: '#64748b', marginTop: 6, textAlign: 'center', lineHeight: 1.45 }}>
                «Селфи / редактор» — полный редактор с рамками и рисованием. «Галерея» — фото с телефона.
              </span>
            </div>
            {error && <p style={{ margin: 0, fontSize: 14, color: '#f87171' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 12, width: '100%', justifyContent: 'flex-end', marginTop: 8 }}>
              {onCancel && (
                <button type="button" onClick={onCancel} style={secondaryBtnStyle}>
                  Отмена
                </button>
              )}
              <button type="submit" style={primaryBtnStyle}>
                {confirmLabel}
              </button>
            </div>
          </form>
        </div>
      </div>
      {editorOpen && (
        <AvatarEditorModal
          displayName={displayName || '?'}
          initialAvatarDataUrl={avatarDataUrl}
          onPhotoCaptured={onPhotoCaptured}
          onSave={(url) => {
            setAvatarDataUrl(url);
            if (url) onPhotoCaptured?.(url);
            setEditorOpen(false);
          }}
          onCancel={() => setEditorOpen(false)}
        />
      )}
    </>
  );
}

const primaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 8,
  border: 'none',
  background: '#6366f1',
  color: '#fff',
  cursor: 'pointer',
};
const secondaryBtnStyle: React.CSSProperties = {
  padding: '10px 20px',
  fontSize: 16,
  borderRadius: 8,
  border: '1px solid #475569',
  background: 'transparent',
  color: '#94a3b8',
  cursor: 'pointer',
};
