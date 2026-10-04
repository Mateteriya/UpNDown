import { useCallback, useEffect, useRef, useState } from 'react';
import {
  computeMobileBottomObstructionInsetPx,
  readMobileVisibleViewportBottomPx,
} from '../lib/mobileBrowserChrome';

const POS_STORAGE_ENTER = 'upd.mobileShortFullscreenBtnPos.enter.v1';
const POS_STORAGE_EXIT = 'upd.mobileShortFullscreenBtnPos.exit.v1';
/** Портрет: enter и exit делят одну точку (кнопка «на том же месте»). */
const POS_STORAGE_PORTRAIT_DOCK = 'upd.mobileShortFullscreenBtnPos.portraitDock.v1';
const DRAG_HINT_SEEN_KEY = 'upd.mobileShortFullscreenBtnDragHintSeen.v1';
const DRAG_THRESHOLD_PX = 10;
/** Запас над видимым низом при авто-подъёме (px). */
const OVERLAP_CLEARANCE_PX = 10;
/** Зазор до кнопки «Чат», чтобы плавающий fullscreen её не перекрывал. */
const CHAT_TOGGLE_CLEARANCE_PX = 14;
/** После простоя сворачиваем подпись до глифа. */
const COLLAPSE_IDLE_MS = 40_000;

type StoredPos = { x: number; y: number };
type Mode = 'enter' | 'exit';

function storageKeyForMode(mode: Mode, dockSouthLeft: boolean): string {
  if (dockSouthLeft) return POS_STORAGE_PORTRAIT_DOCK;
  return mode === 'exit' ? POS_STORAGE_EXIT : POS_STORAGE_ENTER;
}

function readStoredPos(mode: Mode, dockSouthLeft: boolean): StoredPos | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKeyForMode(mode, dockSouthLeft));
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredPos;
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
    return p;
  } catch {
    return null;
  }
}

