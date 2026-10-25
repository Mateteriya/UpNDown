/**
 * Компактный бейдж ★ (ЛК / слот ЮГ / оппоненты).
 * Лицо — только умный глиф; клик → космический поповер с балансом;
 * hover → короткий cosmic tip; длинный текст — под «Подробнее».
 */

import {
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { createPortal } from 'react-dom';
import { getPlayerProfile } from '../game/persistence';
import { getPlayerStars } from '../game/playerStars';
import { starGlyphTierFromBalance } from '../game/starGlyphTier';
import { useT } from '../i18n';
import { MenuCapsuleCosmicTip } from './MenuCapsuleCosmicTip';
import { StarBrandGlyph } from './StarBrandGlyph';

type PopPlace = {
  top: number;
  left: number;
  origin: string;
};

function placePopover(
  anchor: HTMLElement,
  pop: HTMLElement | null,
): PopPlace {
  const r = anchor.getBoundingClientRect();
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = pop?.offsetWidth || 220;
  const ph = pop?.offsetHeight || 160;
  const gap = 8;

  const spaceBelow = vh - r.bottom - pad;
  const spaceAbove = r.top - pad;
  const preferAbove = spaceBelow < ph + gap && spaceAbove > spaceBelow;

  let top = preferAbove ? r.top - gap - ph : r.bottom + gap;
  top = Math.min(Math.max(top, pad), Math.max(pad, vh - pad - ph));

  /* Юг слева экрана: открывать вправо от якоря; иначе — к левому краю якоря */
  let left = r.left;
  if (left + pw > vw - pad) left = r.right - pw;
  if (left < pad) left = pad;
  if (left + pw > vw - pad) left = Math.max(pad, vw - pad - pw);

  const originX = left + pw / 2 < r.left + r.width / 2 ? 'right' : 'left';
  const originY = preferAbove ? 'bottom' : 'top';

  return { top, left, origin: `${originY} ${originX}` };
}

export function StarsBalanceBadge({
  className,
  size = 'md',
  balance: balanceProp,
  interactive = false,
  forceTier,
}: {
  className?: string;
  size?: 'sm' | 'md';
  balance?: number;
  interactive?: boolean;
  forceTier?: import('../game/starGlyphTier').StarGlyphTier;
}) {
  const t = useT();
  const panelId = useId();
  const tipId = useId();
  const hostRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const profileId = getPlayerProfile().profileId ?? '';
  const [localN, setLocalN] = useState(() => getPlayerStars(profileId).balance);
  const [open, setOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [hoverTip, setHoverTip] = useState(false);
  const [popPos, setPopPos] = useState<PopPlace | null>(null);
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

  useEffect(() => {
    if (!open) {
      setDetailsOpen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      const host = hostRef.current;
      const pop = popoverRef.current;
      const node = e.target;
      if (!(node instanceof Node)) return;
      if (host?.contains(node) || pop?.contains(node)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) {
      setPopPos(null);
      return;
    }
    const host = hostRef.current;
    if (!host) return;
    const update = () => {
      setPopPos(placePopover(host, popoverRef.current));
    };
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, detailsOpen]);

  const n = Math.max(0, Math.floor(useLocal ? localN : balanceProp));
  const tier = forceTier ?? starGlyphTierFromBalance(n);
  const empty = tier === 'empty';
  const badgeCls = [
    'stars-badge',
    `stars-badge--${size}`,
    `stars-badge--tier-${tier}`,
    empty ? 'stars-badge--empty' : '',
    interactive ? 'stars-badge--interactive' : '',
    open ? 'stars-badge--open' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const glyph = (
    <StarBrandGlyph
      className="stars-badge__glyph"
      size={size === 'sm' ? 14 : 16}
      balance={forceTier ? undefined : n}
      tier={forceTier}
    />
  );

  const tipText = interactive
    ? t('cabinet.starsBalanceTap')
    : t('cabinet.starsBadgeAria', { n });

  const showTip = hoverTip && !open;

  const hoverHandlers = {
    onMouseEnter: () => setHoverTip(true),
    onMouseLeave: () => setHoverTip(false),
    onFocus: () => setHoverTip(true),
    onBlur: () => setHoverTip(false),
  };

  const popoverStyle: CSSProperties | undefined = popPos
    ? {
        position: 'fixed',
        top: popPos.top,
        left: popPos.left,
        right: 'auto',
        bottom: 'auto',
        transformOrigin: popPos.origin,
        zIndex: 400,
      }
    : { position: 'fixed', visibility: 'hidden', pointerEvents: 'none' };

  const popover =
    open && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            id={panelId}
            className={[
              'stars-cosmic-popover',
              'stars-cosmic-popover--portal',
              detailsOpen ? 'stars-cosmic-popover--details' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="dialog"
            aria-label={t('cabinet.starsTitle')}
            style={popoverStyle}
          >
            <div className="stars-cosmic-popover__glow" aria-hidden />
            <div className="stars-cosmic-popover__dust" aria-hidden />
            <h3 className="stars-cosmic-popover__title">{t('cabinet.starsTitle')}</h3>
            <p className="stars-cosmic-popover__balance">
              <StarBrandGlyph
                className="stars-cosmic-popover__balance-glyph"
                size={22}
                balance={forceTier ? undefined : n}
                tier={forceTier}
              />
              <span>{t('cabinet.starsPeekBalance', { n })}</span>
            </p>
            <button
              type="button"
              className="stars-cosmic-popover__more"
              aria-expanded={detailsOpen}
              onClick={(e) => {
                e.stopPropagation();
                setDetailsOpen((v) => !v);
              }}
            >
              {detailsOpen
                ? t('cabinet.starsPopoverLess')
                : t('cabinet.starsPopoverMore')}
            </button>
            {detailsOpen ? (
              <div className="stars-cosmic-popover__details">
                <p className="stars-cosmic-popover__lead">
                  {t('cabinet.starsPopoverLead')}
                </p>
                <ul className="stars-cosmic-popover__tips">
                  <li>{t('cabinet.starsPopoverTipPlay')}</li>
                  <li>{t('cabinet.starsPopoverTipGoals')}</li>
                  <li>{t('cabinet.starsPopoverTipOnline')}</li>
                </ul>
                <p className="stars-cosmic-popover__foot">
                  {t('cabinet.starsPopoverFoot')}
                </p>
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  if (!interactive) {
    return (
      <>
        <span
          ref={hostRef}
          className={badgeCls}
          aria-label={t('cabinet.starsBadgeAria', { n })}
          aria-describedby={showTip ? tipId : undefined}
          {...hoverHandlers}
        >
          {glyph}
        </span>
        <MenuCapsuleCosmicTip
          open={showTip}
          anchorRef={hostRef}
          tipId={tipId}
          text={tipText}
        />
      </>
    );
  }

  return (
    <>
      <span
        className={['stars-badge-host', open ? 'stars-badge-host--open' : '']
          .filter(Boolean)
          .join(' ')}
        ref={hostRef}
        {...hoverHandlers}
      >
        <button
          type="button"
          className={badgeCls}
          aria-label={t('cabinet.starsBadgeAria', { n })}
          aria-expanded={open}
          aria-controls={panelId}
          aria-describedby={showTip ? tipId : undefined}
          onClick={(e) => {
            e.stopPropagation();
            setHoverTip(false);
            setOpen((v) => !v);
          }}
        >
          {glyph}
        </button>
      </span>
      <MenuCapsuleCosmicTip
        open={showTip}
        anchorRef={hostRef}
        tipId={tipId}
        text={tipText}
      />
      {popover}
    </>
  );
}
