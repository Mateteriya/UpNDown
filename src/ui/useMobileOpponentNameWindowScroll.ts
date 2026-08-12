import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const OPPONENT_NAME_WINDOW_SCROLL_HINT =
  'Тап: неон и плавный просмотр туда-обратно. Пальцем: прокрутить длинное имя (через 3 с покоя — снова с первой буквы). Без тапа: раз в 15–30 с плавно показать конец имени и вернуться (без неона).';

const OPP_NAME_REVEAL_AUTO_IDLE_AFTER_USER_MS = 14000;
const OPP_NAME_DRAG_THRESHOLD_PX = 8;
/** После ручной прокрутки: столько мс без жеста — вернуть имя к первой букве */
const OPP_NAME_MANUAL_IDLE_SNAP_BACK_MS = 3000;
const OPP_NAME_MANUAL_SNAP_BACK_DURATION_MS = 480;

function oppNameRevealAutoIntervalMs() {
  return 15000 + Math.floor(Math.random() * 15001);
}

function revealTranslate(axis: 'x' | 'y', px: number): string {
  const v = Math.round(px);
  return axis === 'y' ? `translate3d(0,${-v}px,0)` : `translate3d(${-v}px,0,0)`;
}

function buildOppNameRevealSinTranslateKeyframes(maxPx: number, axis: 'x' | 'y', steps = 100): Keyframe[] {
  const m = Math.round(maxPx);
  const frames: Keyframe[] = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const d = Math.round(m * Math.sin(Math.PI * u));
    frames.push({ transform: revealTranslate(axis, d) });
  }
  return frames;
}

function readOverflowMax(el: HTMLElement, axis: 'x' | 'y'): number {
  if (axis === 'y') {
    return Math.max(0, el.scrollHeight - el.clientHeight, el.scrollWidth - el.clientWidth);
  }
  return Math.max(0, el.scrollWidth - el.clientWidth);
}

type UseMobileOpponentNameWindowScrollOpts = {
  enabled: boolean;
  /** По длине имени — всегда «окошко» и тап, даже если текст ещё помещается */
  forceScrollable?: boolean;
  /** Горизонтальное окошко (по умолчанию) или вертикальный столбик букв (mid З/В) */
  axis?: 'x' | 'y';
  remeasureKey?: string | number;
};

type DragState = {
  pointerId: number;
  startClient: number;
  startOffset: number;
  moved: boolean;
};

