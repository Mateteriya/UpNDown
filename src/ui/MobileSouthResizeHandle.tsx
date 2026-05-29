import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  applyDealResultsStretchPx,
  dealResultsModalResizingRef,
  dealResultsResizeHintClassName,
  readDealResultsDomStretchPx,
  updateDealResultsResizeHintClass,
} from './dealResultsModalStretch';

const MOBILE_SHORT_SOUTH_RESIZE_LIFT_PX = 0;

type MobileSouthResizeHandleProps = {
  stretchPx: number;
  stretchMaxPx: number;
  onStretchPxChange: (px: number) => void;
  visible?: boolean;
  /** Подписи aria/title; по умолчанию — панель Юга (short-VH). */
  ariaHints?: {
    downOnly: string;
    upOnly: string;
    both: string;
    none: string;
  };
  handleClassName?: string;
  /** Маркер для CSS (модалка «Результаты» — отдельный блок стилей в конце index.css). */
  capsuleVariant?: 'deal-results-modal';
  /** Модалка «Результаты»: без увеличения капсулы при тапе/тяге. */
  suppressTapGlow?: boolean;
};

const DEFAULT_ARIA_HINTS = {
  downOnly: 'Можно потянуть только вниз, чтобы опустить панель',
  upOnly: 'Можно потянуть только вверх, чтобы поднять панель',
  both: 'Потяните вверх или вниз, чтобы изменить высоту панели',
  none: 'Масштаб панели Юга',
} as const;

