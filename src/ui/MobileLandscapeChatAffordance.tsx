/**
 * 4p LS: диск ≤5 / мини ≥6 слева внизу Юга.
 * Портрет и 3p LS: всегда диск (мини нет). 3p LS 10+ — слот над Востоком.
 * 3p LS: живые стрелки ↓ / →; центр открывает last placement.
 * Старт у текущего слота; pin только после drag. Смена слота (9↔10) сбрасывает pin.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal, flushSync } from 'react-dom';
import {
  MOBILE_LS_HAND_DISK_CARD_GAP_PX,
  MOBILE_LS_HAND_DISK_ORBIT_PX,
  MOBILE_LS_HAND_DISK_PLACE_INTRO_MS,
  MOBILE_LS_HAND_DISK_PLACE_SOFT_MS,
  MOBILE_LS_HAND_DISK_PLACE_TICK_PX,
  MOBILE_LS_HAND_DISK_SIZE_PX,
  MOBILE_LS_SOUTH_MINI_COLLAPSE_MS,
  clampMobileLsHandDiskPos,
  nudgeMobileLsHandDiskOffRects,
  writeOnlineLsHandDiskPosToLs,
  type MobileLsChatAffordanceMode,
  type MobileLsChatPlacement,
  type MobileLsHandDiskHome,
  type MobileLsHandDiskPos,
} from './mobileLandscapeChatContract';

export type MobileLandscapeChatAffordanceProps = {
  mode: MobileLsChatAffordanceMode;
  unread?: boolean;
  typingLine?: string | null;
  onOpen: () => void;
  /** 3p landscape: last / current destination. Mini ignores ticks. */
  placement?: MobileLsChatPlacement | null;
  onOpenAt?: (place: MobileLsChatPlacement) => void;
  /** Где ставить диск, пока его не утащили. */
  diskHome?: MobileLsHandDiskHome;
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

