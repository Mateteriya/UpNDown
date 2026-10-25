import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { MAX_DISPLAY_NAME_LENGTH } from './NameAvatarModal';
import { MenuCapsuleCosmicTip } from './MenuCapsuleCosmicTip';

type UserSouthPcNamePlaqueProps = {
  name: string;
  isBiddingPhase: boolean;
  longCompact: boolean;
  textClassName: string;
  textStyle?: CSSProperties;
  /** Планшетный шелл — чуть меньший полный кегль */
  isTabletShell?: boolean;
  /** Сохранение имени в профиль (как в меню аватара). */
  onSaveDisplayName?: (displayName: string) => void;
};

/** Микро целиком видно → затем укрупнение. */
const FIT_HOLD_MS_MIN = 3000;
const FIT_HOLD_MS_MAX = 5000;
/** Полный кегль (+ медленный scroll) → снова микро; запас под одну длинную прокрутку. */
const FULL_HOLD_MS_MIN = 24000;
const FULL_HOLD_MS_MAX = 34000;
const FIT_MIN_PX = 6;

function randomHoldMs(min: number, max: number) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

type NameGlyph = { type: 'ch'; ch: string; key: string } | { type: 'sp'; key: string };

/** Буквы + узкие межсловные спейсеры (обычный пробел в upright даёт дыру на целый кегль). */
function splitNameGlyphs(raw: string): NameGlyph[] {
  const chars = [...raw];
  const out: NameGlyph[] = [];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    if (c === ' ' || c === '\u00a0' || c === '\t') {
      if (out.length > 0 && out[out.length - 1]!.type === 'sp') continue;
      out.push({ type: 'sp', key: `sp-${i}` });
      continue;
    }
    out.push({ type: 'ch', ch: c, key: `ch-${i}-${c}` });
  }
  return out;
}

type PopPlace = {
  top: number;
  left: number;
  origin: string;
};

function placeNamePopover(anchor: HTMLElement, pop: HTMLElement | null): PopPlace {
  const r = anchor.getBoundingClientRect();
  const pad = 10;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const pw = pop?.offsetWidth || 280;
  const ph = pop?.offsetHeight || 220;
  const gap = 10;

  const spaceBelow = vh - r.bottom - pad;
  const spaceAbove = r.top - pad;
  const preferAbove = spaceBelow < ph + gap && spaceAbove > spaceBelow;

  let top = preferAbove ? r.top - gap - ph : r.bottom + gap;
  top = Math.min(Math.max(top, pad), Math.max(pad, vh - pad - ph));

  /* Рельс слева у аватара — открываем вправо от плашки */
  let left = r.right + gap;
  if (left + pw > vw - pad) left = r.left - gap - pw;
  if (left < pad) left = pad;
  if (left + pw > vw - pad) left = Math.max(pad, vw - pad - pw);

  const originX = left + pw / 2 < r.left + r.width / 2 ? 'right' : 'left';
  const originY = preferAbove ? 'bottom' : 'top';
  return { top, left, origin: `${originY} ${originX}` };
}

/** Пауза между проходами автопрокрутки (×~2.5 к прежним 9–11 с). */
function playNameRevealIntervalMs() {
  return 22000 + Math.floor(Math.random() * 6001);
}

function fullNameSizePx(longCompact: boolean, isTabletShell: boolean): number {
  if (longCompact) return isTabletShell ? 10 : 11;
  return isTabletShell ? 12 : 13;
}

/** Плавный ход туда-обратно по вертикали: мягкий ease + пауза на концах. */
function buildSmoothRevealKeyframes(maxPx: number): Keyframe[] {
  const max = Math.max(0, maxPx);
  const y = (-max).toFixed(2);
  const soft = 'cubic-bezier(0.33, 0.0, 0.2, 1)';
  return [
    { transform: 'translate3d(0, 0px, 0)', offset: 0, easing: soft },
    { transform: 'translate3d(0, 0px, 0)', offset: 0.06, easing: soft },
    { transform: `translate3d(0, ${y}px, 0)`, offset: 0.44, easing: soft },
    { transform: `translate3d(0, ${y}px, 0)`, offset: 0.56, easing: soft },
    { transform: 'translate3d(0, 0px, 0)', offset: 0.94, easing: soft },
    { transform: 'translate3d(0, 0px, 0)', offset: 1 },
  ];
}

/**
 * Плашка имени Юг (ПК / планшет): вертикальный столбик букв.
 * Цикл: микро (3–5 с, целиком видно) → полный кегль + медленная автопрокрутка → снова микро…
 * Hover — cosmic tip; click — поповер с правкой имени. На hover/панели цикл на паузе (полный кегль).
 */
