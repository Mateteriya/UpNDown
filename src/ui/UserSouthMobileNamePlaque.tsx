import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_PX } from './userSouthPanelCanon';

type UserSouthMobileNamePlaqueProps = {
  name: string;
  chatBody: string | null;
  chatKey: number;
  nameClassName: string;
  nameStyle: CSSProperties;
  title: string;
  /** Макс. ширина плашки (портрет 217, landscape ~132). */
  maxWidthPx?: number;
  /** Доп. класс (напр. --landscape). */
  plaqueClassName?: string;
  /** CSS-переменные на корне плашки (кегль landscape и т.п.). */
  styleVars?: CSSProperties;
};

const CHAT_PHASE_MS = 3800;
/** Пауза ПОСЛЕ окончания цикла (не от старта анимации). */
const REVEAL_IDLE_AFTER_MS_MIN = 12000;
const REVEAL_IDLE_AFTER_MS_MAX = 15000;

function playNameRevealIdleMs() {
  return (
    REVEAL_IDLE_AFTER_MS_MIN +
    Math.floor(Math.random() * (REVEAL_IDLE_AFTER_MS_MAX - REVEAL_IDLE_AFTER_MS_MIN + 1))
  );
}

function buildSmoothRevealKeyframes(maxPx: number): Keyframe[] {
  const max = Math.max(0, maxPx);
  const x = (-max).toFixed(2);
  const soft = 'cubic-bezier(0.33, 0.0, 0.2, 1)';
  return [
    { transform: 'translate3d(0px, 0, 0)', offset: 0, easing: soft },
    { transform: 'translate3d(0px, 0, 0)', offset: 0.05, easing: soft },
    { transform: `translate3d(${x}px, 0, 0)`, offset: 0.4, easing: soft },
    { transform: `translate3d(${x}px, 0, 0)`, offset: 0.47, easing: soft },
    { transform: 'translate3d(0px, 0, 0)', offset: 0.94, easing: soft },
    { transform: 'translate3d(0px, 0, 0)', offset: 1 },
  ];
}

/** Визуальная ширина текста (scrollWidth часто занижает condensed/ caps). */
function readNameOverflowPx(viewport: HTMLElement, text: HTMLElement): number {
  const range = document.createRange();
  range.selectNodeContents(text);
  const textW = Math.max(
    text.scrollWidth,
    text.offsetWidth,
    range.getBoundingClientRect().width,
  );
  const viewW = Math.min(viewport.clientWidth, viewport.getBoundingClientRect().width);
  return Math.max(0, Math.ceil(textW - viewW));
}

/** Сброс inline reveal-paint / landscape-chroma — иначе gradient-clip не вернётся. */
function clearRevealOpaquePaint(text: HTMLElement | null) {
  if (!text) return;
  text.style.removeProperty('color');
  text.style.removeProperty('-webkit-text-fill-color');
  text.style.removeProperty('background');
  text.style.removeProperty('background-image');
  text.style.removeProperty('background-size');
  text.style.removeProperty('background-position');
  text.style.removeProperty('-webkit-background-clip');
  text.style.removeProperty('background-clip');
  text.style.removeProperty('filter');
  text.style.removeProperty('animation');
}

/** Кабинетные стопы — для LS idle (CSS background-position в WebKit там замирает). */
const LANDSCAPE_IDLE_CHROMA = [
  '#ecfeff',
  '#67e8f9',
  '#38bdf8',
  '#a78bfa',
  '#e879f9',
  '#fbbf24',
  '#67e8f9',
  '#ecfeff',
] as const;

const LANDSCAPE_IDLE_CHROMA_MS = 3800;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function lerpLandscapeChroma(a: string, b: string, t: number): string {
  const ca = hexToRgb(a);
  const cb = hexToRgb(b);
  const u = Math.max(0, Math.min(1, t));
  return `rgb(${Math.round(ca[0] + (cb[0] - ca[0]) * u)}, ${Math.round(ca[1] + (cb[1] - ca[1]) * u)}, ${Math.round(ca[2] + (cb[2] - ca[2]) * u)})`;
}

function landscapeChromaAt(progress01: number): string {
  const n = LANDSCAPE_IDLE_CHROMA.length;
  const x = ((progress01 % 1) + 1) % 1;
  const f = x * n;
  const i = Math.floor(f) % n;
  return lerpLandscapeChroma(LANDSCAPE_IDLE_CHROMA[i], LANDSCAPE_IDLE_CHROMA[(i + 1) % n], f - Math.floor(f));
}