function PlacementTickGlyph({ dir, gid }: { dir: MobileLsChatPlacement; gid: string }) {
  return (
    <svg className="mobile-ls-chat-affordance__place-glyph" viewBox="0 0 16 16" aria-hidden focusable="false">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="55%" stopColor="#a78bfa" />
          <stop offset="100%" stopColor="#f472b6" />
        </linearGradient>
      </defs>
      {dir === 'side' ? (
        <path
          d="M5.1 3.1 11.1 8 5.1 12.9"
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M3.1 5.1 8 11.1l4.9-6"
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth="2.15"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

export function MobileLandscapeChatAffordance({
  mode,
  unread = false,
  typingLine = null,
  onOpen,
  placement = null,
  onOpenAt,
  diskHome = 'hand',
}: MobileLandscapeChatAffordanceProps) {
  const reactId = useId().replace(/:/g, '');
  const typing = Boolean(typingLine?.trim());
  const showTyping = mode === 'hand-disk' && typing;
  const showUnread = unread && (mode === 'south-mini' || !typing);
  const showPlaceTicks = mode === 'hand-disk' && (placement === 'bottom' || placement === 'side') && !!onOpenAt;
  const [placeIntroPhase, setPlaceIntroPhase] = useState<'off' | 'bright' | 'soft'>('off');
  const [miniCollapsed, setMiniCollapsed] = useState(false);
  const collapseTimerRef = useRef<number | null>(null);

  const [pinned, setPinned] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [posReady, setPosReady] = useState(false);
  const [pos, setPos] = useState<MobileLsHandDiskPos>({ x: 0, y: 0 });
  const posRef = useRef(pos);
  posRef.current = pos;
  const slotRef = useRef<HTMLSpanElement | null>(null);
  const clusterRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);
  const dragCleanupRef = useRef<(() => void) | null>(null);

  const clampDisk = useCallback(
    (x: number, y: number) =>
      clampMobileLsHandDiskPos(x, y, {
        extraLeft: MOBILE_LS_HAND_DISK_ORBIT_PX,
        extraTop: MOBILE_LS_HAND_DISK_ORBIT_PX,
        extraRight:
          MOBILE_LS_HAND_DISK_ORBIT_PX + (showPlaceTicks ? MOBILE_LS_HAND_DISK_PLACE_TICK_PX : 0),
        extraBottom:
          MOBILE_LS_HAND_DISK_ORBIT_PX + (showPlaceTicks ? MOBILE_LS_HAND_DISK_PLACE_TICK_PX : 0),
      }),
    [showPlaceTicks],
  );

  const applyPosToDom = useCallback((p: MobileLsHandDiskPos) => {
    const el = clusterRef.current;
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

  useEffect(() => {
    if (!showPlaceTicks) {
      setPlaceIntroPhase('off');
      return;
    }
    setPlaceIntroPhase('bright');
    const softT = window.setTimeout(() => setPlaceIntroPhase('soft'), MOBILE_LS_HAND_DISK_PLACE_INTRO_MS);
    const offT = window.setTimeout(
      () => setPlaceIntroPhase('off'),
      MOBILE_LS_HAND_DISK_PLACE_INTRO_MS + MOBILE_LS_HAND_DISK_PLACE_SOFT_MS,
    );
    return () => {
      window.clearTimeout(softT);
      window.clearTimeout(offT);
    };
  }, [showPlaceTicks]);

  useLayoutEffect(() => {
    if (mode !== 'hand-disk' || pinned || dragging) return;
    const slot = slotRef.current;
    if (!slot) return;
    const halo = {
      extraLeft: MOBILE_LS_HAND_DISK_ORBIT_PX,
      extraTop: MOBILE_LS_HAND_DISK_ORBIT_PX,
      extraRight: MOBILE_LS_HAND_DISK_ORBIT_PX,
      extraBottom: MOBILE_LS_HAND_DISK_ORBIT_PX,
      gap: MOBILE_LS_HAND_DISK_CARD_GAP_PX,
    };
    const collectHandRects = () => {
      const row = slot.closest('.game-mobile-ls-hand-chat-row');
      if (!row) return [];
      const nodes = row.querySelectorAll(
        '.card-view-root, .game-mobile-hand-row > *, .game-mobile-l-hand-card-slot',
      );
      const out: { left: number; top: number; right: number; bottom: number }[] = [];
      nodes.forEach((n) => {
        if (!(n instanceof HTMLElement)) return;
        const cr = n.getBoundingClientRect();
        if (cr.width < 4 || cr.height < 4) return;
        out.push({ left: cr.left, top: cr.top, right: cr.right, bottom: cr.bottom });
      });
      return out;
    };
    const sync = () => {
      if (diskHome === 'east-header') {
        const host = slot.closest('.game-center-east') ?? slot.parentElement;
        const hr = host?.getBoundingClientRect();
        if (!hr || hr.width < 2) return;
        const size = MOBILE_LS_HAND_DISK_SIZE_PX;
        const next = clampDisk(hr.left + (hr.width - size) / 2, hr.top - size - 6);
        posRef.current = next;
        applyPosToDom(next);
        setPos(next);
        setPosReady(true);
        return;
      }
      const r = slot.getBoundingClientRect();
      const cards = collectHandRects();
      let next = { x: r.left, y: r.top };
      next = nudgeMobileLsHandDiskOffRects(next, cards, halo);
      next = clampDisk(next.x, next.y);
      next = nudgeMobileLsHandDiskOffRects(next, cards, halo);
      next = clampDisk(next.x, next.y);
      posRef.current = next;
      applyPosToDom(next);
      setPos(next);
      setPosReady(true);
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(slot);
    const handRow = slot.closest('.game-mobile-ls-hand-chat-row');
    if (handRow) {
      ro.observe(handRow);
      handRow
        .querySelectorAll('.game-mobile-hand-strip, .game-mobile-hand-row, .game-mobile-l-hand-shell')
        .forEach((el) => ro.observe(el));
    }
    const eastHost = slot.closest('.game-center-east');
    if (eastHost) ro.observe(eastHost);
    window.addEventListener('resize', sync);
    window.addEventListener('scroll', sync, true);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', sync);
      window.removeEventListener('scroll', sync, true);
    };
  }, [mode, diskHome, pinned, dragging, applyPosToDom, clampDisk]);

  useEffect(() => {
    if (mode !== 'hand-disk' || !pinned) return;
    const onResize = () => {
      setPos((p) => {
        const next = clampDisk(p.x, p.y);
        posRef.current = next;
        applyPosToDom(next);
        return next;
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [mode, pinned, applyPosToDom, clampDisk]);

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
      const rect = (clusterRef.current ?? e.currentTarget).getBoundingClientRect();
      const visual = clampDisk(rect.left, rect.top);
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
        const next = clampDisk(d.origX + dx, d.origY + dy);
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
    [mode, applyPosToDom, clearDragListeners, onOpen, clampDisk],
  );

  const label = showTyping
    ? `Открыть чат. ${typingLine!.trim()}`
    : unread
      ? 'Открыть чат. Есть новые сообщения'
      : 'Открыть чат';

  const diskInner =
    mode === 'hand-disk' ? (
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
            {(showPlaceTicks ? [0, 230, 310] : [0, 60, 120, 180, 240, 300]).map((deg, i) => (
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
    );

  const button = (
    <button
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
    >
      {diskInner}
    </button>
  );

  const onPlaceTick = (place: MobileLsChatPlacement) => (e: ReactPointerEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    onOpenAt?.(place);
  };

  if (mode === 'hand-disk') {
    const cluster = (
      <div
        ref={clusterRef}
        className={[
          'mobile-ls-chat-affordance-cluster',
          showPlaceTicks ? 'mobile-ls-chat-affordance-cluster--place' : '',
          dragging ? 'mobile-ls-chat-affordance-cluster--dragging' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          position: 'fixed',
          left: pos.x,
          top: pos.y,
          width: MOBILE_LS_HAND_DISK_SIZE_PX,
          height: MOBILE_LS_HAND_DISK_SIZE_PX,
          margin: 0,
          zIndex: dragging ? 95 : 90,
          visibility: posReady || dragging || pinned ? 'visible' : 'hidden',
        }}
      >
        {button}
        {showPlaceTicks && !dragging ? (
          <>
            <button
              type="button"
              className={[
                'mobile-ls-chat-affordance__place-tick',
                'mobile-ls-chat-affordance__place-tick--east',
                placement === 'side' ? 'is-active' : '',
                placeIntroPhase === 'bright' ? 'mobile-ls-chat-affordance__place-tick--intro' : '',
                placeIntroPhase === 'soft' ? 'mobile-ls-chat-affordance__place-tick--soft' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Открыть чат справа от сукна"
              aria-pressed={placement === 'side'}
              title="Чат справа от сукна"
              onPointerDown={onPlaceTick('side')}
            >
              <PlacementTickGlyph dir="side" gid={`${reactId}-tick-e`} />
            </button>
            <button
              type="button"
              className={[
                'mobile-ls-chat-affordance__place-tick',
                'mobile-ls-chat-affordance__place-tick--south',
                placement === 'bottom' ? 'is-active' : '',
                placeIntroPhase === 'bright' ? 'mobile-ls-chat-affordance__place-tick--intro' : '',
                placeIntroPhase === 'soft' ? 'mobile-ls-chat-affordance__place-tick--soft' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              aria-label="Открыть чат снизу, под Югом"
              aria-pressed={placement === 'bottom'}
              title="Чат снизу под Югом"
              onPointerDown={onPlaceTick('bottom')}
            >
              <PlacementTickGlyph dir="bottom" gid={`${reactId}-tick-s`} />
            </button>
          </>
        ) : null}
      </div>
    );
    return (
      <>
        {!pinned ? (
          <span
            ref={slotRef}
            className={[
              'mobile-ls-chat-affordance--hand-disk-slot',
              diskHome === 'east-header' ? 'mobile-ls-chat-affordance--hand-disk-slot--east-header' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-hidden
          />
        ) : null}
        {typeof document !== 'undefined' ? createPortal(cluster, document.body) : cluster}
      </>
    );
  }

  return button;
}
