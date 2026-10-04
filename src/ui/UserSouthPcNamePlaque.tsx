import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

type UserSouthPcNamePlaqueProps = {
  name: string;
  isBiddingPhase: boolean;
  longCompact: boolean;
  textClassName: string;
  textStyle?: CSSProperties;
};

/** Интервал автопрокрутки длинного имени в розыгрыше (как у оппонентов на мобилке). */
function playNameRevealIntervalMs() {
  return 9000 + Math.floor(Math.random() * 2001);
}

/** Плавный ход туда-обратно: мягкий ease + лёгкая пауза на концах. */
function buildSmoothRevealKeyframes(maxPx: number): Keyframe[] {
  const max = Math.max(0, maxPx);
  const x = (-max).toFixed(2);
  /* Мягче material: долгий разгон/торможение */
  const soft = 'cubic-bezier(0.33, 0.0, 0.2, 1)';
  return [
    { transform: 'translate3d(0px, 0, 0)', offset: 0, easing: soft },
    { transform: 'translate3d(0px, 0, 0)', offset: 0.06, easing: soft },
    { transform: `translate3d(${x}px, 0, 0)`, offset: 0.44, easing: soft },
    { transform: `translate3d(${x}px, 0, 0)`, offset: 0.56, easing: soft },
    { transform: 'translate3d(0px, 0, 0)', offset: 0.94, easing: soft },
    { transform: 'translate3d(0px, 0, 0)', offset: 1 },
  ];
}

/** Плашка имени Юг (ПК / планшет): clamp в розыгрыше, fade+…, автопрокрутка при переполнении. */
export function UserSouthPcNamePlaque({
  name,
  isBiddingPhase,
  longCompact,
  textClassName,
  textStyle,
}: UserSouthPcNamePlaqueProps) {
  const viewportRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const revealingRef = useRef(false);
  const hoveringRef = useRef(false);
  const [truncated, setTruncated] = useState(false);
  const [revealing, setRevealing] = useState(false);

  const cancelReveal = useCallback(() => {
    const anim = animRef.current;
    animRef.current = null;
    if (anim) {
      try {
        anim.cancel();
      } catch {
        /* ignore */
      }
    }
    revealingRef.current = false;
    setRevealing(false);
    if (trackRef.current) trackRef.current.style.transform = '';
  }, []);

  const measure = useCallback(() => {
    if (isBiddingPhase || hoveringRef.current) {
      setTruncated(false);
      return;
    }
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) {
      setTruncated(false);
      return;
    }
    setTruncated(text.scrollWidth > viewport.clientWidth + 1);
  }, [isBiddingPhase]);

  useLayoutEffect(() => {
    measure();
    if (isBiddingPhase) return;
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    ro.observe(text);
    return () => ro.disconnect();
  }, [name, isBiddingPhase, longCompact, measure]);

  const runReveal = useCallback(() => {
    if (isBiddingPhase || hoveringRef.current || revealingRef.current) return;
    const viewport = viewportRef.current;
    const text = textRef.current;
    const track = trackRef.current;
    if (!viewport || !text || !track) return;
    const maxScroll = text.scrollWidth - viewport.clientWidth;
    if (maxScroll < 2) return;

    cancelReveal();
    track.style.transform = '';

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      track.style.transform = `translate3d(${-Math.round(maxScroll)}px, 0, 0)`;
      window.setTimeout(() => {
        if (trackRef.current) trackRef.current.style.transform = '';
      }, 700);
      return;
    }

    const durationMs = Math.max(7000, Math.min(11000, Math.round(maxScroll * 110)));
    revealingRef.current = true;
    setRevealing(true);
    const anim = track.animate(buildSmoothRevealKeyframes(maxScroll), {
      duration: durationMs,
      easing: 'linear',
      fill: 'none',
    });
    animRef.current = anim;
    anim.onfinish = () => {
      if (trackRef.current) trackRef.current.style.transform = '';
      animRef.current = null;
      revealingRef.current = false;
      setRevealing(false);
    };
  }, [cancelReveal, isBiddingPhase]);

  useEffect(() => {
    if (isBiddingPhase || !truncated) {
      cancelReveal();
      return;
    }
    let cancelled = false;
    let timeoutId: number | undefined;

    const schedule = (ms: number, then: () => void) => {
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(() => {
        timeoutId = undefined;
        if (!cancelled) then();
      }, ms) as unknown as number;
    };

    const tick = () => {
      if (cancelled) return;
      if (hoveringRef.current || revealingRef.current) {
        schedule(600 + Math.floor(Math.random() * 400), tick);
        return;
      }
      runReveal();
      schedule(playNameRevealIntervalMs(), tick);
    };

    schedule(1800 + Math.floor(Math.random() * 1200), tick);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      cancelReveal();
    };
  }, [isBiddingPhase, truncated, name, runReveal, cancelReveal]);

  const onEnter = () => {
    hoveringRef.current = true;
    cancelReveal();
    setTruncated(false);
  };

  const onLeave = () => {
    hoveringRef.current = false;
    // remount measure after hover layout settles
    window.requestAnimationFrame(() => measure());
  };

  const plaqueClass = [
    'user-player-panel-pc-name-under-avatar',
    longCompact ? 'user-player-panel-pc-name-under-avatar--long-compact' : '',
    !isBiddingPhase ? 'user-player-panel-pc-name-under-avatar--play-plaque' : '',
    truncated ? 'user-player-panel-pc-name-under-avatar--play-truncated' : '',
    revealing ? 'user-player-panel-pc-name-under-avatar--play-revealing' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const textClass = [
    textClassName,
    'user-player-panel-pc-name-text',
    longCompact ? 'user-player-panel-pc-name-text--long-compact' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={plaqueClass}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      title={truncated ? name : undefined}
    >
      <span className="user-player-panel-pc-name-viewport" ref={viewportRef}>
        <span className="user-player-panel-pc-name-track" ref={trackRef}>
          <span ref={textRef} className={textClass} style={textStyle}>
            {name}
          </span>
        </span>
      </span>
      {truncated ? (
        <span className="user-player-panel-pc-name-trunc-chrome" aria-hidden="true">
          <span className="user-player-panel-pc-name-trunc-fade" />
        </span>
      ) : null}
    </div>
  );
}