/** LS idle: solid color cycle (не трогает filter/transform/font — только paint). */
function applyLandscapeIdleChromaPaint(el: HTMLElement, color: string) {
  el.style.setProperty('animation', 'none', 'important');
  el.style.setProperty('background', 'none', 'important');
  el.style.setProperty('background-image', 'none', 'important');
  el.style.setProperty('-webkit-background-clip', 'border-box', 'important');
  el.style.setProperty('background-clip', 'border-box', 'important');
  el.style.setProperty('color', color, 'important');
  el.style.setProperty('-webkit-text-fill-color', color, 'important');
}

/**
 * Моб. Юг: плашка «кабинет» + clamp.
 * Авто — плавная прокрутка с паузой 12–15 с после цикла.
 * Тап по truncated — прокрутка + неон (как у оппонентов).
 */
export function UserSouthMobileNamePlaque({
  name,
  chatBody,
  chatKey,
  nameClassName,
  nameStyle,
  title,
  maxWidthPx = USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_PX,
  plaqueClassName = '',
  styleVars,
}: UserSouthMobileNamePlaqueProps) {
  const plaqueRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const animRef = useRef<Animation | null>(null);
  const revealingRef = useRef(false);
  const onRevealDoneRef = useRef<(() => void) | null>(null);
  const tapPtrRef = useRef({ x: 0, y: 0, id: -1 });
  const [phase, setPhase] = useState(0);
  const [truncated, setTruncated] = useState(false);
  const [revealing, setRevealing] = useState(false);
  /** Тап (не авто): неон-подсветка плашки. */
  const [tapChrome, setTapChrome] = useState(false);

  const showChat = !!chatBody?.trim() && phase % 2 === 1;

  useEffect(() => {
    if (!chatBody?.trim()) {
      setPhase(0);
      return;
    }
    setPhase(0);
    const id = window.setInterval(() => setPhase((p) => (p + 1) % 2), CHAT_PHASE_MS);
    return () => window.clearInterval(id);
  }, [chatBody, chatKey]);

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
    setTapChrome(false);
    clearRevealOpaquePaint(textRef.current);
    if (trackRef.current) trackRef.current.style.transform = '';
    onRevealDoneRef.current = null;
  }, []);

  const measure = useCallback(() => {
    if (showChat) {
      setTruncated(false);
      return;
    }
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) {
      setTruncated(false);
      return;
    }
    setTruncated(readNameOverflowPx(viewport, text) > 1);
  }, [showChat]);

  useLayoutEffect(() => {
    clearRevealOpaquePaint(textRef.current);
    measure();
    if (showChat) return;
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(viewport);
    ro.observe(text);
    return () => ro.disconnect();
  }, [name, showChat, maxWidthPx, measure]);

  useLayoutEffect(() => {
    if (!revealing) clearRevealOpaquePaint(textRef.current);
  }, [revealing]);

  /**
   * Landscape · только покой: перелив цветом (как plasma-экранчик).
   * CSS gradient+background-position в LS замирает; reveal/tap не трогаем —
   * при revealing/chat эффект снимается и отрабатывают существующие CSS-правила.
   */
  useEffect(() => {
    const isLandscape = plaqueClassName.includes('landscape');
    if (!isLandscape || revealing || showChat) return;
    const el = textRef.current;
    if (!el) return;
    if (
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      applyLandscapeIdleChromaPaint(el, LANDSCAPE_IDLE_CHROMA[1]);
      return () => clearRevealOpaquePaint(el);
    }

    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      applyLandscapeIdleChromaPaint(el, landscapeChromaAt((now - t0) / LANDSCAPE_IDLE_CHROMA_MS));
      raf = window.requestAnimationFrame(tick);
    };
    applyLandscapeIdleChromaPaint(el, landscapeChromaAt(0));
    raf = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(raf);
      clearRevealOpaquePaint(el);
    };
  }, [plaqueClassName, revealing, showChat, name]);

  const runReveal = useCallback(
    (opts?: { source?: 'user' | 'auto'; onDone?: () => void }) => {
      if (showChat) return;
      const fromUser = opts?.source === 'user';
      /* Тап прерывает авто и перезапускает с неоном */
      if (revealingRef.current) {
        if (!fromUser) return;
        const prev = animRef.current;
        animRef.current = null;
        if (prev) {
          try {
            prev.cancel();
          } catch {
            /* ignore */
          }
        }
        revealingRef.current = false;
        onRevealDoneRef.current = null;
      }

      const viewport = viewportRef.current;
      const text = textRef.current;
      const track = trackRef.current;
      if (!viewport || !text || !track) return;

      revealingRef.current = true;
      setRevealing(true);
      setTapChrome(fromUser);
      onRevealDoneRef.current = opts?.onDone ?? null;
      void text.offsetWidth;

      const maxScroll = readNameOverflowPx(viewport, text);
      const finish = () => {
        if (trackRef.current) trackRef.current.style.transform = '';
        animRef.current = null;
        revealingRef.current = false;
        setRevealing(false);
        setTapChrome(false);
        clearRevealOpaquePaint(textRef.current);
        const done = onRevealDoneRef.current;
        onRevealDoneRef.current = null;
        done?.();
      };

      if (maxScroll < 2) {
        if (fromUser) {
          window.setTimeout(finish, 420);
          return;
        }
        finish();
        return;
      }

      track.style.transform = '';

      const reduce =
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduce) {
        track.style.transform = `translate3d(${-maxScroll}px, 0, 0)`;
        window.setTimeout(finish, 900);
        return;
      }

      const durationMs = fromUser
        ? Math.max(4200, Math.min(7200, Math.round(maxScroll * 95)))
        : Math.max(14000, Math.min(22000, Math.round(maxScroll * 240)));
      const anim = track.animate(buildSmoothRevealKeyframes(maxScroll), {
        duration: durationMs,
        easing: 'linear',
        fill: 'none',
      });
      animRef.current = anim;
      anim.onfinish = finish;
    },
    [showChat],
  );

  useEffect(() => {
    if (showChat || !truncated) {
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
      if (revealingRef.current) {
        schedule(400, tick);
        return;
      }
      runReveal({
        source: 'auto',
        onDone: () => {
          if (!cancelled) schedule(playNameRevealIdleMs(), tick);
        },
      });
    };

    /* Первый цикл чуть позже монтирования; дальше — пауза 12–15 с после КАЖДОГО конца */
    schedule(4000 + Math.floor(Math.random() * 2000), tick);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      cancelReveal();
    };
  }, [showChat, truncated, name, runReveal, cancelReveal]);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent) => {
      if (!truncated || showChat) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      tapPtrRef.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
    },
    [truncated, showChat],
  );

  const onPointerUp = useCallback(
    (e: ReactPointerEvent) => {
      if (!truncated || showChat) return;
      const start = tapPtrRef.current;
      if (start.id !== e.pointerId) return;
      tapPtrRef.current = { x: 0, y: 0, id: -1 };
      if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 14) return;
      e.stopPropagation();
      runReveal({ source: 'user' });
    },
    [truncated, showChat, runReveal],
  );

  const plaqueClass = [
    'user-south-mobile-name-plaque',
    'user-south-mobile-name-plaque--clamped',
    plaqueClassName,
    truncated && !showChat ? 'user-south-mobile-name-plaque--truncated' : '',
    revealing ? 'user-south-mobile-name-plaque--revealing' : '',
    tapChrome ? 'user-south-mobile-name-plaque--tap-chrome' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const textClass = [
    nameClassName,
    'user-south-mobile-name-text',
    plaqueClassName.includes('landscape') ? 'user-south-mobile-name-text--landscape' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const chatTypography: CSSProperties = {
    fontSize: nameStyle.fontSize,
    fontWeight: nameStyle.fontWeight,
    fontFamily: nameStyle.fontFamily,
    color: nameStyle.color,
    lineHeight: nameStyle.lineHeight ?? 1.25,
  };

  return (
    <div
      ref={plaqueRef}
      className={plaqueClass}
      style={{
        maxWidth: `min(${maxWidthPx}px, 100%)`,
        ...styleVars,
      }}
      title={title}
      role={truncated && !showChat ? 'button' : undefined}
      tabIndex={truncated && !showChat ? 0 : undefined}
      onPointerDown={truncated && !showChat ? onPointerDown : undefined}
      onPointerUp={truncated && !showChat ? onPointerUp : undefined}
      onKeyDown={
        truncated && !showChat
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                runReveal({ source: 'user' });
              }
            }
          : undefined
      }
    >
      <span className="user-south-mobile-name-viewport" ref={viewportRef}>
        <span className="user-south-mobile-name-track" ref={trackRef}>
          {showChat && chatBody ? (
            <span
              className="mobile-south-name-chat-marquee"
              style={chatTypography}
              key={`${chatKey}-${chatBody.slice(0, 24)}`}
            >
              <span className="mobile-south-name-chat-marquee__track">
                <span className="mobile-south-name-chat-marquee__text">{chatBody}</span>
                <span className="mobile-south-name-chat-marquee__gap" aria-hidden>
                  {' · '}
                </span>
                <span className="mobile-south-name-chat-marquee__text">{chatBody}</span>
              </span>
            </span>
          ) : (
            <span ref={textRef} className={textClass} style={nameStyle}>
              {name}
            </span>
          )}
        </span>
      </span>
      {truncated && !showChat ? (
        <span className="user-south-mobile-name-trunc-chrome" aria-hidden="true">
          <span className="user-south-mobile-name-trunc-fade" />
        </span>
      ) : null}
    </div>
  );
}
