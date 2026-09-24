/**
 * Мультитрек: бочка/снейр/хеты + слои мелодии.
 * Левая колонка кнопок закреплена; сетка скроллится отдельно.
 * Столбцы = линейка тактов (высокая полоса сверху); строки = ▣ у имени.
 */

import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { LabBeatParams, LabMelodyLayer, LabPhraseNote } from '../../audio/lab';
import { getLabBeatLoopCueSec, getLabBeatLoopPhaseSec, getLabBeatPlaybackRate, normalizeLabBars, resolveDisplayPattern, setLabBeatPlaybackRate } from '../../audio/lab';

const SIDE_W = 176;
const BASE_PX_PER_BEAT = 48;
const ROW_H = 32;
const ZOOM_MIN = 0.2;
const ZOOM_MAX = 4;
/** Высокая линейка — удобно тянуть такты, не попадая в дорожки. */
const RULER_H = 30;
const LANE_Y0 = RULER_H + 2;

export type LabClipAction = 'copy' | 'cut' | 'paste' | 'clear' | 'undo';

type Props = {
  beat: LabBeatParams;
  layers: LabMelodyLayer[];
  liveNotes?: LabPhraseNote[];
  recording?: boolean;
  activeLayerId?: string | null;
  playingLayerId?: string | null;
  soloLayerId?: string | null;
  /** false = подсветки нет (чистый клип-диапазон только в панели). */
  selectionActive?: boolean;
  selectionFromBar?: number;
  selectionToBar?: number;
  onSelectionChange?: (fromBar: number, toBar: number) => void;
  onClearSelection?: () => void;
  clipKick?: boolean;
  clipSnare?: boolean;
  clipHats?: boolean;
  /** Явный список id в ▣ (пустой = мелодии вне клипа). */
  clipLayerIds?: string[];
  /** Дорожки, лежащие в буфере копирования. */
  bufferKick?: boolean;
  bufferSnare?: boolean;
  bufferHats?: boolean;
  bufferLayerIds?: string[];
  onToggleClipDrum?: (lane: 'kick' | 'snare' | 'hats') => void;
  onToggleClipLayer?: (id: string) => void;
  onClipLanesAll?: () => void;
  onClipLanesNone?: () => void;
  onClipAction?: (action: LabClipAction) => void;
  canPaste?: boolean;
  canUndo?: boolean;
  onSelectLayer?: (id: string) => void;
  onPlayLayer?: (id: string) => void;
  onToggleMute?: (id: string) => void;
  onSolo?: (id: string) => void;
  onDeleteLayer?: (id: string) => void;
  onToggleDrumStep?: (lane: 'kick' | 'snare' | 'hats', globalStep: number) => void;
  onClearDrumBar?: (lane: 'kick' | 'snare' | 'hats', bar1: number) => void;
  onToggleDrumMute?: (lane: 'kick' | 'snare' | 'hats') => void;
  onClearBeat?: () => void;
  /** Перемотка playhead (сек от начала петли). */
  onSeek?: (phaseSec: number) => void;
  /** Вкл. «Следить» — если петля «залипла», родитель может перезапустить. */
  onFollowEnable?: () => void;
  /** Смена темпа (BPM) — общая на всю петлю. */
  onBpmChange?: (bpm: number) => void;
};

