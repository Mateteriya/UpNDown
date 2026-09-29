import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';

/** Космический hover-тултип (капсула кабинета / ушко / глифы). */
export function MenuCapsuleCosmicTip({
  open,
  anchorRef,
  tipId,
  text,
  detail,
  children,
  wide = false,
  preferBelow = false,
  onDismiss,
  dismissLabel = 'Close',
  className,
}: {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  tipId: string;
  text?: string;
  /** Приглушённое пояснение под основным текстом. */
  detail?: string;
  /** Кастомное тело (напр. превью имени в 1–2 строки). */
  children?: ReactNode;
  /** Длинные пояснения — шире и с переносом. */
  wide?: boolean;
  /** Прижать под якорь (удобно у правого края капсулы). */
  preferBelow?: boolean;
  /** Крестик принудительного закрытия (включает pointer-events). */
  onDismiss?: () => void;
  dismissLabel?: string;
  /** Доп. класс (напр. компактный tip редактора). */
  className?: string;
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
  }, [open, anchorRef, wide, preferBelow, text, detail, children, onDismiss]);

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
        detail || children ? 'menu-capsule-cosmic-tip--with-detail' : '',
        children ? 'menu-capsule-cosmic-tip--with-preview' : '',
        onDismiss ? 'menu-capsule-cosmic-tip--dismissible' : '',
        pos.place === 'below' ? 'menu-capsule-cosmic-tip--below' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ top: pos.top, left: pos.left }}
    >
      {onDismiss ? (
        <button
          type="button"
          className="menu-capsule-cosmic-tip__close"
          aria-label={dismissLabel}
          title={dismissLabel}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDismiss();
          }}
        >
          <span className="menu-capsule-cosmic-tip__close-shine" aria-hidden />
          <svg className="menu-capsule-cosmic-tip__close-icon" viewBox="0 0 16 16" aria-hidden>
            <path
              d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.85"
              strokeLinecap="round"
            />
          </svg>
        </button>
      ) : null}
      {text ? (
        <p className="game-table-tooltip-cosmic-body-text menu-capsule-cosmic-tip__text">{text}</p>
      ) : null}
      {children ? <div className="menu-capsule-cosmic-tip__preview">{children}</div> : null}
      {detail ? (
        <p className="menu-capsule-cosmic-tip__detail">{detail}</p>
      ) : null}
    </div>,
    document.body,
  );
}
