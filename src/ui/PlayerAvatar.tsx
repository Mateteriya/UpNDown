/**
 * Аватар игрока: круг с фото (Data URL) или инициалами и цветом фона.
 * Размер задаётся sizePx (по умолчанию 28).
 *
 * «Плашка снизу» — отдельный HTML-элемент (не часть PNG).
 * Только premium+аккаунт + pref; вне аккаунта не показывается.
 * Лицо всегда в круглом клипе — иначе у JPEG видны чёрные углы квадрата.
 */

import React, { useEffect, useMemo, useState } from 'react';
import {
  AVATAR_BADGE_PAD_INSET_FRAC,
  avatarImageHasTransparentBadgePad,
} from '../lib/avatarImage';
import {
  defaultAvatarBadgeText,
  normalizeAvatarBadgeText,
} from '../lib/avatarEditorTemplates';
import {
  getAvatarNameBadgePref,
  measurePlayerAvatarNameBadgeLayout,
  saveAvatarNameBadgePref,
} from '../lib/avatarNameBadge';
import { useAuth } from '../contexts/AuthContext';
import {
  isLocalAiNameBadgePreviewEnabled,
  isPremiumAvatarNameBadgeEnabled,
} from '../lib/featureFlags';
import { getPlayerProfile } from '../game/persistence';
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

function classNameHasOfflineAiPalette(className?: string): boolean {
  return !!className && className.includes('player-avatar-ai-offline');
}

export interface PlayerAvatarProps {
  name: string;
  avatarDataUrl?: string | null;
  /** Фон плейсхолдера (без фото). Если нет — цвет от хеша имени. */
  avatarBgColor?: string | null;
  sizePx?: number;
  className?: string;
  title?: string;
  /**
   * HTML-плашка снизу.
   * true — свой аватар (если premium+аккаунт+pref);
   * false — никогда;
   * undefined — auto: имя совпадает с профилем и не AI-палитра.
   */
  nameBadge?: boolean;
  /**
   * Чужой онлайн-слот: плашка из player_slots (не localStorage зрителя).
   * enabled=true → показать text (или имя).
   */
  remoteNameBadge?: { enabled: boolean; text?: string | null } | null;
}

export function PlayerAvatar({
  name,
  avatarDataUrl,
  avatarBgColor,
  sizePx = 28,
  className,
  title,
  nameBadge,
  remoteNameBadge,
}: PlayerAvatarProps) {
  const { user } = useAuth();
  const accountPremiumBadge = isPremiumAvatarNameBadgeEnabled(user?.id);
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

  const pref = useMemo(
    () => (accountPremiumBadge ? getAvatarNameBadgePref(user?.id) : null),
    [accountPremiumBadge, user?.id, avatarDataUrl],
  );

  const isSelfAuto = useMemo(() => {
    if (offlineAiPalette) return false;
    try {
      const profileName = getPlayerProfile().displayName?.trim() ?? '';
      return Boolean(profileName && profileName === name.trim());
    } catch {
      return false;
    }
  }, [name, offlineAiPalette]);

  /** DEV: у ИИ за столом — превью плашек «как у premium-оппонентов». */
  const aiBadgePreview = offlineAiPalette && isLocalAiNameBadgePreviewEnabled();
  const remoteBadgeOn = Boolean(remoteNameBadge?.enabled);

  const wantBadge =
    aiBadgePreview ||
    remoteBadgeOn ||
    (accountPremiumBadge &&
      !offlineAiPalette &&
      (nameBadge === true || (nameBadge !== false && isSelfAuto)));

  const [legacyPad, setLegacyPad] = useState(false);
  const [badgeEnabled, setBadgeEnabled] = useState(() => Boolean(pref?.enabled));

  useEffect(() => {
    setBadgeEnabled(Boolean(pref?.enabled));
  }, [pref?.enabled, pref?.updatedAt]);

  /* Legacy: облачный PNG с полями → включить pref один раз, лицо без pad. */
  useEffect(() => {
    if (!avatarDataUrl?.startsWith('data:image/png')) {
      setLegacyPad(false);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const hasPad = avatarImageHasTransparentBadgePad(img);
      setLegacyPad(hasPad);
      if (
        hasPad &&
        wantBadge &&
        !aiBadgePreview &&
        !remoteBadgeOn &&
        user?.id &&
        !getAvatarNameBadgePref(user.id)?.enabled
      ) {
        saveAvatarNameBadgePref(user.id, {
          enabled: true,
          text: defaultAvatarBadgeText(name),
          displayName: name,
        });
        setBadgeEnabled(true);
      }
    };
    img.onerror = () => {
      if (!cancelled) setLegacyPad(false);
    };
    img.src = avatarDataUrl;
    return () => {
      cancelled = true;
    };
  }, [avatarDataUrl, wantBadge, aiBadgePreview, remoteBadgeOn, user?.id, name]);

  const showHtmlBadge = aiBadgePreview || remoteBadgeOn || (wantBadge && badgeEnabled);
  const badgeText = aiBadgePreview
    ? defaultAvatarBadgeText(name)
    : remoteBadgeOn
      ? normalizeAvatarBadgeText(remoteNameBadge?.text ?? '') || defaultAvatarBadgeText(name)
      : normalizeAvatarBadgeText(pref?.text ?? '') || defaultAvatarBadgeText(name);
  const badgeLayout = showHtmlBadge
    ? measurePlayerAvatarNameBadgeLayout(size, badgeText)
    : null;

  const style: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
    borderRadius: '50%',
    overflow: showHtmlBadge ? 'visible' : 'hidden',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    background: bg ?? (avatarDataUrl ? 'transparent' : undefined),
    fontSize: Math.round(size * (longInitials ? 0.32 : 0.45)),
    fontWeight: 800,
    lineHeight: 1,
    position: 'relative',
    boxSizing: 'border-box',
  };

  const avatarClassName = [
    'player-avatar',
    showHtmlBadge ? 'player-avatar--name-badge' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const imgStyle: React.CSSProperties = legacyPad
    ? ({
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        objectViewBox: `inset(${(AVATAR_BADGE_PAD_INSET_FRAC * 100).toFixed(3)}%)`,
        display: 'block',
      } as React.CSSProperties)
    : { width: '100%', height: '100%', objectFit: 'cover', display: 'block' };

  const face = avatarDataUrl ? (
    <span className="player-avatar__face" aria-hidden={showHtmlBadge ? true : undefined}>
      <img src={avatarDataUrl} alt="" className="player-avatar__img" style={imgStyle} />
    </span>
  ) : (
    <span className="player-avatar__face player-avatar__face--initials">
      <span className="player-avatar__initials" aria-hidden="true">
        {initials}
      </span>
    </span>
  );

  const badgeEl =
    showHtmlBadge && badgeLayout ? (
      <span
        className="player-avatar__name-badge"
        aria-hidden="true"
        style={{
          left: `${(badgeLayout.x / size) * 100}%`,
          top: `${(badgeLayout.y / size) * 100}%`,
          width: `${(badgeLayout.w / size) * 100}%`,
          height: `${(badgeLayout.h / size) * 100}%`,
          ['--badge-font' as string]: `${badgeLayout.fontPx}px`,
        }}
      >
        <span className="player-avatar__name-badge__plate">
          <span className="player-avatar__name-badge__text">{badgeText}</span>
        </span>
      </span>
    ) : null;

  return (
    <span
      className={avatarClassName}
      style={style}
      /* title только по явному prop — иначе тултип дублирует ник у плашки Юга */
      title={title}
      role="img"
      aria-label={name}
    >
      {face}
      {badgeEl}
    </span>
  );
}