export function useMobileOpponentNameWindowScroll({
  enabled,
  forceScrollable = false,
  axis = 'x',
  remeasureKey,
}: UseMobileOpponentNameWindowScrollOpts) {
  const nameWindowRef = useRef<HTMLDivElement | null>(null);
  const revealTrackRef = useRef<HTMLDivElement | null>(null);
  const tapPointerStartRef = useRef({ x: 0, y: 0 });
  const revealAnimRafRef = useRef<number | null>(null);
  const revealWaRef = useRef<Animation | null>(null);
  const revealAnimatingRef = useRef(false);
  const lastUserRevealStartRef = useRef<number | null>(null);
  const manualOffsetRef = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  const manualIdleSnapTimerRef = useRef<number | null>(null);
  const manualSnapRafRef = useRef<number | null>(null);
  const [measuredScrollable, setMeasuredScrollable] = useState(false);
  const scrollable = forceScrollable || measuredScrollable;

  const applyManualOffset = useCallback(
    (px: number) => {
      const box = nameWindowRef.current;
      const max = box ? readOverflowMax(box, axis) : 0;
      const next = Math.max(0, Math.min(max, Math.round(px)));
      manualOffsetRef.current = next;
      const track = revealTrackRef.current;
      if (track) {
        track.style.transform = next > 0 ? revealTranslate(axis, next) : '';
      } else if (box) {
        if (axis === 'y') box.scrollTop = next;
        else box.scrollLeft = next;
      }
    },
    [axis],
  );

  const clearManualOffset = useCallback(() => {
    manualOffsetRef.current = 0;
    const track = revealTrackRef.current;
    const box = nameWindowRef.current;
    if (track && !revealAnimatingRef.current) track.style.transform = '';
    if (box) {
      box.scrollLeft = 0;
      box.scrollTop = 0;
    }
  }, []);

  const clearManualIdleSnapTimer = useCallback(() => {
    if (manualIdleSnapTimerRef.current != null) {
      window.clearTimeout(manualIdleSnapTimerRef.current);
      manualIdleSnapTimerRef.current = null;
    }
  }, []);

  const cancelManualSnapAnimation = useCallback(() => {
    if (manualSnapRafRef.current != null) {
      window.cancelAnimationFrame(manualSnapRafRef.current);
      manualSnapRafRef.current = null;
    }
  }, []);

  const animateManualOffsetToStart = useCallback(() => {
    cancelManualSnapAnimation();
    const start = manualOffsetRef.current;
    if (start <= 0) {
      clearManualOffset();
      return;
    }
    const reduce =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      clearManualOffset();
      lastUserRevealStartRef.current = Date.now();
      return;
    }
    const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
    const t0 = performance.now();
    const tick = (now: number) => {
      if (dragRef.current) {
        manualSnapRafRef.current = null;
        return;
      }
      const u = Math.min(1, (now - t0) / OPP_NAME_MANUAL_SNAP_BACK_DURATION_MS);
      applyManualOffset(start * (1 - easeInOut(u)));
      if (u >= 1) {
        clearManualOffset();
        lastUserRevealStartRef.current = Date.now();
        manualSnapRafRef.current = null;
        return;
      }
      manualSnapRafRef.current = window.requestAnimationFrame(tick) as unknown as number;
    };
    manualSnapRafRef.current = window.requestAnimationFrame(tick) as unknown as number;
  }, [applyManualOffset, cancelManualSnapAnimation, clearManualOffset]);

  const scheduleManualIdleSnapBack = useCallback(() => {
    clearManualIdleSnapTimer();
    if (manualOffsetRef.current <= 0) return;
    manualIdleSnapTimerRef.current = window.setTimeout(() => {
      manualIdleSnapTimerRef.current = null;
      if (dragRef.current || revealAnimatingRef.current) return;
      if (manualOffsetRef.current <= 0) return;
      animateManualOffsetToStart();
    }, OPP_NAME_MANUAL_IDLE_SNAP_BACK_MS) as unknown as number;
  }, [animateManualOffsetToStart, clearManualIdleSnapTimer]);

  useLayoutEffect(() => {
    if (!enabled) {
      setMeasuredScrollable(false);
      return;
    }
    const el = nameWindowRef.current;
    if (!el) {
      setMeasuredScrollable(false);
      return;
    }
    const measure = () => {
      if (revealAnimatingRef.current) return;
      /* vertical-rl + upright: overflow может лечь на height или width — берём оба */
      const dy = el.scrollHeight - el.clientHeight;
      const dx = el.scrollWidth - el.clientWidth;
      const overflow = axis === 'y' ? dy > 1 || dx > 1 : dx > 1;
      setMeasuredScrollable(overflow);
    };
    measure();
    const ro =
      typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => window.requestAnimationFrame(measure)) : null;
    ro?.observe(el);
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [enabled, remeasureKey, axis]);

  useEffect(() => {
    if (!scrollable) {
      revealAnimatingRef.current = false;
      lastUserRevealStartRef.current = null;
      dragRef.current = null;
      manualOffsetRef.current = 0;
      clearManualIdleSnapTimer();
      cancelManualSnapAnimation();
      if (revealAnimRafRef.current != null) {
        window.cancelAnimationFrame(revealAnimRafRef.current);
        revealAnimRafRef.current = null;
      }
      if (revealWaRef.current) {
        revealWaRef.current.onfinish = null;
        try {
          revealWaRef.current.cancel();
        } catch {
          /* ignore */
        }
        revealWaRef.current = null;
      }
      if (revealTrackRef.current) revealTrackRef.current.style.transform = '';
      nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-compositing');
      nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
    }
  }, [scrollable, clearManualIdleSnapTimer, cancelManualSnapAnimation]);

  useEffect(() => {
    return () => {
      clearManualIdleSnapTimer();
      cancelManualSnapAnimation();
      if (revealAnimRafRef.current != null) {
        window.cancelAnimationFrame(revealAnimRafRef.current);
        revealAnimRafRef.current = null;
      }
      if (revealWaRef.current) {
        revealWaRef.current.onfinish = null;
        try {
          revealWaRef.current.cancel();
        } catch {
          /* ignore */
        }
        revealWaRef.current = null;
      }
      revealAnimatingRef.current = false;
      dragRef.current = null;
      if (revealTrackRef.current) revealTrackRef.current.style.transform = '';
      nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-compositing');
      nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
    };
  }, [clearManualIdleSnapTimer, cancelManualSnapAnimation]);

  const cancelRevealAnimation = useCallback(() => {
    if (revealAnimRafRef.current != null) {
      window.cancelAnimationFrame(revealAnimRafRef.current);
      revealAnimRafRef.current = null;
    }
    const wa = revealWaRef.current;
    revealWaRef.current = null;
    if (wa) {
      wa.onfinish = null;
      try {
        wa.cancel();
      } catch {
        /* ignore */
      }
    }
    revealAnimatingRef.current = false;
    nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-compositing');
    nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
  }, []);

  const runRevealScroll = useCallback(
    (opts?: { source?: 'user' | 'auto' }) => {
      const source = opts?.source ?? 'user';
      if (!enabled || !scrollable) return;
      if (revealAnimatingRef.current) return;
      const box = nameWindowRef.current;
      if (!box) return;

      /* Статика (короткая плашка З/В): есть ли что прокручивать до раскрытия */
      const maxStatic = readOverflowMax(box, axis);
      if (maxStatic < 2) return;

      if (source === 'user') {
        lastUserRevealStartRef.current = Date.now();
      }

      clearManualIdleSnapTimer();
      cancelManualSnapAnimation();
      clearManualOffset();
      cancelRevealAnimation();

      /*
       * Тап: сначала --reveal-tap-chrome (CSS удлиняет плашку З/В), потом меряем overflow,
       * иначе анимация считает длинный ход по короткому окну и «проскакивает» после роста.
       */
      revealAnimatingRef.current = true;
      box.classList.add('opponent-slot-header-name-window--reveal-compositing');
      if (source === 'user') {
        box.classList.add('opponent-slot-header-name-window--reveal-tap-chrome');
        void box.offsetHeight;
      }
      const max = source === 'user' ? Math.max(0, readOverflowMax(box, axis)) : maxStatic;
      if (max < 2 && source === 'user') {
        /* Имя влезло в удлинённое окно — только вспышка неона, без скролла */
        window.setTimeout(() => {
          revealAnimatingRef.current = false;
          const outer = nameWindowRef.current;
          if (outer) {
            outer.classList.remove('opponent-slot-header-name-window--reveal-compositing');
            outer.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
          }
        }, 420);
        return;
      }
      if (max < 2) {
        revealAnimatingRef.current = false;
        box.classList.remove('opponent-slot-header-name-window--reveal-compositing');
        box.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
        return;
      }

      const reduce =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        const track = revealTrackRef.current;
        const mx = Math.round(max);
        if (track) {
          track.style.transform = revealTranslate(axis, mx);
          window.requestAnimationFrame(() => {
            if (revealTrackRef.current) revealTrackRef.current.style.transform = revealTranslate(axis, 0);
            window.setTimeout(() => {
              revealAnimatingRef.current = false;
              nameWindowRef.current?.classList.remove(
                'opponent-slot-header-name-window--reveal-compositing',
                'opponent-slot-header-name-window--reveal-tap-chrome',
              );
            }, 400);
          });
        } else {
          revealAnimatingRef.current = false;
          box.classList.remove('opponent-slot-header-name-window--reveal-compositing');
          box.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
        }
        return;
      }

      const applyRevealOffsetPx = (px: number) => {
        const track = revealTrackRef.current;
        const outer = nameWindowRef.current;
        const d = Math.round(Math.max(0, px));
        if (track) {
          track.style.transform = revealTranslate(axis, d);
        } else if (outer) {
          if (axis === 'y') outer.scrollTop = d;
          else outer.scrollLeft = d;
        }
      };

      const finish = () => {
        if (revealAnimRafRef.current != null) {
          window.cancelAnimationFrame(revealAnimRafRef.current);
          revealAnimRafRef.current = null;
        }
        const wa = revealWaRef.current;
        revealWaRef.current = null;
        if (wa) {
          wa.onfinish = null;
          try {
            wa.cancel();
          } catch {
            /* ignore */
          }
        }
        revealAnimatingRef.current = false;
        manualOffsetRef.current = 0;
        const outer = nameWindowRef.current;
        const track = revealTrackRef.current;
        if (track) track.style.transform = '';
        if (outer) {
          outer.scrollLeft = 0;
          outer.scrollTop = 0;
          outer.classList.remove('opponent-slot-header-name-window--reveal-compositing');
          outer.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
        }
      };

      const track = revealTrackRef.current;
      const outerWin = nameWindowRef.current;
      const canWebAnim = Boolean(track && typeof track.animate === 'function');

      if (source === 'auto') {
        const durationAutoBumpMs = 3600;
        const maxScroll = Math.round(max);
        if (canWebAnim && track) {
          const anim = track.animate(buildOppNameRevealSinTranslateKeyframes(maxScroll, axis), {
            duration: durationAutoBumpMs,
            easing: 'linear',
            fill: 'forwards',
          });
          revealWaRef.current = anim;
          anim.onfinish = () => finish();
          return;
        }
        let t0Auto = performance.now();
        const tickAuto = (now: number) => {
          if (!nameWindowRef.current) {
            finish();
            return;
          }
          const u = Math.min(1, (now - t0Auto) / durationAutoBumpMs);
          applyRevealOffsetPx(maxScroll * Math.sin(Math.PI * u));
          if (u >= 1) {
            finish();
            return;
          }
          revealAnimRafRef.current = window.requestAnimationFrame(tickAuto) as unknown as number;
        };
        t0Auto = performance.now();
        revealAnimRafRef.current = window.requestAnimationFrame(tickAuto) as unknown as number;
        return;
      }

      const easeInOut = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * Math.min(1, Math.max(0, t)));
      const durationOutMs = 2100;
      const durationInMs = 2100;
      const maxScroll = Math.round(max);
      const easeSeg = 'cubic-bezier(0.42, 0, 0.58, 1)';

      if (canWebAnim && track) {
        const anim = track.animate(
          [
            { transform: revealTranslate(axis, 0), offset: 0, easing: easeSeg },
            { transform: revealTranslate(axis, maxScroll), offset: 0.5, easing: easeSeg },
            { transform: revealTranslate(axis, 0), offset: 1 },
          ],
          { duration: durationOutMs + durationInMs, fill: 'forwards' },
        );
        revealWaRef.current = anim;
        anim.onfinish = () => finish();
        return;
      }

      let phase: 'out' | 'in' = 'out';
      let t0 = performance.now();

      const tick = (now: number) => {
        if (!nameWindowRef.current) {
          finish();
          return;
        }
        if (phase === 'out') {
          const u = Math.min(1, (now - t0) / durationOutMs);
          applyRevealOffsetPx(maxScroll * easeInOut(u));
          if (u >= 1) {
            phase = 'in';
            t0 = now;
          }
        } else {
          const u = Math.min(1, (now - t0) / durationInMs);
          applyRevealOffsetPx(maxScroll * (1 - easeInOut(u)));
          if (u >= 1) {
            finish();
            return;
          }
        }
        revealAnimRafRef.current = window.requestAnimationFrame(tick) as unknown as number;
      };

      t0 = performance.now();
      revealAnimRafRef.current = window.requestAnimationFrame(tick) as unknown as number;
    },
    [enabled, scrollable, axis, clearManualOffset, clearManualIdleSnapTimer, cancelManualSnapAnimation, cancelRevealAnimation],
  );

  useEffect(() => {
    if (!enabled || !scrollable) return;
    if (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    let cancelled = false;
    let timeoutId: number | undefined;

    const scheduleWait = (ms: number, then: () => void) => {
      if (cancelled) return;
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
        timeoutId = undefined;
      }
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        if (!cancelled) then();
      }, ms) as unknown as number;
    };

    const tryAutoReveal = () => {
      if (cancelled) return;
      if (revealAnimatingRef.current || dragRef.current) {
        scheduleWait(500 + Math.floor(Math.random() * 400), tryAutoReveal);
        return;
      }
      if (manualOffsetRef.current > 0 || manualIdleSnapTimerRef.current != null || manualSnapRafRef.current != null) {
        scheduleWait(500 + Math.floor(Math.random() * 400), tryAutoReveal);
        return;
      }
      const last = lastUserRevealStartRef.current;
      if (last != null && Date.now() - last < OPP_NAME_REVEAL_AUTO_IDLE_AFTER_USER_MS) {
        scheduleWait(400 + Math.floor(Math.random() * 350), tryAutoReveal);
        return;
      }
      runRevealScroll({ source: 'auto' });
      scheduleWait(oppNameRevealAutoIntervalMs(), tryAutoReveal);
    };

    scheduleWait(oppNameRevealAutoIntervalMs(), tryAutoReveal);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
    };
  }, [enabled, scrollable, remeasureKey, runRevealScroll]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!enabled || !scrollable) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      clearManualIdleSnapTimer();
      cancelManualSnapAnimation();
      tapPointerStartRef.current = { x: e.clientX, y: e.clientY };
      const startClient = axis === 'y' ? e.clientY : e.clientX;
      dragRef.current = {
        pointerId: e.pointerId,
        startClient,
        startOffset: manualOffsetRef.current,
        moved: false,
      };
      /* Capture сразу — иначе на мобилке UA забирает жест до порога drag */
      try {
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
    },
    [enabled, scrollable, axis, clearManualIdleSnapTimer, cancelManualSnapAnimation],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      if (!enabled || !scrollable) return;
      const client = axis === 'y' ? e.clientY : e.clientX;
      const delta = drag.startClient - client;
      if (!drag.moved) {
        if (Math.abs(delta) < OPP_NAME_DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        cancelRevealAnimation();
      }
      e.preventDefault();
      applyManualOffset(drag.startOffset + delta);
    },
    [enabled, scrollable, axis, applyManualOffset, cancelRevealAnimation],
  );

  const endDrag = useCallback(
    (e: ReactPointerEvent, opts?: { asCancel?: boolean }) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== e.pointerId) return;
      dragRef.current = null;
      try {
        if ((e.currentTarget as HTMLElement).hasPointerCapture?.(e.pointerId)) {
          (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
        }
      } catch {
        /* ignore */
      }
      if (drag.moved) {
        lastUserRevealStartRef.current = Date.now();
        scheduleManualIdleSnapBack();
        return;
      }
      if (opts?.asCancel) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const { x, y } = tapPointerStartRef.current;
      if (Math.hypot(e.clientX - x, e.clientY - y) > 14) return;
      runRevealScroll({ source: 'user' });
    },
    [runRevealScroll, scheduleManualIdleSnapBack],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      endDrag(e);
    },
    [endDrag],
  );

  const onPointerCancel = useCallback(
    (e: ReactPointerEvent) => {
      endDrag(e, { asCancel: true });
    },
    [endDrag],
  );

  const onKeyDown = useCallback(
    (e: ReactKeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      runRevealScroll({ source: 'user' });
    },
    [runRevealScroll],
  );

  return {
    nameWindowRef,
    revealTrackRef,
    scrollable,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    onKeyDown,
  };
}
