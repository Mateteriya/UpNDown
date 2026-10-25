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

  /* Длинные RU-строки без wide раньше резались nowrap — включаем перенос автоматически */
  const textLen = (text ?? '').trim().length;
  const useWide = wide || textLen > 28 || Boolean(detail) || Boolean(children);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }
    const el = anchorRef.current;
    if (!el) return;
    const place = () => {
      const tip = tipRef.current;
      const r = el.getBoundingClientRect();
      const pad = 12;
      const measured = tip?.offsetWidth;
      const half = (measured && measured > 0 ? measured : useWide ? 260 : 180) / 2;
      let left = r.left + r.width / 2;
      left = Math.min(Math.max(left, pad + half), window.innerWidth - pad - half);
      const tipH = tip?.offsetHeight || 48;
      const canAbove = r.top >= tipH + pad + 8;
      const placeBelow = preferBelow || !canAbove;
      if (placeBelow) {
        setPos({ top: r.bottom + pad, left, place: 'below' });
      } else {
        setPos({ top: r.top - pad, left, place: 'above' });
      }
    };
    place();
    /* второй кадр — после wrap ширина/высота уже финальные */
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      place();
      raf2 = requestAnimationFrame(place);
    });
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [open, anchorRef, useWide, preferBelow, text, detail, children, onDismiss]);

  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={tipRef}
      id={tipId}
      role="tooltip"
      className={[
        'menu-capsule-cosmic-tip',
        'game-table-tooltip-cosmic',
        useWide ? 'menu-capsule-cosmic-tip--wide' : '',
        'menu-capsule-cosmic-tip--wrap',
        detail || children ? 'menu-capsule-cosmic-tip--with-detail' : '',
        children ? 'menu-capsule-cosmic-tip--with-preview' : '',
        onDismiss ? 'menu-capsule-cosmic-tip--dismissible' : '',
        pos?.place === 'below' ? 'menu-capsule-cosmic-tip--below' : '',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        pos
          ? { top: pos.top, left: pos.left }
          : { top: -9999, left: -9999, visibility: 'hidden' as const }
      }
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
