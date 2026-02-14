/**
 * Модалка «Имя и фото»: ввод имени и опциональная загрузка фото (Data URL).
 * Используется при первом запуске и в пункте меню «Профиль».
 */

import React, { useState, useRef } from 'react';
import { PlayerAvatar } from './PlayerAvatar';

const MAX_NAME_LENGTH = 17;
const MAX_IMAGE_SIZE_BYTES = 800 * 1024; // 800 KB — чтобы не переполнять localStorage

export interface NameAvatarModalProps {
  initialDisplayName?: string;
  initialAvatarDataUrl?: string | null;
  onConfirm: (profile: { displayName: string; avatarDataUrl?: string | null }) => void;
  onCancel?: () => void;
  title?: string;
  confirmLabel?: string;
}

export function NameAvatarModal({
  initialDisplayName = '',
  initialAvatarDataUrl = null,
  onConfirm,
  onCancel,
  title = 'Как к вам обращаться?',
  confirmLabel = 'Сохранить',
}: NameAvatarModalProps) {
  const [displayName, setDisplayName] = useState(initialDisplayName.trim() || '');
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null>(initialAvatarDataUrl ?? null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError('Выберите изображение (JPG, PNG и т.д.)');
      return;
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      setError(`Файл не больше ${Math.round(MAX_IMAGE_SIZE_BYTES / 1024)} КБ`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setAvatarDataUrl(dataUrl);
      setError(null);
    };
    reader.onerror = () => setError('Не удалось прочитать файл');
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const removePhoto = () => {
    setAvatarDataUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

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
        padding: 16,
      }}
      onClick={(e) => e.target === e.currentTarget && onCancel?.()}
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
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                style={{ display: 'none' }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
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
                {avatarDataUrl ? 'Сменить фото' : 'Добавить фото'}
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
            {error && (
              <p style={{ margin: 0, fontSize: 14, color: '#f87171' }}>{error}</p>
            )}
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
          </div>
        </form>
      </div>
    </div>
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
