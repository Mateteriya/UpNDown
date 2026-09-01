import { useCallback, useRef, type PointerEvent as ReactPointerEvent } from 'react';

type Props = {
  axis: 'x' | 'y';
  /**
   * Смещение в px: x — вправо+, y — вниз+.
   * Для панели ПОД ручкой (клавиатура) передай invert: тянуть вверх увеличивает панель.
   */
  onDrag: (deltaPx: number) => void;
  onDragEnd?: () => void;
  onReset?: () => void;
  /** Инвертировать delta (ручка над нижней панелью). */
  invert?: boolean;
  /** aria-label */
  label: string;
  className?: string;
};

/**
 * Ручка границы панелей (как в Ableton / FL): тяни за край, двойной клик — сброс.
 */
export function LabResizeHandle({
  axis,
  onDrag,
  onDragEnd,
  onReset,
  invert = false,
  label,
  className,
}: Props) {
  const drag = useRef<{ pointerId: number; last: number } | null>(null);

  const onDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      drag.current = { pointerId: e.pointerId, last: axis === 'x' ? e.clientX : e.clientY };
      document.documentElement.classList.add(
        axis === 'x' ? 'lab-resizing-x' : 'lab-resizing-y',
      );
    },
    [axis],
  );

  const onMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current || drag.current.pointerId !== e.pointerId) return;
      const cur = axis === 'x' ? e.clientX : e.clientY;
      const raw = cur - drag.current.last;
      if (raw === 0) return;
      drag.current.last = cur;
      onDrag(invert ? -raw : raw);
    },
    [axis, invert, onDrag],
  );

  const end = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!drag.current || drag.current.pointerId !== e.pointerId) return;
      drag.current = null;
      document.documentElement.classList.remove('lab-resizing-x', 'lab-resizing-y');
      onDragEnd?.();
    },
    [onDragEnd],
  );

  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      title={`${label} · тяни · двойной клик — сброс`}
      className={[
        'lab-resize-handle',
        axis === 'x' ? 'lab-resize-handle--x' : 'lab-resize-handle--y',
        className ?? '',
      ]
        .filter(Boolean)
        .join(' ')}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={end}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onReset?.();
      }}
    >
      <span className="lab-resize-handle__grip" aria-hidden />
    </div>
  );
}
