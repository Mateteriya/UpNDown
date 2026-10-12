/**
 * Компактный бейдж баланса Звёзд (ЛК / слот ЮГ).
 */

import { useEffect, useState } from 'react';
import { getPlayerProfile } from '../game/persistence';
import { getPlayerStars } from '../game/playerStars';
import { useT } from '../i18n';
import { StarBrandGlyph } from './StarBrandGlyph';

export function StarsBalanceBadge({
  className,
  size = 'md',
}: {
  className?: string;
  size?: 'sm' | 'md';
}) {
  const t = useT();
  const profileId = getPlayerProfile().profileId ?? '';
  const [n, setN] = useState(() => getPlayerStars(profileId).balance);

  useEffect(() => {
    setN(getPlayerStars(profileId).balance);
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('updown_stars_')) {
        setN(getPlayerStars(profileId).balance);
      }
    };
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => {
      setN(getPlayerStars(profileId).balance);
    }, 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [profileId]);

  return (
    <span
      className={['stars-badge', `stars-badge--${size}`, className].filter(Boolean).join(' ')}
      aria-label={t('cabinet.starsBadgeAria', { n })}
      title={t('cabinet.starsBadgeAria', { n })}
    >
      <StarBrandGlyph className="stars-badge__glyph" size={size === 'sm' ? 12 : 14} />
      <span className="stars-badge__n">{n}</span>
    </span>
  );
}
