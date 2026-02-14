/**
 * Аватар игрока: круг с фото (Data URL) или инициалами и цветом по хешу имени.
 * Размер задаётся sizePx (по умолчанию 28).
 */

import React from 'react';

function getInitials(name: string): string {
  const t = name.trim();
  if (!t) return '?';
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase().slice(0, 2);
  if (t.length >= 2) return t.slice(0, 2).toUpperCase();
  return t[0].toUpperCase();
}

function hashToColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i) | 0;
  const hue = Math.abs(h % 360);
  return `hsl(${hue}, 45%, 42%)`;
}

export interface PlayerAvatarProps {
  name: string;
  avatarDataUrl?: string | null;
  sizePx?: number;
  className?: string;
  title?: string;
}

export function PlayerAvatar({ name, avatarDataUrl, sizePx = 28, className, title }: PlayerAvatarProps) {
  const size = Math.max(16, sizePx);
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
    background: avatarDataUrl ? undefined : hashToColor(name),
    color: avatarDataUrl ? undefined : '#fff',
    fontSize: Math.round(size * 0.45),
    fontWeight: 700,
    lineHeight: 1,
  };

  const avatarClassName = className ? `player-avatar ${className}` : 'player-avatar';
  if (avatarDataUrl) {
    return (
      <span
        className={avatarClassName}
        style={style}
        title={title ?? name}
        role="img"
        aria-label={name}
      >
        <img
          src={avatarDataUrl}
          alt=""
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
        />
      </span>
    );
  }

  return (
    <span
      className={avatarClassName}
      style={style}
      title={title ?? name}
      role="img"
      aria-label={name}
    >
      {getInitials(name)}
    </span>
  );
}
