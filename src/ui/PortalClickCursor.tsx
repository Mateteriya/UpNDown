/**
 * Плавный DOM-курсор «нажми» (portal → body).
 * Не используется в ПК-ЛК на Войти/Выйти — оставлен для других мест.
 *
 * Стили: `src/styles/portal-click-cursor.css` (подключаются здесь).
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import '../styles/portal-click-cursor.css';

export type PortalClickCursorProps = {
  children: ReactNode;
  disabled?: boolean;
  /** Базовый класс обёртки; добавляются `--cursor-on` / `--cursor-press`. */
  className: string;
};

export function PortalClickCursor({ children, disabled, className }: PortalClickCursorProps) {
  const cursorRef = useRef<HTMLSpanElement>(null);
  const lastPosRef = useRef({ x: 0, y: 0 });
  const [active, setActive] = useState(false);
  const [pressed, setPressed] = useState(false);

  const moveCursor = (clientX: number, clientY: number) => {
    lastPosRef.current = { x: clientX, y: clientY };
    const el = cursorRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${clientX}px, ${clientY}px, 0)`;
  };

  useEffect(() => {
    if (!active) return;
    const { x, y } = lastPosRef.current;
    const el = cursorRef.current;
    if (el) el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  }, [active]);

  return (
    <div
      className={[
        className,
        active ? `${className}--cursor-on` : '',
        pressed ? `${className}--cursor-press` : '',
      ]
        .filter(Boolean)
        .join(' ')}
      onMouseEnter={(e) => {
        if (disabled) return;
        moveCursor(e.clientX, e.clientY);
        setActive(true);
      }}
      onMouseLeave={() => {
        setActive(false);
        setPressed(false);
      }}
      onMouseMove={(e) => {
        if (disabled) return;
        moveCursor(e.clientX, e.clientY);
      }}
      onMouseDown={() => {
        if (!disabled) setPressed(true);
      }}
      onMouseUp={() => setPressed(false)}
    >
      {active && !disabled && typeof document !== 'undefined'
        ? createPortal(
            <span
              ref={cursorRef}
              className={[
                'portal-click-cursor',
                pressed ? 'portal-click-cursor--press' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-hidden="true"
            >
              <span className="portal-click-cursor__halo" />
              <span className="portal-click-cursor__ring portal-click-cursor__ring--outer" />
              <span className="portal-click-cursor__ring portal-click-cursor__ring--inner" />
              <span className="portal-click-cursor__core" />
              <span className="portal-click-cursor__plus" />
            </span>,
            document.body,
          )
        : null}
      {children}
    </div>
  );
}
