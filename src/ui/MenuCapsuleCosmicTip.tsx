import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Космический hover-тултип (капсула кабинета / ушко / глифы). */
export function MenuCapsuleCosmicTip({
  open,
  anchorRef,
  tipId,
  text,
  detail,
  wide = false,
  preferBelow = false,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  tipId: string;
  text: string;
  /** Приглушённое пояснение под основным текстом. */
  detail?: string;
  /** Длинные пояснения — шире и с переносом. */
  wide?: boolean;
  /** Прижать под якорь (удобно у правого края капсулы). */
  preferBelow?: boolean;
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; place: 'above' | 'below' } | null>(
    null,
  );

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const place = () => {
      const r = el.getBoundingClientRect();
      const pad = 12;
      const measured = tipRef.current?.offsetWidth;
      const half = (measured && measured > 0 ? measured : wide ? 240 : 180) / 2;
      let left = r.left + r.width / 2;
      left = Math.min(Math.max(left, pad + half), window.innerWidth - pad - half);
      const canAbove = r.top >= 56;
      const placeBelow = preferBelow || !canAbove;
      if (placeBelow) {
        setPos({ top: r.bottom + pad, left, place: 'below' });
      } else {
        setPos({ top: r.top - pad, left, place: 'above' });
      }
    };
    place();
    const raf = requestAnimationFrame(place);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef, wide, preferBelow, text, detail]);

  if (!open || !pos || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tipRef}
      id={tipId}
      role="tooltip"
      className={[
        'menu-capsule-cosmic-tip',
        'game-table-tooltip-cosmic',
        wide ? 'menu-capsule-cosmic-tip--wide' : '',
        detail ? 'menu-capsule-cosmic-tip--with-detail' : '',
        pos.place === 'below' ? 'menu-capsule-cosmic-tip--below' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ top: pos.top, left: pos.left }}
    >
      <p className="game-table-tooltip-cosmic-body-text menu-capsule-cosmic-tip__text">{text}</p>
      {detail ? (
        <p className="menu-capsule-cosmic-tip__detail">{detail}</p>
      ) : null}
    </div>,
    document.body,
  );
}
