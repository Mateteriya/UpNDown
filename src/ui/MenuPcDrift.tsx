import { type CSSProperties, type PointerEvent, type ReactNode, useCallback, useEffect, useRef, useState } from 'react';

const PC_MQ = '(min-width: 1025px)';
/* v4: freeform — все слоты подвижны, сброс старых смещений */
const LS_PREFIX = 'upnd-menu-pc-drift:v5:';
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

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
};

/**
 * Обёртка элемента меню: на мобилке — обычный блок;
 * на ПК — слот созвездия; movable — drag только за «ушко».
 */
export function MenuPcDrift({ id, className, movable = false, children }: MenuPcDriftProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState<DriftPos>(() =>
    movable ? (readPos(id) ?? { x: 0, y: 0 }) : { x: 0, y: 0 },
  );
  const dragRef = useRef<DragState | null>(null);
  const [dragging, setDragging] = useState(false);
  const suppressClickRef = useRef(false);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;
  const unbindDocRef = useRef<(() => void) | null>(null);

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

  useEffect(() => {
    return () => {
      unbindDocRef.current?.();
      unbindDocRef.current = null;
    };
  }, []);

  const finishDrag = useCallback((opts: { save: boolean; pointerId: number }) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== opts.pointerId) return;
    const didMove = d.moved;
    dragRef.current = null;
    unbindDocRef.current?.();
    unbindDocRef.current = null;
    if (opts.save && didMove) {
      suppressClickRef.current = true;
      setOffset((pos) => {
        writePos(id, pos);
        return pos;
      });
    }
    setDragging(false);
    try {
      if (rootRef.current?.hasPointerCapture(opts.pointerId)) {
        rootRef.current.releasePointerCapture(opts.pointerId);
      }
    } catch {
      /* ignore */
    }
    if (didMove) {
      const ae = document.activeElement;
      if (ae instanceof HTMLElement && rootRef.current?.contains(ae)) {
        ae.blur();
      }
      try {
        window.getSelection()?.removeAllRanges();
      } catch {
        /* ignore */
      }
    }
  }, [id]);

  const bindDocListeners = useCallback(
    (pointerId: number) => {
      unbindDocRef.current?.();

      const onMove = (e: globalThis.PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        const d = dragRef.current;
        if (!d || d.pointerId !== pointerId) return;
        if (e.buttons === 0) {
          finishDrag({ save: d.moved, pointerId });
          return;
        }
        const dx = e.clientX - d.startX;
        const dy = e.clientY - d.startY;
        if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        if (!d.moved) {
          d.moved = true;
          setDragging(true);
          try {
            rootRef.current?.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
          const ae = document.activeElement;
          if (ae instanceof HTMLElement && rootRef.current?.contains(ae)) {
            ae.blur();
          }
          try {
            window.getSelection()?.removeAllRanges();
          } catch {
            /* ignore */
          }
        }
        setOffset({
          x: d.originX + dx,
          y: d.originY + dy,
        });
      };

      const onUp = (e: globalThis.PointerEvent) => {
        if (e.pointerId !== pointerId) return;
        finishDrag({ save: true, pointerId });
      };

      const onAbort = () => finishDrag({ save: false, pointerId });

      document.addEventListener('pointermove', onMove, true);
      document.addEventListener('pointerup', onUp, true);
      document.addEventListener('pointercancel', onUp, true);
      window.addEventListener('blur', onAbort);
      document.addEventListener('visibilitychange', onAbort);

      unbindDocRef.current = () => {
        document.removeEventListener('pointermove', onMove, true);
        document.removeEventListener('pointerup', onUp, true);
        document.removeEventListener('pointercancel', onUp, true);
        window.removeEventListener('blur', onAbort);
        document.removeEventListener('visibilitychange', onAbort);
      };
    },
    [finishDrag],
  );

  /** Drag только с ушка — сама капсула остаётся для кликов. */
  const onEarPointerDown = useCallback(
    (e: PointerEvent<HTMLButtonElement>) => {
      if (!movable || e.button !== 0) return;
      if (!window.matchMedia(PC_MQ).matches) return;
      e.preventDefault();
      e.stopPropagation();

      if (dragRef.current) {
        finishDrag({ save: false, pointerId: dragRef.current.pointerId });
      }

      const origin = offsetRef.current;
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: origin.x,
        originY: origin.y,
        moved: false,
      };
      bindDocListeners(e.pointerId);
    },
    [movable, finishDrag, bindDocListeners],
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
      data-menu-drift={id}
    >
      {/* Bob на внутренней оболочке; drag translate — на внешнем drift. */}
      <div className="menu-screen__drift-bob">
        {children}
        {movable ? (
          <button
            type="button"
            className="menu-screen__drift-ear"
            aria-label="Переместить капсулу"
            title="Переместить"
            onPointerDown={onEarPointerDown}
          >
            <span className="menu-screen__drift-ear__grip" aria-hidden="true">
              <span />
              <span />
              <span />
            </span>
          </button>
        ) : null}
      </div>
    </div>
  );
}
