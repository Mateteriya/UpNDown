/**
 * 4p / 3p (чат снизу) · landscape: диск ≤5 / мини ≥6 слева внизу Юга.
 * Обычный портрет: диск <5 справа от руки / мини ≥5 по центру низа Юга.
 * Старт всегда у слота рядом с картами; pin только после drag в этой сессии
 * (не из localStorage — иначе диск «прыгает» в 4p).
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  MOBILE_LS_HAND_DISK_SIZE_PX,
  MOBILE_LS_SOUTH_MINI_COLLAPSE_MS,
  clampMobileLsHandDiskPos,
  writeOnlineLsHandDiskPosToLs,
  type MobileLsChatAffordanceMode,
  type MobileLsHandDiskPos,
} from './mobileLandscapeChatContract';

export type MobileLandscapeChatAffordanceProps = {
  mode: MobileLsChatAffordanceMode;
  unread?: boolean;
  typingLine?: string | null;
  onOpen: () => void;
};

const DISK_DRAG_THRESHOLD_PX = 8;

function CrystalFacet({ gid, className, dim }: { gid: string; className?: string; dim?: boolean }) {
  return (
    <svg className={className} viewBox="0 0 16 16" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="42%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <path
        d="M8 1.15 L14.35 8 L8 14.85 L1.65 8 Z"
        fill={`url(#${gid})`}
        fillOpacity={dim ? 0.08 : 0.38}
        stroke={`url(#${gid})`}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <path
        d="M8 3.35 L12.15 8 L8 12.65 L3.85 8 Z"
        fill="none"
        stroke={`url(#${gid})`}
        strokeWidth="0.65"
        opacity="0.75"
      />
    </svg>
  );
}

export function MobileLandscapeChatAffordance({
  mode,
  unread = false,
  typingLine = null,
  onOpen,
}: MobileLandscapeChatAffordanceProps) {
  const reactId = useId().replace(/:/g, '');
  const typing = Boolean(typingLine?.trim());
  const showTyping = mode === 'hand-disk' && typing;
  const showUnread = unread && (mode === 'south-mini' || !typing);
  const [miniCollapsed, setMiniCollapsed] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  const [pinned, setPinned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [posReady, setPosReady] = useState(false);
  const [pos, setPos] = useState<MobileLsHandDiskPos>({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const slotRef = useRef<HTMLSpanElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const applyPosToDom = useCallback((p: MobileLsHandDiskPos) => {
    const el = btnRef.current;
    if (!el) return;
    el.style.left = `${p.x}px`;
    el.style.top = `${p.y}px`;
  }, []);

  const clearDragListeners = useCallback(() => {
    dragCleanupRef.current?.();
    dragCleanupRef.current = null;
  }, []);

  useEffect(() => () => clearDragListeners(), [clearDragListeners]);

  useEffect(() => {
    if (mode === 'hand-disk') return;
    setPinned(false);
    setDragging(false);
    setPosReady(false);
  }, [mode]);

  useLayoutEffect(() => {
    if (mode !== 'hand-disk' || pinned || dragging) return;
    const slot = slotRef.current;
    if (!slot) return;
    const sync = () => {
      const r = slot.getBoundingClientRect();
      const next = clampMobileLsHandDiskPos(r.left, r.top);
      posRef.current = next;
      applyPosToDom(next);
      setPos(next);
      setPosReady(true);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(slot);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [mode, pinned, dragging, applyPosToDom]);

  useEffect(() => {
    if (mode !== 'hand-disk' || !pinned) return;
    const onResize = () => {
      setPos((p) => {
        const next = clampMobileLsHandDiskPos(p.x, p.y);
        posRef.current = next;
        applyPosToDom(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, pinned, applyPosToDom]);

  const armMiniCollapse = useCallback(() => {
    if (collapseTimerRef.current != null) window.clearTimeout(collapseTimerRef.current);
    collapseTimerRef.current = window.setTimeout(() => {
      setMiniCollapsed(true);
      collapseTimerRef.current = null;
    }, MOBILE_LS_SOUTH_MINI_COLLAPSE_MS);
  }, []);

  useEffect(() => {
    if (mode !== 'south-mini') {
      setMiniCollapsed(false);
      if (collapseTimerRef.current != null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
      return;
    }
    setMiniCollapsed(false);
    armMiniCollapse();
    return () => {
      if (collapseTimerRef.current != null) {
        window.clearTimeout(collapseTimerRef.current);
        collapseTimerRef.current = null;
      }
    };
  }, [mode, armMiniCollapse]);

  const expandMiniTemporarily = useCallback(() => {
    if (mode !== 'south-mini') return;
    setMiniCollapsed(false);
    armMiniCollapse();
  }, [mode, armMiniCollapse]);

  const onDiskPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLButtonElement>) => {
      if (mode !== 'hand-disk') return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearDragListeners();
      const rect = e.currentTarget.getBoundingClientRect();
      const visual = clampMobileLsHandDiskPos(rect.left, rect.top);
      flushSync(() => {
        setDragging(true);
        setPos(visual);
      });
      posRef.current = visual;
      applyPosToDom(visual);

      const pointerId = e.pointerId;
      const target = e.currentTarget;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      dragRef.current = {
        pointerId,
        startX: e.clientX,
        startY: e.clientY,
        origX: visual.x,
        origY: visual.y,
        moved: false,
      };

      let moveRaf = 0;
      const onMove = (ev: PointerEvent) => {
        const d = dragRef.current;
        if (!d || d.pointerId !== ev.pointerId) return;
        const dx = ev.clientX - d.startX;
        const dy = ev.clientY - d.startY;
        if (!d.moved) {
          if (dx * dx + dy * dy < DISK_DRAG_THRESHOLD_PX * DISK_DRAG_THRESHOLD_PX) return;
          d.moved = true;
        }
        ev.preventDefault();
        const next = clampMobileLsHandDiskPos(d.origX + dx, d.origY + dy);
        posRef.current = next;
        applyPosToDom(next);
        if (!moveRaf) {
          moveRaf = window.requestAnimationFrame(() => {
            moveRaf = 0;
            setPos(posRef.current);
          });
        }
      };

      const onUp = (ev: PointerEvent) => {
        if (ev.pointerId !== pointerId) return;
        try {
          if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        clearDragListeners();
        const d = dragRef.current;
        dragRef.current = null;
        const finalPos = posRef.current;
        flushSync(() => {
          setPos(finalPos);
          setDragging(false);
        });
        applyPosToDom(finalPos);
        if (!d) return;
        if (d.moved) {
          writeOnlineLsHandDiskPosToLs(finalPos);
          setPinned(true);
          return;
        }
        onOpen();
      };

      window.addEventListener('pointermove', onMove, { capture: true, passive: false });
      window.addEventListener('pointerup', onUp, { capture: true });
      window.addEventListener('pointercancel', onUp, { capture: true });
      dragCleanupRef.current = () => {
        if (moveRaf) window.cancelAnimationFrame(moveRaf);
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
        window.removeEventListener('pointercancel', onUp, true);
      };
    },
    [mode, applyPosToDom, clearDragListeners, onOpen],
  );

  const label = showTyping
    ? `Открыть чат. ${typingLine!.trim()}`
    : unread
      ? 'Открыть чат. Есть новые сообщения'
      : 'Открыть чат';

  const button = (
    <button
      ref={btnRef}
      type="button"
      className={[
        'mobile-ls-chat-affordance',
        mode === 'hand-disk'
          ? 'mobile-ls-chat-affordance--hand-disk'
          : 'mobile-ls-chat-affordance--south-mini',
        mode === 'hand-disk' ? 'mobile-ls-chat-affordance--hand-disk-float' : '',
        mode === 'hand-disk' && dragging ? 'mobile-ls-chat-affordance--dragging' : '',
        mode === 'south-mini' && miniCollapsed ? 'mobile-ls-chat-affordance--micro' : '',
        showTyping ? 'mobile-ls-chat-affordance--typing' : '',
        unread ? 'mobile-ls-chat-affordance--unread' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      data-upnd-table-chat-toggle=""
      aria-label={label}
      title={mode === 'hand-disk' ? `${label}. Потяните, чтобы переместить` : label}
      onClick={mode === 'hand-disk' ? undefined : onOpen}
      onPointerDown={mode === 'hand-disk' ? onDiskPointerDown : undefined}
      onPointerEnter={expandMiniTemporarily}
      onFocus={expandMiniTemporarily}
      style={
        mode === 'hand-disk'
          ? {
              position: 'fixed',
              left: pos.x,
              top: pos.y,
              width: MOBILE_LS_HAND_DISK_SIZE_PX,
              height: MOBILE_LS_HAND_DISK_SIZE_PX,
              margin: 0,
              zIndex: dragging ? 95 : 90,
              touchAction: 'none',
              cursor: dragging ? 'grabbing' : 'grab',
              visibility: posReady || dragging || pinned ? 'visible' : 'hidden',
            }
          : undefined
      }
    >
      {mode === 'hand-disk' ? (
        <>
          {!dragging ? (
            <span className="mobile-ls-chat-affordance__orbit" aria-hidden>
              <svg className="mobile-ls-chat-affordance__orbit-ring" viewBox="0 0 100 100" focusable="false">
                <defs>
                  <linearGradient id={`${reactId}-orbit`} x1="12%" y1="8%" x2="88%" y2="92%">
                    <stop offset="0%" stopColor="#00e5ff" />
                    <stop offset="16%" stopColor="#c084fc" />
                    <stop offset="32%" stopColor="#ff2ecf" />
                    <stop offset="48%" stopColor="#8b5cf6" />
                    <stop offset="64%" stopColor="#22d3ee" />
                    <stop offset="80%" stopColor="#ff5ae8" />
                    <stop offset="100%" stopColor="#a855f7" />
                  </linearGradient>
                </defs>
                <circle
                  cx="50"
                  cy="50"
                  r="42"
                  fill="none"
                  stroke={`url(#${reactId}-orbit)`}
                  strokeWidth="1.85"
                  strokeLinecap="round"
                  strokeDasharray="4.2 5.8"
                />
              </svg>
              {[0, 60, 120, 180, 240, 300].map((deg, i) => (
                <span
                  key={deg}
                  className={[
                    'mobile-ls-chat-affordance__orbit-arrow',
                    i % 2 === 0 ? 'mobile-ls-chat-affordance__orbit-arrow--rim' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ ['--a' as string]: `${deg}deg` }}
                />
              ))}
            </span>
          ) : null}
          <span className="mobile-ls-chat-affordance__disk" aria-hidden>
            <span className="mobile-ls-chat-affordance__disk-prism" />
            <CrystalFacet
              gid={`${reactId}-disk`}
              dim
              className="mobile-ls-chat-affordance__crystal mobile-ls-chat-affordance__crystal--disk"
            />
            <span className="mobile-ls-chat-affordance__disk-core" />
            <span className="mobile-ls-chat-affordance__disk-glyph">Чат</span>
          </span>
          {unread ? <span className="mobile-ls-chat-affordance__dot" aria-hidden /> : null}
          {showTyping ? (
            <span className="mobile-ls-chat-affordance__typing" aria-hidden>
              <i />
              <i />
              <i />
            </span>
          ) : null}
        </>
      ) : (
        <>
          <CrystalFacet
            gid={`${reactId}-mini`}
            className="mobile-ls-chat-affordance__crystal mobile-ls-chat-affordance__crystal--mini"
          />
          <span className="mobile-ls-chat-affordance__mini-label">Чат</span>
          {showUnread ? <span className="mobile-ls-chat-affordance__dot" aria-hidden /> : null}
        </>
      )}
    </button>
  );

  if (mode === 'hand-disk') {
    return (
      <>
        {!pinned ? (
          <span ref={slotRef} className="mobile-ls-chat-affordance--hand-disk-slot" aria-hidden />
        ) : null}
        {typeof document !== 'undefined' ? createPortal(button, document.body) : button}
      </>
    );
  }

  return button;
}
