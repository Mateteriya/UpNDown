import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeMobileBottomObstructionInsetPx,
  readMobileVisibleViewportBottomPx,
} from '../lib/mobileBrowserChrome';

const POS_STORAGE_ENTER = 'upd.mobileShortFullscreenBtnPos.enter.v1';
const POS_STORAGE_EXIT = 'upd.mobileShortFullscreenBtnPos.exit.v1';
const DRAG_HINT_SEEN_KEY = 'upd.mobileShortFullscreenBtnDragHintSeen.v1';
const DRAG_THRESHOLD_PX = 10;
/** Запас над видимым низом при авто-подъёме (px). */
const OVERLAP_CLEARANCE_PX = 10;
/** Зазор до кнопки «Чат», чтобы плавающий fullscreen её не перекрывал. */
const CHAT_TOGGLE_CLEARANCE_PX = 14;

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

function readDragHintSeen(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(DRAG_HINT_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

function markDragHintSeen(): void {
  try {
    localStorage.setItem(DRAG_HINT_SEEN_KEY, '1');
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

function readChatToggleRect(): DOMRect | null {
  if (typeof document === 'undefined') return null;
  const el = document.querySelector('[data-upnd-table-chat-toggle]');
  if (!(el instanceof HTMLElement)) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 4 || r.height < 4) return null;
  return r;
}

function boxesOverlap(
  a: { left: number; right: number; top: number; bottom: number },
  b: DOMRect,
  pad: number,
): boolean {
  return !(
    a.right + pad < b.left ||
    a.left - pad > b.right ||
    a.bottom + pad < b.top ||
    a.top - pad > b.bottom
  );
}

/** Центр кнопки (fixed + translate -50%) → AABB. */
function centerToBox(pos: StoredPos, w: number, h: number) {
  return {
    left: pos.x - w / 2,
    right: pos.x + w / 2,
    top: pos.y - h / 2,
    bottom: pos.y + h / 2,
  };
}

/**
 * Если плавающая кнопка накрывает «Чат» — сдвинуть влево или выше.
 * Чат остаётся видимым; fullscreen не «прячется» под ним.
 */
function nudgeAwayFromChatToggle(pos: StoredPos, btn: HTMLElement | null): StoredPos {
  const chat = readChatToggleRect();
  if (!chat) return clampPos(pos.x, pos.y);
  const w = btn?.offsetWidth || 128;
  const h = btn?.offsetHeight || 40;
  let next = clampPos(pos.x, pos.y);
  let box = centerToBox(next, w, h);
  if (!boxesOverlap(box, chat, CHAT_TOGGLE_CLEARANCE_PX)) return next;

  const tryLeft = clampPos(chat.left - w / 2 - CHAT_TOGGLE_CLEARANCE_PX, next.y);
  box = centerToBox(tryLeft, w, h);
  if (!boxesOverlap(box, chat, CHAT_TOGGLE_CLEARANCE_PX)) return tryLeft;

  const tryAbove = clampPos(next.x, chat.top - h / 2 - CHAT_TOGGLE_CLEARANCE_PX);
  box = centerToBox(tryAbove, w, h);
  if (!boxesOverlap(box, chat, CHAT_TOGGLE_CLEARANCE_PX)) return tryAbove;

  const tryLeftAbove = clampPos(
    chat.left - w / 2 - CHAT_TOGGLE_CLEARANCE_PX,
    chat.top - h / 2 - CHAT_TOGGLE_CLEARANCE_PX,
  );
  return tryLeftAbove;
}

/** Стартовая позиция: при чате — слева внизу (чат по центру); иначе справа внизу. */
function defaultPosForMode(mode: Mode, standaloneDisplay = false): StoredPos {
  const box = readViewportBox();
  const bottomInset = computeMobileBottomObstructionInsetPx({
    standaloneDisplay,
    marginPx: mode === 'exit' ? 8 : 10,
  });
  const y = box.top + box.height - bottomInset;
  const chatPresent = readChatToggleRect() != null;
  if (mode === 'enter') {
    if (chatPresent) {
      return clampPos(box.left + 72, y);
    }
    return clampPos(box.left + box.width - 72, y);
  }
  if (chatPresent) {
    return clampPos(box.left + box.width * 0.28, y);
  }
  return clampPos(box.left + box.width / 2, y);
}

function resolveInitialPos(mode: Mode, standaloneDisplay = false): StoredPos {
  return readStoredPos(mode) ?? defaultPosForMode(mode, standaloneDisplay);
}

/** Если кнопка уехала под системную шторку — поднять в видимую зону. */
function liftPosIfOverlappingBottom(pos: StoredPos, btn: HTMLElement | null): StoredPos {
  if (!btn) return pos;
  const rect = btn.getBoundingClientRect();
  const visibleBottom = readMobileVisibleViewportBottomPx();
  const overlap = rect.bottom - visibleBottom + OVERLAP_CLEARANCE_PX;
  if (overlap <= 0) return clampPos(pos.x, pos.y);
  return clampPos(pos.x, pos.y - overlap);
}

function finalizePos(pos: StoredPos, btn: HTMLElement | null): StoredPos {
  return nudgeAwayFromChatToggle(liftPosIfOverlappingBottom(pos, btn), btn);
}

type Props = {
  mode: Mode;
  onTap: () => void;
  standaloneDisplay?: boolean;
};

export function MobileShortFullscreenFloatingBtn({ mode, onTap, standaloneDisplay = false }: Props) {
  const [pos, setPos] = useState<StoredPos>(() => resolveInitialPos(mode, standaloneDisplay));
  const [dragging, setDragging] = useState(false);
  const [showDragHint, setShowDragHint] = useState(() => !readDragHintSeen());
  const hasCustomPosRef = useRef(readStoredPos(mode) != null);
  const modeRef = useRef(mode);
  const btnRef = useRef<HTMLButtonElement>(null);
  modeRef.current = mode;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const applyAutoPosition = useCallback(
    (respectCustom: boolean) => {
      if (respectCustom && hasCustomPosRef.current) {
        setPos((p) => finalizePos(clampPos(p.x, p.y), btnRef.current));
        return;
      }
      const next = defaultPosForMode(modeRef.current, standaloneDisplay);
      setPos(finalizePos(next, btnRef.current));
    },
    [standaloneDisplay],
  );

  useEffect(() => {
    const saved = readStoredPos(mode);
    hasCustomPosRef.current = saved != null;
    if (saved) {
      setPos(finalizePos(clampPos(saved.x, saved.y), btnRef.current));
      return;
    }
    applyAutoPosition(false);
  }, [mode, standaloneDisplay, applyAutoPosition]);

  useEffect(() => {
    if (dragging) return;
    const id = window.requestAnimationFrame(() => {
      const btn = btnRef.current;
      if (!btn) return;
      setPos((p) => {
        const next = finalizePos(p, btn);
        return next.x === p.x && next.y === p.y ? p : next;
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [pos.x, pos.y, mode, standaloneDisplay, dragging]);

  useEffect(() => {
    const onViewportChange = () => {
      if (dragging) return;
      applyAutoPosition(true);
    };
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('orientationchange', onViewportChange);
    document.addEventListener('visibilitychange', onViewportChange);
    window.visualViewport?.addEventListener('resize', onViewportChange);
    window.visualViewport?.addEventListener('scroll', onViewportChange);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('orientationchange', onViewportChange);
      document.removeEventListener('visibilitychange', onViewportChange);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onViewportChange);
    };
  }, [dragging, applyAutoPosition]);

  /** Чат может появиться позже (после join) — пересчитать, чтобы не перекрыть «Чат». */
  useEffect(() => {
    if (dragging) return;
    const tick = () => {
      if (dragRef.current) return;
      setPos((p) => {
        const next = finalizePos(p, btnRef.current);
        return next.x === p.x && next.y === p.y ? p : next;
      });
    };
    const id = window.setInterval(tick, 1200);
    return () => {
      window.clearInterval(id);
    };
  }, [dragging, mode]);

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
        markDragHintSeen();
        setShowDragHint(false);
        setPos((current) => {
          const next = finalizePos(clampPos(current.x, current.y), btnRef.current);
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
  const hintVisible = showDragHint && !dragging;

  return (
    <button
      ref={btnRef}
      type="button"
      className={[
        'mobile-short-fullscreen-entry-btn',
        isExit ? 'mobile-short-fullscreen-entry-btn--exit' : 'mobile-short-fullscreen-entry-btn--enter',
        'mobile-short-fullscreen-entry-btn--floating',
        hintVisible ? 'mobile-short-fullscreen-entry-btn--with-hint' : '',
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
      <span className="mobile-short-fullscreen-entry-btn__main">
        <span className="mobile-short-fullscreen-entry-btn__grip" aria-hidden>
          ⠿
        </span>
        <span className="mobile-short-fullscreen-entry-btn__icon" aria-hidden>
          {isExit ? '×' : '⛶'}
        </span>
        <span
          className={[
            'mobile-short-fullscreen-entry-btn__label',
            !isExit
              ? 'mobile-short-fullscreen-entry-btn__label--shimmer'
              : 'mobile-short-fullscreen-entry-btn__label--exit-shimmer',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {isExit ? 'Выйти' : 'На весь экран'}
        </span>
      </span>
      {hintVisible && (
        <span className="mobile-short-fullscreen-entry-btn__drag-hint" aria-hidden>
          удержите · перетащите
        </span>
      )}
    </button>
  );
}
