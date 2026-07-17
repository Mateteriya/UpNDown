/**
 * Аватар игрока: круг с фото (Data URL) или инициалами и цветом фона.
 * Размер задаётся sizePx (по умолчанию 28).
 */

import React from 'react';
import './player-avatar.css';

/**
 * Инициалы плейсхолдера:
 * — первая буква первого слова;
 * — все цифры из имени (остальные слова-буквы игнор).
 * Пример: «Мыша 17» → «М17»; «Анна Петрова» → «А».
 */
export function getPlayerAvatarInitials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const firstWord = t.split(/\s+/).filter(Boolean)[0] ?? t;
  let letter: string | null = null;
  for (const ch of firstWord) {
    if (/\p{L}/u.test(ch)) {
      letter = ch;
      break;
    }
  }
  const digits = (t.match(/\d/g) ?? []).join('').slice(0, 4);
  if (letter && digits) return `${letter.toUpperCase()}${digits}`;
  if (letter) return letter.toUpperCase();
  if (digits) return digits;
  const fallback = firstWord[0];
  return fallback ? fallback.toUpperCase() : '?';
}

function hashToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (((h << 5) - h) + name.charCodeAt(i)) | 0;
  const hue = Math.abs(h % 360);
  return `hsl(${hue}, 45%, 28%)`;
}

export interface PlayerAvatarProps {
  name: string;
  avatarDataUrl?: string | null;
  /** Фон плейсхолдера (без фото). Если нет — цвет от хеша имени. */
  avatarBgColor?: string | null;
  sizePx?: number;
  className?: string;
  title?: string;
}

function classNameHasOfflineAiPalette(className?: string): boolean {
  return !!className && className.includes('player-avatar-ai-offline');
}

export function PlayerAvatar({
  name,
  avatarDataUrl,
  avatarBgColor,
  sizePx = 28,
  className,
  title,
}: PlayerAvatarProps) {
  const size = Math.max(16, sizePx);
  const offlineAiPalette = classNameHasOfflineAiPalette(className);
  const initials = getPlayerAvatarInitials(name);
  const longInitials = initials.length > 2;
  const bg =
    avatarDataUrl || offlineAiPalette
      ? undefined
      : avatarBgColor && /^#[0-9A-Fa-f]{3,8}$/.test(avatarBgColor.trim())
        ? avatarBgColor.trim()
        : hashToColor(name);

  const style: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    overflow: 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: bg,
    fontSize: Math.round(size * (longInitials ? 0.32 : 0.45)),
    fontWeight: 800,
    lineHeight: 1,
  };

  const avatarClassName = className ? `player-avatar ${className}` : 'player-avatar';
  if (avatarDataUrl) {
    return (
      <span className={avatarClassName} style={style} title={title ?? name} role="img" aria-label={name}>
        <img
          src={avatarDataUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </span>
    );
  }

  return (
    <span className={avatarClassName} style={style} title={title ?? name} role="img" aria-label={name}>
      <span className="player-avatar__initials" aria-hidden="true">
        {initials}
      </span>
    </span>
  );
}
