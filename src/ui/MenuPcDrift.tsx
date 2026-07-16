import { type CSSProperties, type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

const PC_MQ = '(min-width: 1025px)';
/* v4: freeform — все слоты подвижны, сброс старых смещений */
const LS_PREFIX = 'upnd-menu-pc-drift:v4:';
const DRAG_THRESHOLD_PX = 7;

type DriftPos = { x: number; y: number };

function readPos(id: string): DriftPos | null {
  try {
    const raw = localStorage.getItem(LS_PREFIX + id);
    if (!raw) return null;
    const p = JSON.parse(raw) as DriftPos;
    if (typeof p?.x !== 'number' || typeof p?.y !== 'number') return null;
    return p;
  } catch {
    return null;
  }
}

function writePos(id: string, pos: DriftPos) {
  try {
    localStorage.setItem(LS_PREFIX + id, JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

type MenuPcDriftProps = {
  id: string;
  className?: string;
  /** Перетаскивание только на ПК (≥1025). Клик по кнопке сохраняется, пока нет сдвига. */
  movable?: boolean;
  children: ReactNode;
};

/**
 * Обёртка элемента меню: на мобилке — обычный блок;
 * на ПК — слот созвездия; movable — drag с порогом и запоминанием позиции.
 */
export function MenuPcDrift({ id, className, movable = false, children }: MenuPcDriftProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<DriftPos>(() =>
    movable ? (readPos(id) ?? { x: 0, y: 0 }) : { x: 0, y: 0 },
  );
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);
  const [dragging, setDragging] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    if (!movable) return;
    const mq = window.matchMedia(PC_MQ);
    const sync = () => {
      if (!mq.matches) setOffset({ x: 0, y: 0 });
      else setOffset(readPos(id) ?? { x: 0, y: 0 });
    };
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, [id, movable]);

  useEffect(() => {
    if (!movable) return;
    const el = rootRef.current;
    if (!el) return;
    const onClickCapture = (e: MouseEvent) => {
      if (!suppressClickRef.current) return;
      e.preventDefault();
      e.stopPropagation();
      suppressClickRef.current = false;
    };
    el.addEventListener('click', onClickCapture, true);
    return () => el.removeEventListener('click', onClickCapture, true);
  }, [movable]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (!movable || e.button !== 0) return;
      if (!window.matchMedia(PC_MQ).matches) return;
      const target = e.target as HTMLElement;
      /* Drag с фона капсулы; половинки/глифы/легенда — только клик/hover */
      if (
        target.closest(
          '.menu-split-capsule__half, .menu-capsule, .menu-split-capsule__mode-glyph-btn, .menu-split-capsule__legend, a, input, textarea, select, [role="button"]',
        )
      ) {
        return;
      }
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: offset.x,
        originY: offset.y,
        moved: false,
      };
      rootRef.current?.setPointerCapture(e.pointerId);
    },
    [movable, offset.x, offset.y],
  );

  const onPointerMove = useCallback((e: PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(true);
    }
    setOffset({
      x: d.originX + dx,
      y: d.originY + dy,
    });
  }, []);

  const endDrag = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      if (d.moved) {
        suppressClickRef.current = true;
        setOffset((pos) => {
          writePos(id, pos);
          return pos;
        });
      }
      setDragging(false);
      try {
        rootRef.current?.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [id],
  );

  const style: CSSProperties | undefined =
    movable && (offset.x !== 0 || offset.y !== 0 || dragging)
      ? ({
          ['--menu-drift-x' as string]: `${offset.x}px`,
          ['--menu-drift-y' as string]: `${offset.y}px`,
        } as CSSProperties)
      : undefined;

  return (
    <div
      ref={rootRef}
      className={[
        'menu-screen__drift',
        className,
        movable ? 'menu-screen__drift--movable' : '',
        dragging ? 'menu-screen__drift--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={style}
      onPointerDown={movable ? onPointerDown : undefined}
      onPointerMove={movable ? onPointerMove : undefined}
      onPointerUp={movable ? endDrag : undefined}
      onPointerCancel={movable ? endDrag : undefined}
      data-menu-drift={id}
    >
      {/* Bob на внутренней оболочке; drag translate — на внешнем drift. */}
      <div className="menu-screen__drift-bob">{children}</div>
    </div>
  );
}