/** Капсула Down'n'Up — та же ручка, что у панели Юга (short-VH). */
export function MobileSouthResizeHandle({
  stretchPx,
  stretchMaxPx,
  onStretchPxChange,
  visible = true,
  ariaHints = DEFAULT_ARIA_HINTS,
  handleClassName,
  capsuleVariant,
  suppressTapGlow = false,
}: MobileSouthResizeHandleProps) {
  const [tapGlow, setTapGlow] = useState(false);
  const stretchPxRef = useRef(stretchPx);
  const stretchMaxPxRef = useRef(stretchMaxPx);
  const dragRef = useRef<{ startY: number; startStretch: number } | null>(null);
  const docCleanupRef = useRef<(() => void) | null>(null);
  const gestureActiveRef = useRef(false);
  const handleRef = useRef<HTMLButtonElement | null>(null);
  const visibleRef = useRef(visible);
  const tapGlowTimerRef = useRef<number | null>(null);
  const stretchRafRef = useRef<number | null>(null);
  const stretchPendingRef = useRef<number | null>(null);

  stretchPxRef.current = stretchPx;
  stretchMaxPxRef.current = stretchMaxPx;
  visibleRef.current = visible;

  const imperativeStretch = capsuleVariant === 'deal-results-modal';

  const engageGlow = useCallback(() => {
    if (tapGlowTimerRef.current !== null) {
      window.clearTimeout(tapGlowTimerRef.current);
      tapGlowTimerRef.current = null;
    }
    setTapGlow(true);
    handleRef.current?.classList.add('game-mobile-short-south-resize-handle--tap-glow');
  }, []);

  const scheduleGlowOff = useCallback(() => {
    if (tapGlowTimerRef.current !== null) {
      window.clearTimeout(tapGlowTimerRef.current);
      tapGlowTimerRef.current = null;
    }
    tapGlowTimerRef.current = window.setTimeout(() => {
      tapGlowTimerRef.current = null;
      setTapGlow(false);
      handleRef.current?.classList.remove('game-mobile-short-south-resize-handle--tap-glow');
    }, 1400);
  }, []);

  const getDealResultsStack = useCallback(
    () => handleRef.current?.closest<HTMLElement>('.deal-results-modal-mobile-stack') ?? null,
    [],
  );

  const syncDealResultsBorderLinesRef = useRef<(() => void) | null>(null);

  const applyImperativeStretch = useCallback(
    (next: number) => {
      stretchPxRef.current = next;
      const handle = handleRef.current;
      if (handle) {
        updateDealResultsResizeHintClass(handle, next, stretchMaxPxRef.current);
      }
      const stack = getDealResultsStack();
      if (stack) applyDealResultsStretchPx(stack, next);
      syncDealResultsBorderLinesRef.current?.();
    },
    [getDealResultsStack],
  );

  const setDealResultsResizing = useCallback((active: boolean) => {
    dealResultsModalResizingRef.current = active;
    const overlay = handleRef.current?.closest<HTMLElement>('.deal-results-modal-overlay-mobile');
    /* Класс только для capsule transition — backdrop не трогаем (вспышки на Android) */
    overlay?.classList.toggle('deal-results-modal-resizing', active);
  }, []);

  const flushStretchPending = useCallback(() => {
    stretchRafRef.current = null;
    if (stretchPendingRef.current === null) return;
    const next = stretchPendingRef.current;
    stretchPendingRef.current = null;
    if (imperativeStretch && gestureActiveRef.current) {
      applyImperativeStretch(next);
      return;
    }
    onStretchPxChange(next);
  }, [applyImperativeStretch, imperativeStretch, onStretchPxChange]);

  const scheduleStretchPx = useCallback(
    (next: number) => {
      if (imperativeStretch && gestureActiveRef.current) {
        stretchPendingRef.current = next;
        if (stretchRafRef.current === null) {
          stretchRafRef.current = window.requestAnimationFrame(flushStretchPending);
        }
        return;
      }
      stretchPendingRef.current = next;
      if (stretchRafRef.current === null) {
        stretchRafRef.current = window.requestAnimationFrame(flushStretchPending);
      }
    },
    [flushStretchPending, imperativeStretch],
  );

  const cancelStretchRaf = useCallback(() => {
    if (stretchRafRef.current !== null) {
      window.cancelAnimationFrame(stretchRafRef.current);
      stretchRafRef.current = null;
    }
    if (stretchPendingRef.current === null) return;
    const next = stretchPendingRef.current;
    stretchPendingRef.current = null;
    if (imperativeStretch) {
      const rounded = Math.round(next);
      applyImperativeStretch(rounded);
      onStretchPxChange(rounded);
      return;
    }
    onStretchPxChange(next);
  }, [applyImperativeStretch, imperativeStretch, onStretchPxChange]);

  const beginResize = useCallback(
    (
      el: HTMLElement,
      clientY: number,
      nativeEvent: Event,
      mode: { type: 'pointer'; pointerId: number } | { type: 'touch'; touchId: number },
    ) => {
      if (!visibleRef.current || gestureActiveRef.current) return;
      nativeEvent.preventDefault();
      nativeEvent.stopPropagation();

      docCleanupRef.current?.();
      docCleanupRef.current = null;

      if (!suppressTapGlow) engageGlow();
      gestureActiveRef.current = true;
      let startStretch = stretchPxRef.current;
      if (imperativeStretch) {
        const stack = getDealResultsStack();
        if (stack) {
          startStretch = readDealResultsDomStretchPx(stack);
          stretchPxRef.current = startStretch;
          applyDealResultsStretchPx(stack, startStretch);
        }
        if (handleRef.current) {
          updateDealResultsResizeHintClass(
            handleRef.current,
            startStretch,
            stretchMaxPxRef.current,
          );
        }
        setDealResultsResizing(true);
      }
      dragRef.current = { startY: clientY, startStretch };

      const docOpts: AddEventListenerOptions = { capture: true, passive: false };

      const applyDy = (cy: number) => {
        const d = dragRef.current;
        if (!d) return;
        const dy = cy - d.startY;
        const next = Math.max(0, Math.min(stretchMaxPxRef.current, d.startStretch + dy));
        scheduleStretchPx(next);
      };

      const finishGesture = () => {
        gestureActiveRef.current = false;
        if (stretchRafRef.current !== null) {
          window.cancelAnimationFrame(stretchRafRef.current);
          stretchRafRef.current = null;
        }
        stretchPendingRef.current = null;
        if (imperativeStretch) {
          const final = Math.round(stretchPxRef.current);
          applyImperativeStretch(final);
          onStretchPxChange(final);
          setDealResultsResizing(false);
        } else {
          cancelStretchRaf();
        }
        scheduleGlowOff();
      };

      if (mode.type === 'pointer') {
        const { pointerId } = mode;
        const move = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          ev.preventDefault();
          applyDy(ev.clientY);
        };
        const up = (ev: PointerEvent) => {
          if (ev.pointerId !== pointerId) return;
          ev.preventDefault();
          document.removeEventListener('pointermove', move, docOpts);
          document.removeEventListener('pointerup', up, docOpts);
          document.removeEventListener('pointercancel', up, docOpts);
          docCleanupRef.current = null;
          dragRef.current = null;
          finishGesture();
          try {
            el.releasePointerCapture(pointerId);
          } catch {
            /* ignore */
          }
        };
        document.addEventListener('pointermove', move, docOpts);
        document.addEventListener('pointerup', up, docOpts);
        document.addEventListener('pointercancel', up, docOpts);
        docCleanupRef.current = () => {
          document.removeEventListener('pointermove', move, docOpts);
          document.removeEventListener('pointerup', up, docOpts);
          document.removeEventListener('pointercancel', up, docOpts);
          finishGesture();
        };
        try {
          el.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        return;
      }

      const { touchId } = mode;
      const move = (ev: TouchEvent) => {
        const t = Array.from(ev.touches).find((x) => x.identifier === touchId);
        if (!t) return;
        if (ev.cancelable) ev.preventDefault();
        applyDy(t.clientY);
      };
      const end = (ev: TouchEvent) => {
        for (let i = 0; i < ev.changedTouches.length; i++) {
          if (ev.changedTouches[i].identifier === touchId) {
            if (ev.cancelable) ev.preventDefault();
            document.removeEventListener('touchmove', move, docOpts);
            document.removeEventListener('touchend', end, docOpts);
            document.removeEventListener('touchcancel', end, docOpts);
            docCleanupRef.current = null;
            dragRef.current = null;
            finishGesture();
            return;
          }
        }
      };
      document.addEventListener('touchmove', move, docOpts);
      document.addEventListener('touchend', end, docOpts);
      document.addEventListener('touchcancel', end, docOpts);
      docCleanupRef.current = () => {
        document.removeEventListener('touchmove', move, docOpts);
        document.removeEventListener('touchend', end, docOpts);
        document.removeEventListener('touchcancel', end, docOpts);
        finishGesture();
      };
    },
    [
      cancelStretchRaf,
      engageGlow,
      imperativeStretch,
      scheduleGlowOff,
      scheduleStretchPx,
      setDealResultsResizing,
      suppressTapGlow,
    ],
  );

  const onPointerDownCapture = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!visibleRef.current) return;
      if (gestureActiveRef.current) {
        e.preventDefault();
        return;
      }
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      /* Android: touch обрабатывает touchstart — иначе pointercancel рвёт жест и таблица прыгает */
      if (imperativeStretch && e.pointerType === 'touch') return;
      beginResize(e.currentTarget, e.clientY, e.nativeEvent, {
        type: 'pointer',
        pointerId: e.pointerId,
      });
    },
    [beginResize],
  );

  useEffect(
    () => () => {
      docCleanupRef.current?.();
      docCleanupRef.current = null;
      dragRef.current = null;
      dealResultsModalResizingRef.current = false;
      if (tapGlowTimerRef.current !== null) window.clearTimeout(tapGlowTimerRef.current);
      if (stretchRafRef.current !== null) window.cancelAnimationFrame(stretchRafRef.current);
      stretchRafRef.current = null;
      stretchPendingRef.current = null;
    },
    [],
  );

  useEffect(() => {
    if (!visible) {
      gestureActiveRef.current = false;
      docCleanupRef.current?.();
      docCleanupRef.current = null;
      dragRef.current = null;
      setTapGlow(false);
      handleRef.current?.classList.remove('game-mobile-short-south-resize-handle--tap-glow');
      if (tapGlowTimerRef.current !== null) {
        window.clearTimeout(tapGlowTimerRef.current);
        tapGlowTimerRef.current = null;
      }
    }
  }, [visible]);

  useLayoutEffect(() => {
    const el = handleRef.current;
    if (!el || !visible) return;

    const opts: AddEventListenerOptions = { capture: true, passive: false };
    const onTouchStart = (e: TouchEvent) => {
      if (!visibleRef.current) return;
      if (gestureActiveRef.current) {
        if (e.cancelable) e.preventDefault();
        return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      beginResize(el, t.clientY, e, { type: 'touch', touchId: t.identifier });
    };

    el.addEventListener('touchstart', onTouchStart, opts);
    return () => {
      el.removeEventListener('touchstart', onTouchStart, opts);
    };
  }, [visible, beginResize]);

  const stretchHint =
    stretchMaxPx <= 0
      ? ('down-only' as const)
      : stretchPx <= 0
        ? ('down-only' as const)
        : stretchPx >= stretchMaxPx - 1
          ? ('up-only' as const)
          : ('both' as const);

  const dealResultsHintClass =
    capsuleVariant === 'deal-results-modal'
      ? dealResultsResizeHintClassName(stretchPx, stretchMaxPx)
      : '';

  useLayoutEffect(() => {
    if (capsuleVariant !== 'deal-results-modal' || !handleRef.current) return;
    updateDealResultsResizeHintClass(handleRef.current, stretchPx, stretchMaxPx);
  }, [capsuleVariant, stretchPx, stretchMaxPx]);

  useLayoutEffect(() => {
    if (capsuleVariant !== 'deal-results-modal') return;
    const el = handleRef.current;
    if (!el || !visible) return;

    const capsule = el.querySelector<HTMLElement>('.game-mobile-short-south-resize-handle__capsule');
    const borderHost = el
      .closest('.deal-results-modal-overlay-mobile')
      ?.querySelector<HTMLElement>('.deal-results-table-outer-mobile-modal');
    if (!capsule || !borderHost) return;

    const tableWindow = borderHost.querySelector<HTMLElement>('.deal-results-table-window');
    if (!tableWindow) return;

    const LINE_GAP_PX = 2;
    const LINE_TOWARD_CAPSULE_PX = 8;

    const syncBorderLines = () => {
      const winRect = tableWindow.getBoundingClientRect();
      const capRect = capsule.getBoundingClientRect();
      if (winRect.width <= 0 || capRect.width <= 0) return;

      const leftEnd = capRect.left - winRect.left - LINE_GAP_PX + LINE_TOWARD_CAPSULE_PX;
      const rightStart = capRect.right - winRect.left + LINE_GAP_PX - LINE_TOWARD_CAPSULE_PX;

      tableWindow.style.setProperty('--deal-results-line-left-end-px', `${Math.max(0, leftEnd)}px`);
      tableWindow.style.setProperty('--deal-results-line-right-start-px', `${rightStart}px`);
      tableWindow.style.setProperty('--deal-results-mask-gap-left-px', `${Math.max(0, leftEnd)}px`);
      tableWindow.style.setProperty('--deal-results-mask-gap-right-px', `${rightStart}px`);
    };

    syncDealResultsBorderLinesRef.current = syncBorderLines;

    syncBorderLines();
    let resizeTimer: number | null = null;
    const onWindowResize = () => {
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        resizeTimer = null;
        syncBorderLines();
      }, 200);
    };
    window.addEventListener('resize', onWindowResize);
    return () => {
      syncDealResultsBorderLinesRef.current = null;
      if (resizeTimer !== null) window.clearTimeout(resizeTimer);
      window.removeEventListener('resize', onWindowResize);
    };
  }, [capsuleVariant, visible]);

  if (!visible) return null;
  const hintClass =
    capsuleVariant === 'deal-results-modal'
      ? dealResultsHintClass
      : stretchHint === 'down-only'
        ? 'game-mobile-short-south-resize-handle--hint-down-only'
        : stretchHint === 'up-only'
          ? 'game-mobile-short-south-resize-handle--hint-up-only'
          : stretchHint === 'both'
            ? 'game-mobile-short-south-resize-handle--hint-both'
            : '';
  const ariaHint =
    stretchHint === 'down-only'
      ? ariaHints.downOnly
      : stretchHint === 'up-only'
        ? ariaHints.upOnly
        : stretchHint === 'both'
          ? ariaHints.both
          : ariaHints.none;
  const showDownArrow = stretchHint !== 'up-only';
  const showUpArrow = stretchHint !== 'down-only';
  const showArrowGap = showDownArrow && showUpArrow;

  return (
    <div className="game-mobile-short-south-resize-wrap">
      <button
        type="button"
        ref={handleRef}
        className={[
          'game-mobile-short-south-resize-handle',
          hintClass,
          !suppressTapGlow && tapGlow ? 'game-mobile-short-south-resize-handle--tap-glow' : '',
          handleClassName,
        ]
          .filter(Boolean)
          .join(' ')}
        aria-orientation="horizontal"
        aria-label={ariaHint}
        aria-valuemin={0}
        aria-valuemax={stretchMaxPx}
        aria-valuenow={stretchPx}
        title={`${ariaHint} · Down'n'Up`}
        onPointerDownCapture={onPointerDownCapture}
        style={{
          touchAction: 'none' as const,
          ...(MOBILE_SHORT_SOUTH_RESIZE_LIFT_PX !== 0
            ? { transform: `translateY(-${MOBILE_SHORT_SOUTH_RESIZE_LIFT_PX}px)` }
            : {}),
        }}
      >
        <span
          className="game-mobile-short-south-resize-handle__capsule"
          data-capsule-variant={capsuleVariant}
          aria-hidden
        >
          <span className="game-mobile-short-south-resize-handle__label">
            {showDownArrow ? (
              <span className="game-mobile-short-south-resize-handle__arrow game-mobile-short-south-resize-handle__arrow--down">
                ↓
              </span>
            ) : null}
            {showArrowGap ? <span className="game-mobile-short-south-resize-handle__arrow-gap"> </span> : null}
            {showUpArrow ? (
              <span className="game-mobile-short-south-resize-handle__arrow game-mobile-short-south-resize-handle__arrow--up">
                ↑
              </span>
            ) : null}
            <span className="game-mobile-short-south-resize-handle__label-suffix">
              {' \u2014 '}
              Down&apos;n&apos;Up
            </span>
          </span>
        </span>
      </button>
    </div>
  );
}
