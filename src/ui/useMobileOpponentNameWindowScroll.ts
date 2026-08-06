import type { KeyboardEvent as ReactKeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const OPPONENT_NAME_WINDOW_SCROLL_HINT =
  'Тап: неон и плавный просмотр туда-обратно. Без тапа: раз в 15–30 с плавно показать конец имени и вернуться (без неона).';

const OPP_NAME_REVEAL_AUTO_IDLE_AFTER_USER_MS = 14000;

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

type UseMobileOpponentNameWindowScrollOpts = {
  enabled: boolean;
  /** По длине имени — всегда «окошко» и тап, даже если текст ещё помещается */
  forceScrollable?: boolean;
  /** Горизонтальное окошко (по умолчанию) или вертикальный столбик букв (mid З/В) */
  axis?: 'x' | 'y';
  remeasureKey?: string | number;
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
  const [measuredScrollable, setMeasuredScrollable] = useState(false);
  const scrollable = forceScrollable || measuredScrollable;

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
  }, [scrollable]);

  useEffect(() => {
    return () => {
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
      if (revealTrackRef.current) revealTrackRef.current.style.transform = '';
      nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-compositing');
      nameWindowRef.current?.classList.remove('opponent-slot-header-name-window--reveal-tap-chrome');
    };
  }, []);

  const runRevealScroll = useCallback(
    (opts?: { source?: 'user' | 'auto' }) => {
      const source = opts?.source ?? 'user';
      if (!enabled || !scrollable) return;
      if (revealAnimatingRef.current) return;
      const box = nameWindowRef.current;
      if (!box) return;
      const max =
        axis === 'y'
          ? Math.max(0, box.scrollHeight - box.clientHeight, box.scrollWidth - box.clientWidth)
          : Math.max(0, box.scrollWidth - box.clientWidth);
      if (max < 2) return;

      if (source === 'user') {
        lastUserRevealStartRef.current = Date.now();
      }

      const reduce =
        typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        const track = revealTrackRef.current;
        const mx = Math.round(max);
        if (track) {
          if (source === 'user') {
            nameWindowRef.current?.classList.add(
              'opponent-slot-header-name-window--reveal-compositing',
              'opponent-slot-header-name-window--reveal-tap-chrome',
            );
            track.style.transform = revealTranslate(axis, mx);
            window.requestAnimationFrame(() => {
              if (revealTrackRef.current) revealTrackRef.current.style.transform = revealTranslate(axis, 0);
              window.setTimeout(() => {
                nameWindowRef.current?.classList.remove(
                  'opponent-slot-header-name-window--reveal-compositing',
                  'opponent-slot-header-name-window--reveal-tap-chrome',
                );
              }, 400);
            });
          } else {
            track.style.transform = revealTranslate(axis, mx);
            window.requestAnimationFrame(() => {
              if (revealTrackRef.current) revealTrackRef.current.style.transform = revealTranslate(axis, 0);
            });
          }
        }
        return;
      }

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
        revealAnimatingRef.current = true;
        outerWin?.classList.add('opponent-slot-header-name-window--reveal-compositing');
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
      const durationOutMs = 1400;
      const durationInMs = 1400;
      const maxScroll = Math.round(max);
      const easeSeg = 'cubic-bezier(0.42, 0, 0.58, 1)';

      if (canWebAnim && track) {
        revealAnimatingRef.current = true;
        outerWin?.classList.add('opponent-slot-header-name-window--reveal-compositing');
        if (source === 'user') {
          outerWin?.classList.add('opponent-slot-header-name-window--reveal-tap-chrome');
        }
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

      revealAnimatingRef.current = true;
      nameWindowRef.current?.classList.add('opponent-slot-header-name-window--reveal-compositing');
      if (source === 'user') {
        nameWindowRef.current?.classList.add('opponent-slot-header-name-window--reveal-tap-chrome');
      }
      t0 = performance.now();
      revealAnimRafRef.current = window.requestAnimationFrame(tick) as unknown as number;
    },
    [enabled, scrollable, axis],
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
      if (revealAnimatingRef.current) {
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

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    tapPointerStartRef.current = { x: e.clientX, y: e.clientY };
  }, []);

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const { x, y } = tapPointerStartRef.current;
      if (Math.hypot(e.clientX - x, e.clientY - y) > 14) return;
      runRevealScroll({ source: 'user' });
    },
    [runRevealScroll],
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
    onPointerUp,
    onKeyDown,
  };
}