function writeStoredPos(mode: Mode, dockSouthLeft: boolean, pos: StoredPos): void {
  try {
    localStorage.setItem(storageKeyForMode(mode, dockSouthLeft), JSON.stringify(pos));
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
function defaultPosForMode(mode: Mode, standaloneDisplay = false, dockSouthLeft = false): StoredPos {
  const box = readViewportBox();
  const bottomInset = computeMobileBottomObstructionInsetPx({
    standaloneDisplay,
    marginPx: mode === 'exit' ? 8 : 10,
  });
  const y = box.top + box.height - bottomInset;
  if (dockSouthLeft) {
    // Центр ≈ CSS-якорь left:max(8,safe) + половина ширины полной кнопки
    return clampPos(box.left + 64, y);
  }
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

function resolveInitialPos(mode: Mode, standaloneDisplay = false, dockSouthLeft = false): StoredPos {
  return readStoredPos(mode, dockSouthLeft) ?? defaultPosForMode(mode, standaloneDisplay, dockSouthLeft);
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
  /** Обычный портрет: стартовый якорь под Югом слева; enter/exit делят позицию; drag включён. */
  dockSouthLeft?: boolean;
};

export function MobileShortFullscreenFloatingBtn({
  mode,
  onTap,
  standaloneDisplay = false,
  dockSouthLeft = false,
}: Props) {
  const [pos, setPos] = useState<StoredPos>(() => resolveInitialPos(mode, standaloneDisplay, dockSouthLeft));
  const [dragging, setDragging] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [showDragHint, setShowDragHint] = useState(() => !readDragHintSeen());
  const [useFloatingPos, setUseFloatingPos] = useState(
    () => !dockSouthLeft || readStoredPos(mode, dockSouthLeft) != null,
  );
  const hasCustomPosRef = useRef(readStoredPos(mode, dockSouthLeft) != null);
  const modeRef = useRef(mode);
  const dockRef = useRef(dockSouthLeft);
  const btnRef = useRef<HTMLButtonElement>(null);
  const collapseTimerRef = useRef<number | null>(null);
  modeRef.current = mode;
  dockRef.current = dockSouthLeft;
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
  } | null>(null);

  const clearCollapseTimer = useCallback(() => {
    if (collapseTimerRef.current != null) {
      window.clearTimeout(collapseTimerRef.current);
      collapseTimerRef.current = null;
    }
  }, []);

  const bumpExpanded = useCallback(() => {
    setCollapsed(false);
    clearCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      setCollapsed(true);
      collapseTimerRef.current = null;
    }, COLLAPSE_IDLE_MS);
  }, [clearCollapseTimer]);

  useEffect(() => {
    bumpExpanded();
    return clearCollapseTimer;
  }, [mode, dockSouthLeft, bumpExpanded, clearCollapseTimer]);

  const applyAutoPosition = useCallback(
    (respectCustom: boolean) => {
      if (dockSouthLeft && !hasCustomPosRef.current) return;
      if (respectCustom && hasCustomPosRef.current) {
        setPos((p) => finalizePos(clampPos(p.x, p.y), btnRef.current));
        return;
      }
      const next = defaultPosForMode(modeRef.current, standaloneDisplay, dockSouthLeft);
      setPos(finalizePos(next, btnRef.current));
    },
    [standaloneDisplay, dockSouthLeft],
  );

  useEffect(() => {
    const saved = readStoredPos(mode, dockSouthLeft);
    hasCustomPosRef.current = saved != null;
    if (saved) {
      setUseFloatingPos(true);
      setPos(finalizePos(clampPos(saved.x, saved.y), btnRef.current));
      return;
    }
    if (dockSouthLeft) {
      setUseFloatingPos(false);
      return;
    }
    applyAutoPosition(false);
  }, [mode, standaloneDisplay, applyAutoPosition, dockSouthLeft]);

  useEffect(() => {
    if (!useFloatingPos || dragging) return;
    const id = window.requestAnimationFrame(() => {
      const btn = btnRef.current;
      if (!btn) return;
      setPos((p) => {
        const next = finalizePos(p, btn);
        return next.x === p.x && next.y === p.y ? p : next;
      });
    });
    return () => window.cancelAnimationFrame(id);
  }, [pos.x, pos.y, mode, standaloneDisplay, dragging, useFloatingPos]);

  useEffect(() => {
    if (dockSouthLeft && !hasCustomPosRef.current) return;
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
  }, [dragging, applyAutoPosition, dockSouthLeft]);

  /** Чат может появиться позже (после join) — пересчитать, чтобы не перекрыть «Чат». */
  useEffect(() => {
    if (!useFloatingPos || dragging) return;
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
  }, [dragging, mode, useFloatingPos]);

  const seedPosFromDomIfNeeded = useCallback(() => {
    if (useFloatingPos) return pos;
    const btn = btnRef.current;
    if (!btn) return defaultPosForMode(modeRef.current, standaloneDisplay, dockRef.current);
    const r = btn.getBoundingClientRect();
    const seeded = clampPos(r.left + r.width / 2, r.top + r.height / 2);
    setPos(seeded);
    setUseFloatingPos(true);
    return seeded;
  }, [useFloatingPos, pos, standaloneDisplay]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      bumpExpanded();
      const origin = seedPosFromDomIfNeeded();
      dragRef.current = {
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: origin.x,
        originY: origin.y,
        moved: false,
      };
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [bumpExpanded, seedPosFromDomIfNeeded],
  );

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    setDragging(true);
    setUseFloatingPos(true);
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
      bumpExpanded();
      if (d.moved) {
        hasCustomPosRef.current = true;
        markDragHintSeen();
        setShowDragHint(false);
        setUseFloatingPos(true);
        setPos((current) => {
          const next = finalizePos(clampPos(current.x, current.y), btnRef.current);
          writeStoredPos(modeRef.current, dockRef.current, next);
          return next;
        });
        return;
      }
      onTap();
    },
    [onTap, bumpExpanded],
  );

  const onPointerCancel = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === e.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  }, []);

  const isExit = mode === 'exit';
  const floating = useFloatingPos || dragging;
  const hintVisible = floating && showDragHint && !dragging && !collapsed;

  return (
    <button
      ref={btnRef}
      type="button"
      className={[
        'mobile-short-fullscreen-entry-btn',
        isExit ? 'mobile-short-fullscreen-entry-btn--exit' : 'mobile-short-fullscreen-entry-btn--enter',
        'mobile-short-fullscreen-entry-btn--floating',
        dockSouthLeft ? 'mobile-short-fullscreen-entry-btn--dock-south-left' : '',
        floating ? 'mobile-short-fullscreen-entry-btn--undocked' : '',
        collapsed ? 'mobile-short-fullscreen-entry-btn--collapsed' : '',
        hintVisible ? 'mobile-short-fullscreen-entry-btn--with-hint' : '',
        dragging ? 'mobile-short-fullscreen-entry-btn--dragging' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      style={
        floating
          ? {
              left: pos.x,
              top: pos.y,
              transform: dragging ? 'translate(-50%, -50%) scale(1.04)' : 'translate(-50%, -50%)',
            }
          : undefined
      }
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
