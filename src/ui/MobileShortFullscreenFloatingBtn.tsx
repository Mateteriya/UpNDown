import { useCallback, useEffect, useRef, useState } from 'react';
import { computeMobileViewportBottomGapPx } from '../lib/mobileBrowserChrome';

const POS_STORAGE_ENTER = 'upd.mobileShortFullscreenBtnPos.enter.v1';
const POS_STORAGE_EXIT = 'upd.mobileShortFullscreenBtnPos.exit.v1';
const DRAG_THRESHOLD_PX = 10;

type StoredPos = { x: number; y: number };
type Mode = 'enter' | 'exit';

function storageKeyForMode(mode: Mode): string {
  return mode === 'exit' ? POS_STORAGE_EXIT : POS_STORAGE_ENTER;
}

function readStoredPos(mode: Mode): StoredPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKeyForMode(mode));
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredPos;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return p;
  } catch {
    return null;
  }
}

function writeStoredPos(mode: Mode, pos: StoredPos): void {
  try {
    localStorage.setItem(storageKeyForMode(mode), JSON.stringify(pos));
  } catch {
    /* ignore */
  }
}

function readViewportBox(): { left: number; top: number; width: number; height: number } {
  const vv = window.visualViewport;
  if (vv != null) {
    return {
      left: vv.offsetLeft,
      top: vv.offsetTop,
      width: vv.width,
      height: vv.height,
    };
  }
  return { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
}

function clampPos(x: number, y: number, pad = 10): StoredPos {
  const box = readViewportBox();
  const minX = box.left + pad;
  const minY = box.top + pad;
  const maxX = box.left + box.width - pad;
  const maxY = box.top + box.height - pad;
  return {
    x: Math.min(maxX, Math.max(minX, x)),
    y: Math.min(maxY, Math.max(minY, y)),
  };
}

/** Стартовая позиция: enter — справа внизу; exit — по центру у самого низа. */
function defaultPosForMode(mode: Mode, standaloneDisplay = false): StoredPos {
  const box = readViewportBox();
  const gap = computeMobileViewportBottomGapPx();
  const bottomInset = mode === 'exit' ? 10 + gap + (standaloneDisplay ? 40 : 0) : 12 + gap + (standaloneDisplay ? 52 : 0);
  const y = box.top + box.height - bottomInset;
  if (mode === 'enter') {
    return clampPos(box.left + box.width - 72, y);
  }
  return clampPos(box.left + box.width / 2, y);
}

function resolveInitialPos(mode: Mode, standaloneDisplay = false): StoredPos {
  return readStoredPos(mode) ?? defaultPosForMode(mode, standaloneDisplay);
}

type Props = {
  mode: Mode;
  onTap: () => void;
  standaloneDisplay?: boolean;
};

export function MobileShortFullscreenFloatingBtn({ mode, onTap, standaloneDisplay = false }: Props) {
  const [pos, setPos] = useState<StoredPos>(() => resolveInitialPos(mode, standaloneDisplay));
  const [dragging, setDragging] = useState(false);
  const hasCustomPosRef = useRef(readStoredPos(mode) != null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    const saved = readStoredPos(mode);
    if (saved) {
      hasCustomPosRef.current = true;
      setPos(clampPos(saved.x, saved.y));
      return;
    }
    hasCustomPosRef.current = false;
    setPos(defaultPosForMode(mode, standaloneDisplay));
  }, [mode, standaloneDisplay]);

  useEffect(() => {
    const reclamp = () => setPos((p) => clampPos(p.x, p.y));
    window.addEventListener('resize', reclamp);
    window.addEventListener('orientationchange', reclamp);
    window.visualViewport?.addEventListener('resize', reclamp);
    window.visualViewport?.addEventListener('scroll', reclamp);
    return () => {
      window.removeEventListener('resize', reclamp);
      window.removeEventListener('orientationchange', reclamp);
      window.visualViewport?.removeEventListener('resize', reclamp);
      window.visualViewport?.removeEventListener('scroll', reclamp);
    };
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: pos.x,
        originY: pos.y,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [pos.x, pos.y],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    setDragging(true);
    setPos(clampPos(d.originX + dx, d.originY + dy));
  }, []);

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const d = dragRef.current;
      if (!d || d.pointerId !== e.pointerId) return;
      dragRef.current = null;
      setDragging(false);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
      if (d.moved) {
        hasCustomPosRef.current = true;
        setPos((current) => {
          const next = clampPos(current.x, current.y);
          writeStoredPos(modeRef.current, next);
          return next;
        });
        return;
      }
      onTap();
    },
    [onTap],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  }, []);

  const isExit = mode === 'exit';

  return (
    <button
      type="button"
      className={[
        'mobile-short-fullscreen-entry-btn',
        isExit ? 'mobile-short-fullscreen-entry-btn--exit' : 'mobile-short-fullscreen-entry-btn--enter',
        'mobile-short-fullscreen-entry-btn--floating',
        dragging ? 'mobile-short-fullscreen-entry-btn--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={{
        left: pos.x,
        top: pos.y,
        transform: dragging ? 'translate(-50%, -50%) scale(1.04)' : 'translate(-50%, -50%)',
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      aria-label={
        isExit
          ? 'Выйти из полноэкранного режима. Удерживайте и перетащите, чтобы сменить место.'
          : 'На весь экран. Удерживайте и перетащите, чтобы сменить место.'
      }
      title={isExit ? 'Выйти (перетащите)' : 'На весь экран (перетащите)'}
    >
      <span className="mobile-short-fullscreen-entry-btn__icon" aria-hidden>
        {isExit ? '×' : '⛶'}
      </span>
      <span
        className={[
          'mobile-short-fullscreen-entry-btn__label',
          !isExit ? 'mobile-short-fullscreen-entry-btn__label--shimmer' : 'mobile-short-fullscreen-entry-btn__label--exit',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {isExit ? 'Выйти' : 'На весь экран'}
      </span>
    </button>
  );
}