function midiHue(midi: number): string {
  const pc = ((midi % 12) + 12) % 12;
  const h = (pc / 12) * 300 + 160;
  return `hsl(${h} 70% 48%)`;
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

export function LabTracksTimeline({
  beat,
  layers,
  liveNotes = [],
  recording = false,
  activeLayerId,
  playingLayerId,
  soloLayerId,
  selectionActive = false,
  selectionFromBar,
  selectionToBar,
  onSelectionChange,
  onClearSelection,
  clipKick = true,
  clipSnare = true,
  clipHats = true,
  clipLayerIds = [],
  bufferKick = false,
  bufferSnare = false,
  bufferHats = false,
  bufferLayerIds = [],
  onToggleClipDrum,
  onToggleClipLayer,
  onClipLanesAll,
  onClipLanesNone,
  onClipAction,
  canPaste = false,
  canUndo = false,
  onSelectLayer,
  onPlayLayer,
  onToggleMute,
  onSolo,
  onDeleteLayer,
  onToggleDrumStep,
  onClearDrumBar,
  onToggleDrumMute,
  onClearBeat,
  onSeek,
  onFollowEnable,
  onBpmChange,
}: Props) {
  const [zoom, setZoom] = useState(1);
  const [follow, setFollow] = useState(true);
  const [playRate, setPlayRate] = useState(() => getLabBeatPlaybackRate());
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number } | null>(null);
  /** Редко: только zoom/resize/ручной скролл — не на каждом кадре follow. */
  const [hScroll, setHScroll] = useState({ left: 0, max: 0, view: 1 });
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const pinTrackRef = useRef<HTMLDivElement | null>(null);
  const pinThumbRef = useRef<HTMLDivElement | null>(null);
  const playheadGRef = useRef<SVGGElement | null>(null);
  const metaPhaseRef = useRef<HTMLSpanElement | null>(null);
  const phaseRef = useRef(0);
  const followRef = useRef(follow);
  followRef.current = follow;
  /** Программный follow-скролл — не гоняем React через scroll-event. */
  const suppressScrollReactRef = useRef(false);
  const hScrollRef = useRef({ left: 0, max: 0, view: 1 });
  const scrollReactTimerRef = useRef(0);
  const dragMode = useRef<'select' | 'seek' | null>(null);
  const dragOriginBar = useRef(1);
  const dragSelFrom = useRef(1);
  const dragSelTo = useRef(1);
  const panDrag = useRef<{ pointerId: number; startX: number; startLeft: number } | null>(null);
  const pinThumbDrag = useRef<{
    pointerId: number;
    startX: number;
    startLeft: number;
    trackW: number;
    thumbW: number;
  } | null>(null);
  const [draftSel, setDraftSel] = useState<{ from: number; to: number } | null>(null);

  const bpm = beat.bpm;
  const bars = normalizeLabBars(beat.bars);
  const beatSec = 60 / Math.min(190, Math.max(80, bpm));
  const loopSec = bars * 4 * beatSec;
  const pxPerBeat = BASE_PX_PER_BEAT * zoom;
  const gridW = (loopSec / beatSec) * pxPerBeat + 24;

  const pattern = useMemo(() => resolveDisplayPattern(beat), [beat]);

  const selFrom = draftSel?.from ?? selectionFromBar ?? 0;
  const selTo = draftSel?.to ?? selectionToBar ?? 0;
  const hasSel =
    Boolean(draftSel || selectionActive) && selFrom >= 1 && selTo >= selFrom;

  const layerPicked = (id: string) => clipLayerIds.includes(id);
  const drumPicked = (id: 'kick' | 'snare' | 'hats') =>
    id === 'kick' ? clipKick : id === 'snare' ? clipSnare : clipHats;
  const layerBuffered = (id: string) => bufferLayerIds.includes(id);
  const drumBuffered = (id: 'kick' | 'snare' | 'hats') =>
    id === 'kick' ? bufferKick : id === 'snare' ? bufferSnare : bufferHats;

  const paintPinThumb = (left: number, max: number, view: number) => {
    const thumb = pinThumbRef.current;
    if (!thumb) return;
    if (max <= 0) {
      thumb.style.width = '100%';
      thumb.style.left = '0%';
      return;
    }
    const content = Math.max(view + max, 1);
    const thumbPct = Math.max(12, (view / content) * 100);
    const leftPct = (left / max) * (100 - thumbPct);
    thumb.style.width = `${thumbPct}%`;
    thumb.style.left = `${leftPct}%`;
  };

  const readScrollMetrics = () => {
    const el = scrollRef.current;
    if (!el) return hScrollRef.current;
    const left = el.scrollLeft;
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    const view = Math.max(1, el.clientWidth);
    const next = { left, max, view };
    hScrollRef.current = next;
    paintPinThumb(left, max, view);
    return next;
  };

  useEffect(() => {
    let raf = 0;
    let lastMetaBar = -1;
    let lastMetaBeat = -1;
    const tick = () => {
      const live = getLabBeatLoopPhaseSec();
      const p = live != null ? live % loopSec : getLabBeatLoopCueSec() % loopSec;
      phaseRef.current = p;
      const x = (p / beatSec) * pxPerBeat;
      const xSafe = Number.isFinite(x) ? x : 0;
      playheadGRef.current?.setAttribute('transform', `translate(${xSafe},0)`);

      if (followRef.current) {
        const el = scrollRef.current;
        if (el) {
          const view = el.clientWidth;
          const margin = Math.min(120, view * 0.28);
          const left = el.scrollLeft;
          let next = left;
          if (xSafe < left + margin) next = Math.max(0, xSafe - margin);
          else if (xSafe > left + view - margin) next = xSafe - view + margin;
          if (Math.abs(next - left) > 0.5) {
            suppressScrollReactRef.current = true;
            el.scrollLeft = next;
            readScrollMetrics();
            /* снять флаг после scroll-event этого кадра */
            queueMicrotask(() => {
              suppressScrollReactRef.current = false;
            });
          }
        }
      }

      const bar = Math.min(bars, Math.floor(p / (4 * beatSec)) + 1);
      const beatIn = Math.floor((p % (4 * beatSec)) / beatSec) + 1;
      if (bar !== lastMetaBar || beatIn !== lastMetaBeat) {
        lastMetaBar = bar;
        lastMetaBeat = beatIn;
        const meta = metaPhaseRef.current;
        if (meta) meta.textContent = `${bar}.${beatIn}`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [loopSec, beatSec, pxPerBeat, bars]);

  useEffect(() => {
    if (!ctxMenu) return;
    const close = () => setCtxMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('pointerdown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [ctxMenu]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (ctxMenu) return;
      if (hasSel || selectionActive) onClearSelection?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctxMenu, hasSel, selectionActive, onClearSelection]);

  const xAt = (at: number) => (at / beatSec) * pxPerBeat;
  const barNow = Math.min(bars, Math.floor(phaseRef.current / (4 * beatSec)) + 1);
  const beatInBar = Math.floor((phaseRef.current % (4 * beatSec)) / beatSec) + 1;

  const barFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 1;
    const rect = svg.getBoundingClientRect();
    const x = clientX - rect.left;
    if (x < 0) return 1;
    const bar = Math.floor(x / (4 * pxPerBeat)) + 1;
    return clamp(bar, 1, bars);
  };

  const phaseFromClientX = (clientX: number) => {
    const svg = svgRef.current;
    if (!svg) return 0;
    const rect = svg.getBoundingClientRect();
    const x = Math.max(0, clientX - rect.left);
    const sec = (x / pxPerBeat) * beatSec;
    return clamp(sec, 0, Math.max(0, loopSec - 1e-3));
  };

  const applySeek = (clientX: number) => {
    const sec = phaseFromClientX(clientX);
    phaseRef.current = sec;
    const x = (sec / beatSec) * pxPerBeat;
    playheadGRef.current?.setAttribute('transform', `translate(${x},0)`);
    const bar = Math.min(bars, Math.floor(sec / (4 * beatSec)) + 1);
    const beatIn = Math.floor((sec % (4 * beatSec)) / beatSec) + 1;
    const meta = metaPhaseRef.current;
    if (meta) meta.textContent = `${bar}.${beatIn}`;
    onSeek?.(sec);
  };

  const drumRows: {
    id: 'kick' | 'snare' | 'hats';
    label: string;
    steps: boolean[];
    color: string;
    muted: boolean;
  }[] = [
    { id: 'kick', label: 'Бочка', steps: pattern.kick, color: '#38bdf8', muted: (beat.kick ?? 0) < 0.05 },
    { id: 'snare', label: 'Снейр', steps: pattern.snare, color: '#fb923c', muted: (beat.snare ?? 0) < 0.05 },
    { id: 'hats', label: 'Хеты', steps: pattern.hats, color: '#4ade80', muted: (beat.hats ?? 0) < 0.05 },
  ];

  const rows = 3 + layers.length + (liveNotes.length > 0 || recording ? 1 : 0);
  const height = LANE_Y0 + rows * ROW_H + 8;

  const syncHScroll = (opts?: { forceReact?: boolean }) => {
    const next = readScrollMetrics();
    if (suppressScrollReactRef.current && !opts?.forceReact) return;
    if (opts?.forceReact) {
      if (scrollReactTimerRef.current) {
        window.clearTimeout(scrollReactTimerRef.current);
        scrollReactTimerRef.current = 0;
      }
      setHScroll(next);
      return;
    }
    /* Ручной скролл: пин уже в DOM, React (кнопки ◀▶) — реже, без лагов */
    if (scrollReactTimerRef.current) return;
    scrollReactTimerRef.current = window.setTimeout(() => {
      scrollReactTimerRef.current = 0;
      setHScroll({ ...hScrollRef.current });
    }, 80);
  };

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    syncHScroll({ forceReact: true });
    const onScroll = () => syncHScroll();
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = new ResizeObserver(() => syncHScroll({ forceReact: true }));
    ro.observe(el);
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro.disconnect();
      if (scrollReactTimerRef.current) {
        window.clearTimeout(scrollReactTimerRef.current);
        scrollReactTimerRef.current = 0;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gridW, height, zoom, bars]);

  const scrollByPx = (dx: number) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, el.scrollLeft + dx));
    setFollow(false);
    syncHScroll({ forceReact: true });
  };

  const setScrollRatio = (ratio: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const { max } = readScrollMetrics();
    if (max <= 0) return;
    el.scrollLeft = clamp(ratio, 0, 1) * max;
    setFollow(false);
    syncHScroll({ forceReact: true });
  };

  const bumpZoom = (dir: 1 | -1) => {
    setZoom((z) => {
      const step = z <= 0.55 ? 0.1 : 0.25;
      return clamp(Math.round((z + dir * step) * 100) / 100, ZOOM_MIN, ZOOM_MAX);
    });
  };

  /* React onWheel — passive; preventDefault только через native { passive: false }. */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const dir = (e.deltaY > 0 ? -1 : 1) as 1 | -1;
        setZoom((z) => {
          const step = z <= 0.55 ? 0.1 : 0.25;
          return clamp(Math.round((z + dir * step) * 100) / 100, ZOOM_MIN, ZOOM_MAX);
        });
        return;
      }
      e.preventDefault();
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      el.scrollLeft += dx;
      setFollow(false);
      const left = el.scrollLeft;
      const max = Math.max(0, el.scrollWidth - el.clientWidth);
      const view = Math.max(1, el.clientWidth);
      hScrollRef.current = { left, max, view };
      paintPinThumb(left, max, view);
      window.clearTimeout(scrollReactTimerRef.current);
      scrollReactTimerRef.current = window.setTimeout(() => {
        setHScroll({ ...hScrollRef.current });
      }, 80);
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- native wheel once; reads refs
  }, []);

  const BPM_MIN = 80;
  const BPM_MAX = 190;
  const setBpm = (next: number) => {
    if (!onBpmChange) return;
    onBpmChange(clamp(Math.round(next), BPM_MIN, BPM_MAX));
  };

  const onRulerPointerDown = (e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    /* Alt/Option — перемотка без выделения тактов */
    if (e.altKey && onSeek) {
      e.preventDefault();
      e.stopPropagation();
      setCtxMenu(null);
      dragMode.current = 'seek';
      setFollow(true);
      applySeek(e.clientX);
      svgRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }
    if (!onSelectionChange) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(null);
    const bar = barFromClientX(e.clientX);
    dragMode.current = 'select';
    dragOriginBar.current = bar;
    dragSelFrom.current = bar;
    dragSelTo.current = bar;
    setDraftSel({ from: bar, to: bar });
    setFollow(false);
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onPlayheadPointerDown = (e: ReactPointerEvent) => {
    if (!onSeek || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu(null);
    dragMode.current = 'seek';
    setFollow(true);
    applySeek(e.clientX);
    svgRef.current?.setPointerCapture?.(e.pointerId);
  };

  const onGridPointerMove = (e: ReactPointerEvent) => {
    if (pinThumbDrag.current && pinThumbDrag.current.pointerId === e.pointerId) {
      const td = pinThumbDrag.current;
      const travel = Math.max(1, td.trackW - td.thumbW);
      const delta = e.clientX - td.startX;
      const el = scrollRef.current;
      const max = hScrollRef.current.max;
      if (el) {
        el.scrollLeft = clamp(td.startLeft + (delta / travel) * max, 0, max);
        syncHScroll();
      }
      return;
    }
    if (panDrag.current && panDrag.current.pointerId === e.pointerId) {
      const el = scrollRef.current;
      if (el) {
        el.scrollLeft = panDrag.current.startLeft - (e.clientX - panDrag.current.startX);
        syncHScroll();
      }
      return;
    }
    if (dragMode.current === 'seek') {
      applySeek(e.clientX);
      return;
    }
    if (dragMode.current !== 'select') return;
    const bar = barFromClientX(e.clientX);
    const a = Math.min(dragOriginBar.current, bar);
    const b = Math.max(dragOriginBar.current, bar);
    dragSelFrom.current = a;
    dragSelTo.current = b;
    setDraftSel({ from: a, to: b });
  };

  const onGridPointerUp = (e: ReactPointerEvent) => {
    if (pinThumbDrag.current && pinThumbDrag.current.pointerId === e.pointerId) {
      pinThumbDrag.current = null;
      return;
    }
    if (panDrag.current && panDrag.current.pointerId === e.pointerId) {
      panDrag.current = null;
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (dragMode.current === 'seek') {
      dragMode.current = null;
      try {
        (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
      } catch {
        /* ignore */
      }
      return;
    }
    if (dragMode.current !== 'select') return;
    dragMode.current = null;
    try {
      (e.currentTarget as Element).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    const from = dragSelFrom.current;
    const to = dragSelTo.current;
    setDraftSel(null);
    onSelectionChange?.(from, to);
  };

  const onScrollAreaPointerDown = (e: ReactPointerEvent) => {
    if (e.button === 1) {
      e.preventDefault();
      const el = scrollRef.current;
      if (!el) return;
      panDrag.current = { pointerId: e.pointerId, startX: e.clientX, startLeft: el.scrollLeft };
      setFollow(false);
      (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    }
  };

  const openCtx = (e: React.MouseEvent) => {
    if (!onClipAction) return;
    e.preventDefault();
    e.stopPropagation();
    setCtxMenu({ x: e.clientX, y: e.clientY });
  };

  const runAction = (action: LabClipAction) => {
    setCtxMenu(null);
    onClipAction?.(action);
  };

  const selX = hasSel ? xAt((Math.min(selFrom, selTo) - 1) * 4 * beatSec) : 0;
  const selW = hasSel
    ? Math.max(4, (Math.abs(selTo - selFrom) + 1) * 4 * pxPerBeat)
    : 0;

  const pickedRowCount =
    (clipKick ? 1 : 0) +
    (clipSnare ? 1 : 0) +
    (clipHats ? 1 : 0) +
    layers.filter((l) => layerPicked(l.id)).length;

  return (
    <div className={recording ? 'lab-tracks lab-tracks--rec' : 'lab-tracks'}>
      <div className="lab-tracks__head">
        <span className="lab-tracks__title">Дорожки</span>
        <span className="lab-tracks__meta">
          {bars}т · <span ref={metaPhaseRef}>{barNow}.{beatInBar}</span>
          {recording ? ' · ● REC' : ''}
          {hasSel
            ? ` · выд. ${Math.min(selFrom, selTo)}–${Math.max(selFrom, selTo)} · ${pickedRowCount} ряд.`
            : ' · выделение: тяни фиолетовую линейку сверху'}
        </span>
        {onBpmChange ? (
          <div className="lab-tracks__tempo" role="group" aria-label="Темп и скорость прослушивания">
            <button
              type="button"
              className={
                playRate === 0.5
                  ? 'lab-tracks__zoom-btn lab-tracks__zoom-btn--on lab-tracks__tempo-rate'
                  : 'lab-tracks__zoom-btn lab-tracks__tempo-rate'
              }
              title={playRate === 0.5 ? 'Скорость ×0.5 — выкл (норма)' : 'Слушать вдвое медленнее (без смены BPM)'}
              aria-pressed={playRate === 0.5}
              onClick={() => {
                const next = playRate === 0.5 ? 1 : 0.5;
                setLabBeatPlaybackRate(next);
                setPlayRate(next);
              }}
            >
              ½
            </button>
            <button
              type="button"
              className="lab-tracks__zoom-btn"
              title="−5 BPM (темп композиции)"
              disabled={bpm <= BPM_MIN}
              onClick={() => setBpm(bpm - 5)}
            >
              −
            </button>
            <button
              type="button"
              className="lab-tracks__zoom-btn lab-tracks__zoom-btn--label lab-tracks__tempo-bpm"
              title="Сброс BPM 128"
              onClick={() => setBpm(128)}
            >
              {Math.round(bpm)}
            </button>
            <button
              type="button"
              className="lab-tracks__zoom-btn"
              title="+5 BPM (темп композиции)"
              disabled={bpm >= BPM_MAX}
              onClick={() => setBpm(bpm + 5)}
            >
              +
            </button>
            <button
              type="button"
              className={
                playRate === 2
                  ? 'lab-tracks__zoom-btn lab-tracks__zoom-btn--on lab-tracks__tempo-rate'
                  : 'lab-tracks__zoom-btn lab-tracks__tempo-rate'
              }
              title={playRate === 2 ? 'Скорость ×2 — выкл (норма)' : 'Слушать вдвое быстрее (без смены BPM)'}
              aria-pressed={playRate === 2}
              onClick={() => {
                const next = playRate === 2 ? 1 : 2;
                setLabBeatPlaybackRate(next);
                setPlayRate(next);
              }}
            >
              2×
            </button>
          </div>
        ) : null}
        <div className="lab-tracks__zoom" role="group" aria-label="Масштаб дорожек">
          {onSeek ? (
            <button
              type="button"
              className="lab-tracks__zoom-btn"
              title="Playhead в начало"
              onClick={() => {
                phaseRef.current = 0;
                playheadGRef.current?.setAttribute('transform', 'translate(0,0)');
                if (metaPhaseRef.current) metaPhaseRef.current.textContent = '1.1';
                setFollow(true);
                onSeek(0);
              }}
            >
              ⏮
            </button>
          ) : null}
          {hasSel && onClearSelection ? (
            <button
              type="button"
              className="lab-tracks__zoom-btn lab-tracks__zoom-btn--clear"
              title="Снять подсветку выделения (Esc)"
              onClick={() => onClearSelection()}
            >
              Снять выд.
            </button>
          ) : null}
          {onClearBeat ? (
            <button
              type="button"
              className="lab-tracks__zoom-btn lab-tracks__zoom-btn--clear"
              title="Очистить всю сетку бита"
              onClick={onClearBeat}
            >
              ⌫
            </button>
          ) : null}
          <button type="button" className="lab-tracks__zoom-btn" title="Мельче" onClick={() => bumpZoom(-1)}>
            −
          </button>
          <button
            type="button"
            className="lab-tracks__zoom-btn lab-tracks__zoom-btn--label"
            title="Сброс масштаба"
            onClick={() => setZoom(1)}
          >
            {Math.round(zoom * 100)}%
          </button>
          <button type="button" className="lab-tracks__zoom-btn" title="Крупнее" onClick={() => bumpZoom(1)}>
            +
          </button>
          <button
            type="button"
            className={follow ? 'lab-tracks__zoom-btn lab-tracks__zoom-btn--on' : 'lab-tracks__zoom-btn'}
            title="Следить за playhead"
            onClick={() => {
              setFollow((v) => {
                const next = !v;
                if (next) onFollowEnable?.();
                return next;
              });
            }}
          >
            ◈
          </button>
        </div>
      </div>

      <div className="lab-tracks__board">
        <div className="lab-tracks__side" style={{ width: SIDE_W, height }}>
          <div className="lab-tracks__side-ruler" style={{ height: RULER_H }} title="Справа — линейка тактов для выделения">
            <span>такты →</span>
            <span className="lab-tracks__side-lane-tools">
              {onClipLanesAll ? (
                <button
                  type="button"
                  className="lab-tracks__side-clear-sel"
                  title="Все дорожки в ▣"
                  onClick={() => onClipLanesAll()}
                >
                  ▣+
                </button>
              ) : null}
              {onClipLanesNone ? (
                <button
                  type="button"
                  className="lab-tracks__side-clear-sel"
                  title="Снять все ▣"
                  onClick={() => onClipLanesNone()}
                >
                  □
                </button>
              ) : null}
              {hasSel && onClearSelection ? (
                <button
                  type="button"
                  className="lab-tracks__side-clear-sel"
                  title="Снять подсветку тактов (Esc)"
                  onClick={() => onClearSelection()}
                >
                  ✕
                </button>
              ) : null}
            </span>
          </div>
          {drumRows.map((row, ri) => {
            const inClip = drumPicked(row.id);
            const inBuf = drumBuffered(row.id);
            return (
              <div
                key={row.id}
                className={[
                  'lab-tracks__side-row',
                  'lab-tracks__side-row--drum',
                  row.muted ? 'lab-tracks__side-row--muted' : '',
                  inClip ? 'lab-tracks__side-row--clip' : '',
                  inBuf ? 'lab-tracks__side-row--buffered' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ top: LANE_Y0 + ri * ROW_H, height: ROW_H }}
              >
                {onToggleDrumMute ? (
                  <button
                    type="button"
                    className={
                      row.muted
                        ? 'lab-tracks__icon-btn lab-tracks__icon-btn--muted'
                        : 'lab-tracks__icon-btn'
                    }
                    title={row.muted ? 'Включить дорожку' : 'Mute всей дорожки'}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleDrumMute(row.id);
                    }}
                  >
                    M
                  </button>
                ) : null}
                <button
                  type="button"
                  className="lab-tracks__side-clip-toggle"
                  title={
                    inClip
                      ? `Убрать «${row.label}» из ▣${inBuf ? ' · в буфере' : ''}`
                      : `Включить «${row.label}» в ▣${inBuf ? ' · в буфере' : ''}`
                  }
                  aria-pressed={inClip}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleClipDrum?.(row.id);
                  }}
                >
                  <span
                    className="lab-tracks__side-name"
                    style={{ color: row.muted ? '#64748b' : row.color }}
                  >
                    {inClip ? '▣ ' : '□ '}
                    {inBuf ? '📋 ' : ''}
                    {row.label}
                  </span>
                </button>
              </div>
            );
          })}
          {layers.map((layer, li) => {
            const top = LANE_Y0 + (3 + li) * ROW_H;
            const active = layer.id === activeLayerId;
            const playing = layer.id === playingLayerId;
            const solo = layer.id === soloLayerId;
            const inClip = layerPicked(layer.id);
            const inBuf = layerBuffered(layer.id);
            return (
              <div
                key={layer.id}
                className={[
                  'lab-tracks__side-row',
                  'lab-tracks__side-row--mel',
                  active ? 'lab-tracks__side-row--on' : '',
                  !layer.enabled ? 'lab-tracks__side-row--muted' : '',
                  inClip ? 'lab-tracks__side-row--clip' : '',
                  inBuf ? 'lab-tracks__side-row--buffered' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                style={{ top, height: ROW_H }}
              >
                <button
                  type="button"
                  className={playing ? 'lab-tracks__play lab-tracks__play--on' : 'lab-tracks__play'}
                  title={`Сыграть «${layer.name}»`}
                  disabled={layer.notes.length === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onPlayLayer?.(layer.id);
                  }}
                >
                  {playing ? '■' : '▶'}
                </button>
                <button
                  type="button"
                  className={
                    !layer.enabled
                      ? 'lab-tracks__icon-btn lab-tracks__icon-btn--muted'
                      : 'lab-tracks__icon-btn'
                  }
                  title={layer.enabled ? 'Mute' : 'Unmute'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleMute?.(layer.id);
                  }}
                >
                  M
                </button>
                <button
                  type="button"
                  className={solo ? 'lab-tracks__icon-btn lab-tracks__icon-btn--solo' : 'lab-tracks__icon-btn'}
                  title={solo ? 'Снять solo' : 'Solo'}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSolo?.(layer.id);
                  }}
                >
                  S
                </button>
                <button
                  type="button"
                  className={
                    active ? 'lab-tracks__icon-btn lab-tracks__icon-btn--on' : 'lab-tracks__icon-btn'
                  }
                  title="Нотный стан"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectLayer?.(layer.id);
                  }}
                >
                  ♪
                </button>
                <button
                  type="button"
                  className="lab-tracks__side-clip-toggle"
                  title={
                    inClip
                      ? `Убрать «${layer.name}» из ▣${inBuf ? ' · в буфере' : ''}`
                      : `Включить «${layer.name}» в ▣${inBuf ? ' · в буфере' : ''}`
                  }
                  aria-pressed={inClip}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleClipLayer?.(layer.id);
                  }}
                >
                  <span className="lab-tracks__side-name">
                    {inClip ? '▣ ' : '□ '}
                    {inBuf ? '📋 ' : ''}
                    {layer.name}
                  </span>
                </button>
                <button
                  type="button"
                  className="lab-tracks__icon-btn lab-tracks__icon-btn--danger"
                  title="Удалить слой"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDeleteLayer?.(layer.id);
                  }}
                >
                  ✕
                </button>
              </div>
            );
          })}
          {(liveNotes.length > 0 || recording) && (
            <div
              className="lab-tracks__side-row lab-tracks__side-row--live"
              style={{ top: LANE_Y0 + (3 + layers.length) * ROW_H, height: ROW_H }}
            >
              <span className="lab-tracks__side-name">{recording ? '● REC' : 'буфер'}</span>
            </div>
          )}
        </div>

        <div
          ref={scrollRef}
          className="lab-tracks__scroll"
          onPointerDown={onScrollAreaPointerDown}
          onPointerMove={onGridPointerMove}
          onPointerUp={onGridPointerUp}
          onPointerCancel={onGridPointerUp}
          onContextMenu={openCtx}
        >
          <svg
            ref={svgRef}
            className="lab-tracks__svg"
            width={gridW}
            height={height}
            onPointerDown={onScrollAreaPointerDown}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerUp}
            onContextMenu={openCtx}
          >
            {/* Линейка тактов — отдельная высокая полоса над дорожками */}
            <rect
              x={0}
              y={0}
              width={Math.max(0, gridW - 4)}
              height={RULER_H}
              className="lab-tracks__ruler"
              style={{ cursor: onSelectionChange ? 'col-resize' : onSeek ? 'ew-resize' : 'default' }}
              onPointerDown={onRulerPointerDown}
            />
            <text x={6} y={18} className="lab-tracks__ruler-hint" style={{ pointerEvents: 'none' }}>
              тяни такты · Alt+клик / ◀ playhead — seek
            </text>

            {Array.from({ length: bars * 4 + 1 }, (_, i) => {
              const x = xAt(i * beatSec);
              const bar = i % 4 === 0;
              return (
                <line
                  key={`g-${i}`}
                  x1={x}
                  x2={x}
                  y1={RULER_H}
                  y2={height - 4}
                  className={bar ? 'lab-tracks__bar' : 'lab-tracks__beat'}
                />
              );
            })}
            {Array.from({ length: bars }, (_, b) => (
              <text
                key={`bn-${b}`}
                x={xAt(b * 4 * beatSec) + 6}
                y={20}
                className="lab-tracks__barnum"
                style={{ pointerEvents: 'none' }}
              >
                {b + 1}
              </text>
            ))}

            {hasSel ? (
              <rect
                x={selX}
                y={0}
                width={selW}
                height={RULER_H}
                className="lab-tracks__sel-ruler"
                style={{ pointerEvents: 'none' }}
              />
            ) : null}

            {drumRows.map((row, ri) => {
              const y = LANE_Y0 + ri * ROW_H;
              const stepW = Math.max(4, pxPerBeat / 4 - 1);
              const inClip = drumPicked(row.id);
              const inBuf = drumBuffered(row.id);
              return (
                <g key={row.id} opacity={row.muted ? 0.28 : 1}>
                  <rect
                    x={0}
                    y={y + 4}
                    width={gridW - 8}
                    height={ROW_H - 8}
                    className={[
                      'lab-tracks__lane',
                      inClip ? 'lab-tracks__lane--clip' : '',
                      inBuf ? 'lab-tracks__lane--buffered' : '',
                      row.muted ? 'lab-tracks__lane--muted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {hasSel && inClip ? (
                    <rect
                      x={selX}
                      y={y + 2}
                      width={selW}
                      height={ROW_H - 4}
                      className="lab-tracks__sel-row"
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null}
                  {Array.from({ length: bars * 16 }, (_, s) => {
                    const on = Boolean(row.steps[s]);
                    const at = (s / 4) * beatSec;
                    const x = xAt(at);
                    return (
                      <rect
                        key={`${row.id}-slot-${s}`}
                        x={x}
                        y={y + 7}
                        width={stepW}
                        height={ROW_H - 14}
                        rx={2}
                        fill={on ? row.color : 'rgba(148, 163, 184, 0.08)'}
                        stroke={on ? 'transparent' : 'rgba(148, 163, 184, 0.18)'}
                        strokeWidth={1}
                        opacity={on ? 0.92 : 1}
                        className={onToggleDrumStep ? 'lab-tracks__drum-hit' : undefined}
                        style={onToggleDrumStep ? { cursor: 'pointer' } : undefined}
                        onClick={
                          onToggleDrumStep
                            ? (ev) => {
                                ev.stopPropagation();
                                const bar1 = Math.floor(s / 16) + 1;
                                if (ev.shiftKey && onClearDrumBar) {
                                  onClearDrumBar(row.id, bar1);
                                  return;
                                }
                                onToggleDrumStep(row.id, s);
                              }
                            : undefined
                        }
                      />
                    );
                  })}
                </g>
              );
            })}

            {layers.map((layer, li) => {
              const y = LANE_Y0 + (3 + li) * ROW_H;
              const active = layer.id === activeLayerId;
              const inClip = layerPicked(layer.id);
              const inBuf = layerBuffered(layer.id);
              return (
                <g
                  key={layer.id}
                  className={active ? 'lab-tracks__mel-row lab-tracks__mel-row--on' : 'lab-tracks__mel-row'}
                  opacity={!layer.enabled ? 0.28 : 1}
                  onClick={() => onSelectLayer?.(layer.id)}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={0}
                    y={y + 4}
                    width={gridW - 8}
                    height={ROW_H - 8}
                    className={[
                      'lab-tracks__lane',
                      active ? 'lab-tracks__lane--active' : '',
                      inClip ? 'lab-tracks__lane--clip' : '',
                      inBuf ? 'lab-tracks__lane--buffered' : '',
                      !layer.enabled ? 'lab-tracks__lane--muted' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  />
                  {hasSel && inClip ? (
                    <rect
                      x={selX}
                      y={y + 2}
                      width={selW}
                      height={ROW_H - 4}
                      className="lab-tracks__sel-row"
                      style={{ pointerEvents: 'none' }}
                    />
                  ) : null}
                  {layer.notes.map((n, i) => {
                    const dur = n.dur ?? 0.25;
                    return (
                      <rect
                        key={`${layer.id}-${i}`}
                        x={xAt(n.at % loopSec)}
                        y={y + 7}
                        width={Math.max(4, (dur / beatSec) * pxPerBeat)}
                        height={ROW_H - 14}
                        rx={2}
                        fill={midiHue(n.midi)}
                        opacity={layer.enabled ? 0.92 : 0.35}
                      />
                    );
                  })}
                </g>
              );
            })}

            {(liveNotes.length > 0 || recording) && (
              <g>
                {(() => {
                  const y = LANE_Y0 + (3 + layers.length) * ROW_H;
                  return (
                    <>
                      <rect
                        x={0}
                        y={y + 4}
                        width={gridW - 8}
                        height={ROW_H - 8}
                        className="lab-tracks__lane lab-tracks__lane--rec"
                      />
                      {liveNotes.map((n, i) => {
                        const dur = n.dur ?? 0.25;
                        return (
                          <rect
                            key={`live-${i}`}
                            x={xAt(n.at % loopSec)}
                            y={y + 7}
                            width={Math.max(4, (dur / beatSec) * pxPerBeat)}
                            height={ROW_H - 14}
                            rx={2}
                            fill="#f472b6"
                            opacity={0.95}
                          />
                        );
                      })}
                    </>
                  );
                })()}
              </g>
            )}

            <g
              ref={playheadGRef}
              className={onSeek ? 'lab-tracks__playhead-hit' : undefined}
              onPointerDown={onPlayheadPointerDown}
              style={{ cursor: onSeek ? 'ew-resize' : undefined, pointerEvents: onSeek ? 'auto' : 'none' }}
            >
              {/* широкая зона хвата */}
              <rect x={-8} y={0} width={16} height={height} fill="transparent" />
              <line x1={0} x2={0} y1={RULER_H - 2} y2={height - 4} className="lab-tracks__playhead" />
              <polygon points="-6,4 6,4 0,14" className="lab-tracks__playhead-cap" />
            </g>
          </svg>
        </div>
      </div>

      {/* Закреплён снаружи сетки — тот же crystal-стиль студии */}
      <div className="lab-tracks__hpin" role="group" aria-label="Прокрутка тактов">
        <button
          type="button"
          className="lab-tracks__hpin-btn"
          title="Влево"
          disabled={hScroll.max <= 0 || hScroll.left <= 0}
          onClick={() => scrollByPx(-Math.max(140, hScroll.view * 0.55))}
        >
          ◀
        </button>
        <div
          ref={pinTrackRef}
          className="lab-tracks__hpin-track"
          title="Тяни бегунок"
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest('.lab-tracks__hpin-thumb')) return;
            const track = pinTrackRef.current;
            if (!track || hScrollRef.current.max <= 0) return;
            const rect = track.getBoundingClientRect();
            const hs = hScrollRef.current;
            const content = Math.max(hs.view + hs.max, 1);
            const thumbW = Math.max(28, (hs.view / content) * rect.width);
            const x = e.clientX - rect.left - thumbW / 2;
            setScrollRatio(clamp(x / Math.max(1, rect.width - thumbW), 0, 1));
          }}
        >
          <div
            ref={pinThumbRef}
            className="lab-tracks__hpin-thumb"
            style={{ width: '100%', left: '0%' }}
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              e.stopPropagation();
              const track = pinTrackRef.current;
              if (!track) return;
              const hs = hScrollRef.current;
              const trackW = track.clientWidth;
              const content = Math.max(hs.view + hs.max, 1);
              const thumbW = Math.max(28, (hs.view / content) * trackW);
              pinThumbDrag.current = {
                pointerId: e.pointerId,
                startX: e.clientX,
                startLeft: hs.left,
                trackW,
                thumbW,
              };
              (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
              setFollow(false);
            }}
            onPointerMove={onGridPointerMove}
            onPointerUp={onGridPointerUp}
            onPointerCancel={onGridPointerUp}
          />
        </div>
        <button
          type="button"
          className="lab-tracks__hpin-btn"
          title="Вправо"
          disabled={hScroll.max <= 0 || hScroll.left >= hScroll.max - 1}
          onClick={() => scrollByPx(Math.max(140, hScroll.view * 0.55))}
        >
          ▶
        </button>
      </div>

      <p className="lab-tracks__hint" title="▣ в клип · 📋 буфер · тускло = mute · ♪ = стан">
        ▣ клип · 📋 буфер · 🗑 удалить · Del · Ctrl+C/V
      </p>
      {ctxMenu && onClipAction ? (
        <div
          className="lab-tracks__ctx"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          role="menu"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => runAction('copy')}>
            <span aria-hidden>📋</span> Копировать
            <kbd className="lab-tracks__ctx-kbd">Ctrl+C</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => runAction('cut')}>
            <span aria-hidden>✂</span> Вырезать
            <kbd className="lab-tracks__ctx-kbd">Ctrl+X</kbd>
          </button>
          <button type="button" role="menuitem" disabled={!canPaste} onClick={() => runAction('paste')}>
            <span aria-hidden>📥</span> Вставить
            <kbd className="lab-tracks__ctx-kbd">Ctrl+V</kbd>
          </button>
          <button type="button" role="menuitem" onClick={() => runAction('clear')}>
            <span aria-hidden>🗑</span> Удалить содержимое
            <kbd className="lab-tracks__ctx-kbd">Del</kbd>
          </button>
          {onClearSelection ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setCtxMenu(null);
                onClearSelection();
              }}
            >
              <span aria-hidden>✕</span> Снять выделение
            </button>
          ) : null}
          <button type="button" role="menuitem" disabled={!canUndo} onClick={() => runAction('undo')}>
            <span aria-hidden>↩</span> Отменить
            <kbd className="lab-tracks__ctx-kbd">Ctrl+Z</kbd>
          </button>
        </div>
      ) : null}
    </div>
  );
}