export function UserSouthPcNamePlaque({
  name,
  isBiddingPhase,
  longCompact,
  textClassName,
  textStyle,
  isTabletShell = false,
  onSaveDisplayName,
}: UserSouthPcNamePlaqueProps) {
  const t = useT();
  const tipId = useId();
  const panelId = useId();
  const canEdit = typeof onSaveDisplayName === 'function';

  const plaqueRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLSpanElement>(null);
  const textRef = useRef<HTMLSpanElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const animRef = useRef<Animation | null>(null);
  const revealingRef = useRef(false);
  const hoveringRef = useRef(false);

  const [truncated, setTruncated] = useState(false);
  const [revealing, setRevealing] = useState(false);
  const [nameHover, setNameHover] = useState(false);
  const [hoverTip, setHoverTip] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const [nameError, setNameError] = useState<string | null>(null);
  const [popPos, setPopPos] = useState<PopPlace | null>(null);
  /** fit = целиком видно мелким; full = рабочий кегль + scroll */
  const [phase, setPhase] = useState<'fit' | 'full'>('fit');
  const [fitSizePx, setFitSizePx] = useState<number | null>(null);

  const fullPx = fullNameSizePx(longCompact, isTabletShell);
  const showTip = hoverTip && !panelOpen;

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

  const measureTruncated = useCallback(() => {
    if (hoveringRef.current || phase !== 'full' || panelOpen) {
      setTruncated(false);
      return;
    }
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) {
      setTruncated(false);
      return;
    }
    setTruncated(text.scrollHeight > viewport.clientHeight + 1);
  }, [phase, panelOpen]);

  /** Подобрать максимальный кегль, при котором имя целиком в высоте viewport. */
  const computeFitSizePx = useCallback((): number => {
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text) return fullPx;
    const vh = viewport.clientHeight;
    if (vh < 4) return fullPx;

    /* Кегль/gap через CSS-переменные (letter-spacing на upright почти не действует) */
    const prevFs = text.style.getPropertyValue('--south-name-fs');
    const prevGap = text.style.getPropertyValue('--south-name-gap');
    const prevWord = text.style.getPropertyValue('--south-name-word-gap');
    let lo = FIT_MIN_PX;
    let hi = fullPx;
    let best = FIT_MIN_PX;

    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      text.style.setProperty('--south-name-fs', `${mid}px`);
      text.style.setProperty('--south-name-gap', mid < fullPx ? '0px' : '1px');
      text.style.setProperty('--south-name-word-gap', mid < fullPx ? '0.34em' : '0.4em');
      if (text.scrollHeight <= vh + 1) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }

    if (prevFs) text.style.setProperty('--south-name-fs', prevFs);
    else text.style.removeProperty('--south-name-fs');
    if (prevGap) text.style.setProperty('--south-name-gap', prevGap);
    else text.style.removeProperty('--south-name-gap');
    if (prevWord) text.style.setProperty('--south-name-word-gap', prevWord);
    else text.style.removeProperty('--south-name-word-gap');
    return best;
  }, [fullPx]);

  /* Новое имя / смена фазы layout → снова микро-показ */
  useLayoutEffect(() => {
    setPhase('fit');
    cancelReveal();
    setTruncated(false);
    const best = computeFitSizePx();
    setFitSizePx(best);
    if (best >= fullPx) {
      setPhase('full');
    }
  }, [name, longCompact, isTabletShell, fullPx, computeFitSizePx, cancelReveal]);

  /* Микро 3–5 с → укрупнение */
  useEffect(() => {
    if (phase !== 'fit') return;
    if (fitSizePx != null && fitSizePx >= fullPx) return;
    if (panelOpen || nameHover) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const hold = reduce ? 0 : randomHoldMs(FIT_HOLD_MS_MIN, FIT_HOLD_MS_MAX);
    const id = window.setTimeout(() => {
      if (hoveringRef.current) return;
      setPhase('full');
    }, hold);
    return () => window.clearTimeout(id);
  }, [phase, fitSizePx, fullPx, name, panelOpen, nameHover]);

  /* Полный 5–7 с → снова микро (цикл) */
  useEffect(() => {
    if (phase !== 'full') return;
    if (fitSizePx != null && fitSizePx >= fullPx) return;
    if (panelOpen || nameHover) return;
    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    const hold = randomHoldMs(FULL_HOLD_MS_MIN, FULL_HOLD_MS_MAX);
    const id = window.setTimeout(() => {
      if (hoveringRef.current) return;
      cancelReveal();
      setTruncated(false);
      const best = computeFitSizePx();
      setFitSizePx(best);
      if (best >= fullPx) {
        setPhase('full');
        return;
      }
      setPhase('fit');
    }, hold);
    return () => window.clearTimeout(id);
  }, [
    phase,
    fitSizePx,
    fullPx,
    name,
    panelOpen,
    nameHover,
    cancelReveal,
    computeFitSizePx,
  ]);

  useLayoutEffect(() => {
    measureTruncated();
    const viewport = viewportRef.current;
    const text = textRef.current;
    if (!viewport || !text || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => measureTruncated());
    ro.observe(viewport);
    ro.observe(text);
    return () => ro.disconnect();
  }, [name, isBiddingPhase, longCompact, phase, measureTruncated]);

  useEffect(() => {
    if (phase !== 'full') return;
    const id = window.setTimeout(() => measureTruncated(), 580);
    return () => window.clearTimeout(id);
  }, [phase, measureTruncated]);

  const runReveal = useCallback(() => {
    if (hoveringRef.current || revealingRef.current || phase !== 'full' || panelOpen) return;
    const viewport = viewportRef.current;
    const text = textRef.current;
    const track = trackRef.current;
    if (!viewport || !text || !track) return;
    const maxScroll = text.scrollHeight - viewport.clientHeight;
    if (maxScroll < 2) return;

    cancelReveal();
    track.style.transform = '';

    const reduce =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      track.style.transform = `translate3d(0, ${-Math.round(maxScroll)}px, 0)`;
      window.setTimeout(() => {
        if (trackRef.current) trackRef.current.style.transform = '';
      }, 700);
      return;
    }

    /* ×~2.5 медленнее и дольше прежних 7–11 с / maxScroll×140 */
    const durationMs = Math.max(18000, Math.min(30000, Math.round(maxScroll * 360)));
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
  }, [cancelReveal, phase, panelOpen]);

  useEffect(() => {
    if (phase !== 'full' || !truncated || panelOpen) {
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

    schedule(1200 + Math.floor(Math.random() * 800), tick);

    return () => {
      cancelled = true;
      if (timeoutId !== undefined) window.clearTimeout(timeoutId);
      cancelReveal();
    };
  }, [truncated, name, phase, panelOpen, runReveal, cancelReveal]);

  const closePanel = useCallback(() => {
    setPanelOpen(false);
    setEditing(false);
    setNameError(null);
    setDraftName(name);
  }, [name]);

  useEffect(() => {
    if (!panelOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (editing) {
        e.stopPropagation();
        setEditing(false);
        setDraftName(name);
        setNameError(null);
        return;
      }
      closePanel();
    };
    /* Не capture pointerdown: иначе ломается каретка в input.
       Откладываем подписку, чтобы клик «Изменить» не закрыл панель. */
    const onOutside = (e: MouseEvent) => {
      const node = e.target;
      if (!(node instanceof Element)) return;
      if (node.closest('.south-name-cosmic-popover')) return;
      if (plaqueRef.current?.contains(node)) return;
      closePanel();
    };
    window.addEventListener('keydown', onKey);
    const attachId = window.setTimeout(() => {
      document.addEventListener('mousedown', onOutside);
    }, 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearTimeout(attachId);
      document.removeEventListener('mousedown', onOutside);
    };
  }, [panelOpen, editing, name, closePanel]);

  useLayoutEffect(() => {
    if (!panelOpen) {
      setPopPos(null);
      return;
    }
    const host = plaqueRef.current;
    if (!host) return;
    const update = () => setPopPos(placeNamePopover(host, popoverRef.current));
    update();
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [panelOpen, editing, nameError]);

  useEffect(() => {
    if (!editing || !panelOpen) return;
    const id = window.setTimeout(() => {
      const el = nameInputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const len = el.value.length;
      try {
        /* выделить всё — сразу видно, что поле живое и редактируемое */
        el.setSelectionRange(0, len);
      } catch {
        /* ignore */
      }
    }, 50);
    return () => window.clearTimeout(id);
  }, [editing, panelOpen]);

  useEffect(() => {
    if (!editing) setDraftName(name);
  }, [name, editing]);

  const startEdit = useCallback(() => {
    if (!canEdit) return;
    setDraftName(name);
    setNameError(null);
    setEditing(true);
  }, [canEdit, name]);

  const commitEdit = useCallback(() => {
    const trimmed = draftName.trim();
    if (!trimmed) {
      setNameError(t('nameAvatar.needName'));
      return;
    }
    const next = trimmed.slice(0, MAX_DISPLAY_NAME_LENGTH);
    setNameError(null);
    if (next !== name.trim()) {
      onSaveDisplayName?.(next);
    }
    setEditing(false);
    setPanelOpen(false);
  }, [draftName, name, onSaveDisplayName, t]);

  const openPanel = useCallback(() => {
    setHoverTip(false);
    setPanelOpen(true);
    setNameError(null);
    setDraftName(name);
    /* Сразу в редактор — иначе «плашка» выглядит как мёртвое поле без каретки */
    setEditing(canEdit);
    cancelReveal();
    if (phase === 'fit') setPhase('full');
  }, [name, cancelReveal, phase, canEdit]);

  const onEnter = () => {
    hoveringRef.current = true;
    setNameHover(true);
    if (!panelOpen) setHoverTip(true);
    cancelReveal();
    setTruncated(false);
    if (phase === 'fit') setPhase('full');
  };

  const onLeave = () => {
    hoveringRef.current = false;
    setNameHover(false);
    setHoverTip(false);
    if (!panelOpen) {
      window.requestAnimationFrame(() => measureTruncated());
    }
  };

  const onPlaqueKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (panelOpen) closePanel();
      else openPanel();
    }
  };

  const plaqueClass = [
    'user-player-panel-pc-name-under-avatar',
    'user-player-panel-pc-name-under-avatar--play-plaque',
    'user-player-panel-pc-name-under-avatar--vertical-rail',
    'user-player-panel-pc-name-under-avatar--interactive',
    longCompact ? 'user-player-panel-pc-name-under-avatar--long-compact' : '',
    truncated && phase === 'full' && !panelOpen
      ? 'user-player-panel-pc-name-under-avatar--play-truncated'
      : '',
    revealing ? 'user-player-panel-pc-name-under-avatar--play-revealing' : '',
    nameHover || panelOpen ? 'is-name-hover' : '',
    panelOpen ? 'user-player-panel-pc-name-under-avatar--panel-open' : '',
    phase === 'fit' ? 'user-player-panel-pc-name-under-avatar--fit' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const textClass = [
    textClassName,
    'user-player-panel-pc-name-text',
    'user-player-panel-pc-name-text--vertical',
    longCompact ? 'user-player-panel-pc-name-text--long-compact' : '',
    phase === 'fit' ? 'user-player-panel-pc-name-text--fit' : 'user-player-panel-pc-name-text--full',
  ]
    .filter(Boolean)
    .join(' ');

  const activeFs = phase === 'fit' && fitSizePx != null ? fitSizePx : fullPx;
  const microTight = phase === 'fit' && fitSizePx != null && fitSizePx < fullPx;
  const nameGlyphs = splitNameGlyphs(name);
  const mergedTextStyle = {
    ...textStyle,
    ['--south-name-fs' as string]: `${activeFs}px`,
    ['--south-name-gap' as string]: microTight ? '0px' : '1px',
    ['--south-name-word-gap' as string]: microTight ? '0.34em' : '0.4em',
  } as CSSProperties;

  const popoverStyle: CSSProperties | undefined = popPos
    ? {
        position: 'fixed',
        top: popPos.top,
        left: popPos.left,
        right: 'auto',
        bottom: 'auto',
        transformOrigin: popPos.origin,
        zIndex: 2147482000,
      }
    : { position: 'fixed', visibility: 'hidden', pointerEvents: 'none' };

  const popover =
    panelOpen && typeof document !== 'undefined'
      ? createPortal(
          <div
            ref={popoverRef}
            id={panelId}
            className={[
              'south-name-cosmic-popover',
              editing ? 'south-name-cosmic-popover--editing' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            role="dialog"
            aria-label={t('southName.panelTitle')}
            style={popoverStyle}
            onMouseEnter={() => {
              hoveringRef.current = true;
            }}
            onMouseLeave={() => {
              hoveringRef.current = false;
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="south-name-cosmic-popover__aurora" aria-hidden />
            <div className="south-name-cosmic-popover__glow" aria-hidden />
            <div className="south-name-cosmic-popover__dust" aria-hidden />
            <div className="south-name-cosmic-popover__orbit" aria-hidden />

            <p className="south-name-cosmic-popover__eyebrow">{t('southName.panelEyebrow')}</p>
            <h3 className="south-name-cosmic-popover__title">{t('southName.panelTitle')}</h3>
            <p className="south-name-cosmic-popover__lead">{t('southName.panelLead')}</p>

            {editing && canEdit ? (
              <div
                className="south-name-cosmic-popover__edit"
                role="group"
                aria-label={t('southName.editing')}
              >
                <label className="south-name-cosmic-popover__label" htmlFor={`${panelId}-input`}>
                  {t('southName.editing')}
                </label>
                <div className="south-name-cosmic-popover__field">
                  <input
                    ref={nameInputRef}
                    id={`${panelId}-input`}
                    type="text"
                    className="south-name-cosmic-popover__input"
                    value={draftName}
                    maxLength={MAX_DISPLAY_NAME_LENGTH}
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="off"
                    spellCheck={false}
                    enterKeyHint="done"
                    aria-invalid={nameError ? true : undefined}
                    aria-label={t('avatarMenu.newName')}
                    style={{
                      color: '#e879f9',
                      WebkitTextFillColor: '#e879f9',
                      caretColor: '#22d3ee',
                    }}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => {
                      setDraftName(e.target.value);
                      if (nameError) setNameError(null);
                    }}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        commitEdit();
                      }
                      if (e.key === 'Escape') {
                        e.preventDefault();
                        closePanel();
                      }
                    }}
                  />
                  <span className="south-name-cosmic-popover__counter" aria-live="polite">
                    {draftName.trim().length}/{MAX_DISPLAY_NAME_LENGTH}
                  </span>
                </div>
                {nameError ? (
                  <p className="south-name-cosmic-popover__error" role="alert">
                    {nameError}
                  </p>
                ) : (
                  <p className="south-name-cosmic-popover__hint">{t('southName.editHint')}</p>
                )}
                <div className="south-name-cosmic-popover__actions">
                  <button
                    type="button"
                    className="south-name-cosmic-popover__btn south-name-cosmic-popover__btn--primary"
                    onClick={(e) => {
                      e.stopPropagation();
                      commitEdit();
                    }}
                  >
                    <span className="south-name-cosmic-popover__btn-shine" aria-hidden />
                    {t('southName.save')}
                  </button>
                  <button
                    type="button"
                    className="south-name-cosmic-popover__btn south-name-cosmic-popover__btn--ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePanel();
                    }}
                  >
                    {t('southName.cancel')}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="south-name-cosmic-popover__hero" title={name}>
                  {name}
                </p>
                <div className="south-name-cosmic-popover__actions">
                  {canEdit ? (
                    <button
                      type="button"
                      className="south-name-cosmic-popover__btn south-name-cosmic-popover__btn--primary"
                      onClick={(e) => {
                        e.stopPropagation();
                        startEdit();
                      }}
                    >
                      <span className="south-name-cosmic-popover__btn-shine" aria-hidden />
                      {t('southName.edit')}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="south-name-cosmic-popover__btn south-name-cosmic-popover__btn--ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      closePanel();
                    }}
                  >
                    {t('southName.close')}
                  </button>
                </div>
              </>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <>
      <div
        ref={plaqueRef}
        className={plaqueClass}
        role="button"
        tabIndex={0}
        aria-label={
          canEdit
            ? t('southName.aria', { name })
            : t('southName.ariaReadonly', { name })
        }
        aria-expanded={panelOpen}
        aria-controls={panelOpen ? panelId : undefined}
        aria-describedby={showTip ? tipId : undefined}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={() => {
          if (!panelOpen) setHoverTip(true);
          setNameHover(true);
        }}
        onBlur={() => {
          setHoverTip(false);
          if (!panelOpen) setNameHover(false);
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (panelOpen) closePanel();
          else openPanel();
        }}
        onKeyDown={onPlaqueKeyDown}
      >
        <span className="user-player-panel-pc-name-viewport" ref={viewportRef}>
          <span className="user-player-panel-pc-name-track" ref={trackRef}>
            <span ref={textRef} className={textClass} style={mergedTextStyle} aria-hidden="true">
              {nameGlyphs.map((g) =>
                g.type === 'sp' ? (
                  <span key={g.key} className="user-player-panel-pc-name-text__sp" />
                ) : (
                  <span key={g.key} className="user-player-panel-pc-name-text__ch">
                    {g.ch}
                  </span>
                ),
              )}
            </span>
          </span>
        </span>
        {truncated && phase === 'full' && !panelOpen ? (
          <span className="user-player-panel-pc-name-trunc-chrome" aria-hidden="true">
            <span className="user-player-panel-pc-name-trunc-fade" />
          </span>
        ) : null}
      </div>

      <MenuCapsuleCosmicTip
        open={showTip}
        anchorRef={plaqueRef}
        tipId={tipId}
        text={t('southName.tipEyebrow')}
        detail={canEdit ? t('southName.tipDetail') : t('southName.tipDetailReadonly')}
        wide
        className="south-name-cosmic-tip"
      >
        <span className="south-name-cosmic-tip__callsign">{name}</span>
      </MenuCapsuleCosmicTip>

      {popover}
    </>
  );
}
