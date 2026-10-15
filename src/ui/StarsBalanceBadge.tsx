/**
 * Компактный бейдж баланса Звёзд (ЛК / слот ЮГ / оппоненты).
 */

import { useEffect, useState } from 'react';
import { getPlayerProfile } from '../game/persistence';
import { getPlayerStars } from '../game/playerStars';
import { useT } from '../i18n';
import { StarBrandGlyph } from './StarBrandGlyph';

export function StarsBalanceBadge({
  className,
  size = 'md',
  balance: balanceProp,
}: {
  className?: string;
  size?: 'sm' | 'md';
  /** Чужой слот / явный баланс; без prop — локальный профиль */
  balance?: number;
}) {
  const t = useT();
  const profileId = getPlayerProfile().profileId ?? '';
  const [localN, setLocalN] = useState(() => getPlayerStars(profileId).balance);
  const useLocal = balanceProp === undefined;

  useEffect(() => {
    if (!useLocal) return;
    setLocalN(getPlayerStars(profileId).balance);
    const onStorage = (e: StorageEvent) => {
      if (e.key && e.key.startsWith('updown_stars_')) {
        setLocalN(getPlayerStars(profileId).balance);
      }
    };
    window.addEventListener('storage', onStorage);
    const tick = window.setInterval(() => {
      setLocalN(getPlayerStars(profileId).balance);
    }, 2000);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.clearInterval(tick);
    };
  }, [profileId, useLocal]);

  const n = Math.max(0, Math.floor(useLocal ? localN : balanceProp));
  const empty = n === 0;

  return (
    <span
      className={[
        'stars-badge',
        `stars-badge--${size}`,
        empty ? 'stars-badge--empty' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={t('cabinet.starsBadgeAria', { n })}
      title={t('cabinet.starsBadgeAria', { n })}
    >
      <StarBrandGlyph
        className="stars-badge__glyph"
        size={size === 'sm' ? 12 : 14}
        hollow={empty}
      />
      <span className="stars-badge__n">{n}</span>
    </span>
  );
}
