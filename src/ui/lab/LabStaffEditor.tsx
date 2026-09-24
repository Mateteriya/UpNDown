/**
 * Нотный стан лабы: воспроизведение, playhead, правка нот (высота/время/длительность).
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { LabPhraseNote, LabVoiceParams } from '../../audio/lab';
import { playLabNote, playLabPhrase, stopLabPhrase } from '../../audio/lab';

const PAD_L = 56;
const PAD_R = 36;
const PAD_T = 32;
const STEP_PX = 7;
const PX_PER_BEAT_MIN = 36;
const PX_PER_BEAT_MAX = 96;

const PC_TO_STEP = [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6];
const STEP_TO_PC = [0, 2, 4, 5, 7, 9, 11];
const NEEDS_ACC = [false, true, false, true, false, false, true, false, true, false, true, false];

function midiToDiatonicStep(midi: number): number {
  const m = Math.round(midi);
  const oct = Math.floor(m / 12);
  const pc = ((m % 12) + 12) % 12;
  return oct * 7 + (PC_TO_STEP[pc] ?? 0);
}

function diatonicStepToNaturalMidi(step: number): number {
  const s = Math.round(step);
  const oct = Math.floor(s / 7);
  const d = ((s % 7) + 7) % 7;
  return oct * 12 + (STEP_TO_PC[d] ?? 0);
}

function midiNeedsSharp(midi: number): boolean {
  return NEEDS_ACC[((Math.round(midi) % 12) + 12) % 12] ?? false;
}

function midiLabel(midi: number): string {
  const names = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const m = Math.round(midi);
  const pc = ((m % 12) + 12) % 12;
  const oct = Math.floor(m / 12) - 1;
  return `${names[pc]}${oct}`;
}

function snapTime(t: number, stepSec: number): number {
  return Math.max(0, Math.round(t / stepSec) * stepSec);
}

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function quantizeLocal(notes: LabPhraseNote[], bpm: number): LabPhraseNote[] {
  const beat = 60 / clamp(bpm, 80, 190);
  const step = beat / 4;
  return notes.map((n) => ({
    ...n,
    at: Math.max(0, Math.round(n.at / step) * step),
    dur: n.dur != null ? Math.max(step, Math.round(n.dur / step) * step) : n.dur,
  }));
}

function phraseEnd(notes: LabPhraseNote[], defaultDur: number, minBars: number, beatSec: number): number {
  const fromNotes = notes.reduce((m, n) => Math.max(m, n.at + (n.dur ?? defaultDur)), 0);
  return Math.max(fromNotes, minBars * 4 * beatSec);
}

/**
 * Укоротить «гудящие» хвосты:
 * — жёсткий потолок maxBeats долей;
 * — если дальше есть нота (любая) — не заезжать на неё (крошечный зазор).
 */
function trimNoteTails(
  notes: LabPhraseNote[],
  beatSec: number,
  maxBeats: number,
  defaultDur: number,
): LabPhraseNote[] {
  if (notes.length === 0) return notes;
  const maxDur = Math.max(0.05, maxBeats * beatSec);
  const sortedIdx = notes
    .map((n, i) => ({ i, at: n.at }))
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const nextAtAfter = new Array<number | null>(notes.length).fill(null);
  for (let k = 0; k < sortedIdx.length; k++) {
    const cur = sortedIdx[k]!;
    for (let m = k + 1; m < sortedIdx.length; m++) {
      const nxt = sortedIdx[m]!;
      if (nxt.at > cur.at + 1e-4) {
        nextAtAfter[cur.i] = nxt.at;
        break;
      }
    }
  }
  return notes.map((n, i) => {
    const raw = Math.max(0.05, n.dur ?? defaultDur);
    const untilNext = nextAtAfter[i];
    const capped =
      untilNext != null ? Math.min(raw, maxDur, Math.max(0.05, untilNext - n.at - 0.012)) : Math.min(raw, maxDur);
    if (Math.abs(capped - raw) < 1e-4) return n;
    return { ...n, dur: capped };
  });
}

type DragMode = 'move' | 'dur' | 'playhead';

type Props = {
  notes: LabPhraseNote[];
  bpm: number;
  voice: LabVoiceParams;
  defaultDur?: number;
  onChange: (notes: LabPhraseNote[]) => void;
  onCommit?: (notes: LabPhraseNote[]) => void;
  title?: string;
};

export function LabStaffEditor({
  notes,
  bpm,
  voice,
  defaultDur = 0.45,
  onChange,
  onCommit,
  title,
}: Props) {
  const [sel, setSel] = useState<number | null>(null);
  const [flashIdx, setFlashIdx] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [loopPlay, setLoopPlay] = useState(false);
  const [playheadAt, setPlayheadAt] = useState(0);
  const [zoom, setZoom] = useState(56);
  const [status, setStatus] = useState('Клик по стану = курсор · двойной клик = нота · Del = удалить');

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const flashTimerRef = useRef(0);
  const undoStackRef = useRef<LabPhraseNote[][]>([]);
  const undoBeforeDragRef = useRef<LabPhraseNote[] | null>(null);
  const [undoCount, setUndoCount] = useState(0);
  const playStartRef = useRef<number | null>(null);
  const playOffsetRef = useRef(0);
  const loopRef = useRef(loopPlay);
  loopRef.current = loopPlay;
  const rafRef = useRef(0);
  const dragRef = useRef<{
    mode: DragMode;
    index: number;
    originX: number;
    originY: number;
    startAt: number;
    startMidi: number;
    startDur: number;
    moved: boolean;
  } | null>(null);
  const didDragRef = useRef(false);

  const beatSec = 60 / clamp(bpm, 80, 190);
  const stepSec = beatSec / 4;
  const pxPerBeat = zoom;

  const range = useMemo(() => {
    if (notes.length === 0) return { lo: midiToDiatonicStep(60), hi: midiToDiatonicStep(81) };
    let lo = Infinity;
    let hi = -Infinity;
    for (const n of notes) {
      const s = midiToDiatonicStep(n.midi);
      lo = Math.min(lo, s);
      hi = Math.max(hi, s);
    }
    return { lo: lo - 4, hi: hi + 4 };
  }, [notes]);

  const staffSteps = useMemo(() => {
    const lines: number[] = [];
    for (let s = Math.floor(range.lo); s <= Math.ceil(range.hi); s++) {
      if (s % 2 === 0) lines.push(s);
    }
    return lines;
  }, [range]);

  const contentH = (range.hi - range.lo) * STEP_PX + PAD_T + 40;
  const maxAt = phraseEnd(notes, defaultDur, 4, beatSec);
  const contentW = PAD_L + (maxAt / beatSec) * pxPerBeat + PAD_R + 40;

  const yForMidi = useCallback(
    (midi: number) => PAD_T + (range.hi - midiToDiatonicStep(midi)) * STEP_PX,
    [range.hi],
  );

  const xForAt = useCallback((at: number) => PAD_L + (at / beatSec) * pxPerBeat, [beatSec, pxPerBeat]);

  const atForClientX = useCallback(
    (clientX: number) => {
      const svg = wrapRef.current?.querySelector('svg');
      if (!svg) return 0;
      const rect = svg.getBoundingClientRect();
      const x = clientX - rect.left;
      return snapTime(((x - PAD_L) / pxPerBeat) * beatSec, stepSec);
    },
    [beatSec, pxPerBeat, stepSec],
  );

  const midiForY = useCallback(
    (y: number) => {
      const step = range.hi - (y - PAD_T) / STEP_PX;
      return clamp(diatonicStepToNaturalMidi(step), 36, 96);
    },
    [range.hi],
  );

  const formatPos = useCallback(
    (at: number) => {
      const bar = Math.floor(at / (4 * beatSec)) + 1;
      const beat = Math.floor((at % (4 * beatSec)) / beatSec) + 1;
      return `${bar}.${beat}`;
    },
    [beatSec],
  );

  const insertMidi = useMemo(() => {
    if (sel != null && notes[sel]) return notes[sel]!.midi;
    if (notes.length > 0) return notes[notes.length - 1]!.midi;
    return 72;
  }, [sel, notes]);

  const scrollTimeIntoView = useCallback(
    (at: number) => {
      const el = wrapRef.current;
      if (!el) return;
      const x = PAD_L + (at / beatSec) * pxPerBeat;
      const left = el.scrollLeft;
      const view = el.clientWidth;
      const margin = Math.min(100, view * 0.25);
      if (x < left + margin) el.scrollLeft = Math.max(0, x - margin);
      else if (x > left + view - margin) el.scrollLeft = x - view + margin;
    },
    [beatSec, pxPerBeat],
  );

  const flashNote = useCallback((index: number) => {
    setFlashIdx(index);
    if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setFlashIdx((cur) => (cur === index ? null : cur));
      flashTimerRef.current = 0;
    }, 900);
  }, []);

  useEffect(
    () => () => {
      if (flashTimerRef.current) window.clearTimeout(flashTimerRef.current);
    },
    [],
  );

  const pushUndoSnapshot = useCallback((snapshot: LabPhraseNote[]) => {
    undoStackRef.current = [
      ...undoStackRef.current.slice(-39),
      snapshot.map((n) => ({ ...n })),
    ];
    setUndoCount(undoStackRef.current.length);
  }, []);

  const commit = useCallback(
    (next: LabPhraseNote[], opts?: { undoFrom?: LabPhraseNote[] | null }) => {
      const cleaned = next.map((n) => ({
        ...n,
        at: snapTime(n.at, stepSec),
        dur: Math.max(0.05, n.dur ?? defaultDur),
      }));
      const from = opts?.undoFrom ?? notesRef.current;
      pushUndoSnapshot(from);
      onChange(cleaned);
      onCommit?.(cleaned);
    },
    [onChange, onCommit, stepSec, defaultDur, pushUndoSnapshot],
  );

  const undoStaff = useCallback(() => {
    const prev = undoStackRef.current.pop();
    setUndoCount(undoStackRef.current.length);
    if (!prev) {
      setStatus('Нечего отменять');
      return;
    }
    onChange(prev);
    onCommit?.(prev);
    setSel(null);
    setStatus('↩ Отменено');
  }, [onChange, onCommit]);

  const stopPlayback = useCallback(() => {
    stopLabPhrase();
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    playStartRef.current = null;
    setPlaying(false);
  }, []);

  const tickPlayhead = useCallback(() => {
    if (playStartRef.current == null) return;
    const end = phraseEnd(notesRef.current, defaultDur, 1, beatSec);
    const t = playOffsetRef.current + (performance.now() - playStartRef.current) / 1000;
    if (t >= end) {
      if (loopRef.current && notesRef.current.length > 0) {
        stopLabPhrase();
        playOffsetRef.current = 0;
        setPlayheadAt(0);
        void (async () => {
          await playLabPhrase(notesRef.current, voice);
          /* Часы только после старта звука — иначе playhead уезжает на время рендера */
          playStartRef.current = performance.now();
          rafRef.current = requestAnimationFrame(tickPlayhead);
        })();
        return;
      }
      setPlayheadAt(end);
      stopPlayback();
      setStatus('Готово');
      return;
    }
    setPlayheadAt(t);
    rafRef.current = requestAnimationFrame(tickPlayhead);
  }, [beatSec, defaultDur, stopPlayback, voice]);

  const startPlayback = useCallback(
    async (fromAt = 0) => {
      const list = notesRef.current;
      if (list.length === 0) {
        setStatus('Нет нот — запиши слой или + Нота');
        return;
      }
      stopPlayback();
      const start = Math.max(0, fromAt);
      const sliced =
        start <= 0.001
          ? list.map((n) => ({ ...n }))
          : list
              .filter((n) => n.at + (n.dur ?? defaultDur) > start + 1e-4)
              .map((n) => {
                const dur = Math.max(0.05, n.dur ?? defaultDur);
                const noteStart = n.at;
                const overlap = noteStart < start;
                /* С курсора: ноты, начавшиеся раньше, подрезаем по длительности, at→0 */
                if (overlap) {
                  const remain = noteStart + dur - start;
                  return { ...n, at: 0, dur: Math.max(0.05, remain) };
                }
                return { ...n, at: Math.max(0, n.at - start) };
              });
      if (sliced.length === 0) {
        setStatus('После курсора нот нет');
        return;
      }
      playOffsetRef.current = start;
      playStartRef.current = null;
      setPlayheadAt(start);
      setPlaying(true);
      setStatus(start > 0.01 ? `▶ с ${start.toFixed(2)}с…` : '▶ С начала…');
      /* scroll сразу к точке старта */
      const sc = wrapRef.current;
      if (sc) {
        const x = PAD_L + (start / beatSec) * pxPerBeat;
        sc.scrollLeft = Math.max(0, x - 80);
      }
      try {
        await playLabPhrase(sliced, voice);
      } catch {
        stopPlayback();
        setStatus('Не удалось проиграть');
        return;
      }
      /* Важно: часы после рендера+start — иначе «с начала» прыгает на 4–5 такт */
      playStartRef.current = performance.now();
      setStatus(start > 0.01 ? `▶ с ${start.toFixed(2)}с` : '▶ С начала');
      rafRef.current = requestAnimationFrame(tickPlayhead);
    },
    [beatSec, defaultDur, pxPerBeat, stopPlayback, tickPlayhead, voice],
  );

  const trimTails = useCallback(
    (maxBeats: number) => {
      const before = notesRef.current;
      if (before.length === 0) {
        setStatus('Нет нот для обрезки');
        return;
      }
      const next = trimNoteTails(before, beatSec, maxBeats, defaultDur);
      let changed = 0;
      for (let i = 0; i < before.length; i++) {
        const a = before[i]!.dur ?? defaultDur;
        const b = next[i]!.dur ?? defaultDur;
        if (Math.abs(a - b) > 1e-3) changed += 1;
      }
      if (changed === 0) {
        setStatus(`Хвосты уже ≤ ${maxBeats} доли`);
        return;
      }
      commit(next);
      setStatus(`✂ Хвосты: укорочено ${changed} нот (макс ${maxBeats} доли)`);
    },
    [beatSec, commit, defaultDur],
  );

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const auditionNote = useCallback(
    (midi: number) => {
      void playLabNote(midi, { ...voice, duration: Math.min(voice.duration, 0.35) });
    },
    [voice],
  );

  const setDurPreset = (beats: number) => {
    if (sel == null || !notes[sel]) return;
    const next = notes.map((n, i) => (i === sel ? { ...n, dur: Math.max(0.05, beats * beatSec) } : n));
    commit(next);
    flashNote(sel);
    scrollTimeIntoView(notes[sel]!.at);
    setStatus(
      `Длительность → ${beats === 0.25 ? '1/16' : beats === 0.5 ? '1/8' : beats === 1 ? '1/4' : '1/2'} · или тяни синий край справа`,
    );
  };

  const nudgeDur = (dir: 1 | -1) => {
    if (sel == null || !notes[sel]) return;
    const cur = notes[sel]!.dur ?? defaultDur;
    const nextDur = Math.max(stepSec, snapTime(cur + dir * stepSec, stepSec) || stepSec);
    const next = notes.map((n, i) => (i === sel ? { ...n, dur: nextDur } : n));
    commit(next);
    flashNote(sel);
    setStatus(`Длительность ${(nextDur / beatSec).toFixed(2)} доли ([ / ])`);
  };

  const deleteSelected = () => {
    if (sel == null) return;
    const doomed = notes[sel];
    const next = notes.filter((_, i) => i !== sel);
    setSel(null);
    commit(next);
    setStatus(
      doomed
        ? `Удалено ${midiLabel(doomed.midi)} @ ${formatPos(doomed.at)} · Del / Backspace`
        : 'Нота удалена',
    );
  };

  const nudgeSelected = (dAt: number, dMidi: number) => {
    if (sel == null || !notes[sel]) return;
    const next = notes.map((n, i) => {
      if (i !== sel) return n;
      return {
        ...n,
        at: snapTime(Math.max(0, n.at + dAt), stepSec),
        midi: clamp(n.midi + dMidi, 36, 96),
      };
    });
    commit(next);
    scrollTimeIntoView(next[sel]!.at);
    auditionNote(next[sel]!.midi);
  };

  const addNoteAt = (at: number, midi: number, how: 'cursor' | 'click' = 'cursor') => {
    const snapped = snapTime(at, stepSec);
    const next = [...notes, { midi, at: snapped, dur: defaultDur }];
    const idx = next.length - 1;
    commit(next);
    setSel(idx);
    flashNote(idx);
    setPlayheadAt(snapped);
    scrollTimeIntoView(snapped);
    auditionNote(midi);
    setStatus(
      how === 'click'
        ? `+ ${midiLabel(midi)} на ${formatPos(snapped)} (двойной клик) · подсвечено`
        : `+ ${midiLabel(midi)} у курсора ${formatPos(snapped)} · красная линия = место вставки`,
    );
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        undoStaff();
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (playing) {
          stopPlayback();
          setStatus('Стоп');
        } else {
          void startPlayback(playheadAt > 0.05 ? playheadAt : 0);
        }
        return;
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (sel != null) {
          e.preventDefault();
          deleteSelected();
        }
        return;
      }
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        addNoteAt(playheadAt, insertMidi, 'cursor');
        return;
      }
      if (e.key === '[' || e.key === 'х' || e.key === 'Х') {
        if (sel != null) {
          e.preventDefault();
          nudgeDur(-1);
        }
        return;
      }
      if (e.key === ']' || e.key === 'ъ' || e.key === 'Ъ') {
        if (sel != null) {
          e.preventDefault();
          nudgeDur(1);
        }
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nudgeSelected(e.shiftKey ? -beatSec : -stepSec, 0);
        return;
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        nudgeSelected(e.shiftKey ? beatSec : stepSec, 0);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        nudgeSelected(0, 1);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        nudgeSelected(0, -1);
        return;
      }
      if (e.key === 'Home') {
        e.preventDefault();
        setPlayheadAt(0);
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sel, notes, playing, playheadAt, beatSec, stepSec, insertMidi, undoStaff]);

  const onNotePointerDown = (e: ReactPointerEvent, index: number, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const n = notes[index];
    if (!n) return;
    /* Снимок до drag — иначе commit увидит уже сдвинутые ноты */
    undoBeforeDragRef.current = notes.map((x) => ({ ...x }));
    setSel(index);
    flashNote(index);
    scrollTimeIntoView(n.at);
    if (mode === 'dur') {
      setStatus(`Длительность: тяни край · сейчас ${((n.dur ?? defaultDur) / beatSec).toFixed(2)} доли`);
    } else {
      setStatus(`Выбрано ${midiLabel(n.midi)} @ ${formatPos(n.at)} · Del = удалить · 1/16…1/2 = длина`);
    }
    didDragRef.current = false;
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
    dragRef.current = {
      mode,
      index,
      originX: e.clientX,
      originY: e.clientY,
      startAt: n.at,
      startMidi: n.midi,
      startDur: n.dur ?? defaultDur,
      moved: false,
    };
  };

  const onPointerMove = (e: ReactPointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.originX;
    const dy = e.clientY - d.originY;
    if (Math.abs(dx) + Math.abs(dy) > 3) {
      d.moved = true;
      didDragRef.current = true;
    }
    if (d.mode === 'playhead') {
      setPlayheadAt(atForClientX(e.clientX));
      return;
    }
    const next = notes.map((n, i) => {
      if (i !== d.index) return n;
      if (d.mode === 'dur') {
        const durPx = (d.startDur / beatSec) * pxPerBeat + dx;
        const dur = Math.max(stepSec, (durPx / pxPerBeat) * beatSec);
        return { ...n, dur: snapTime(dur, stepSec) || stepSec };
      }
      const at = snapTime(d.startAt + (dx / pxPerBeat) * beatSec, stepSec);
      const midi = midiForY(yForMidi(d.startMidi) + dy);
      return { ...n, at, midi };
    });
    onChange(next);
  };

  const onPointerUp = () => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (d.mode === 'playhead') {
      undoBeforeDragRef.current = null;
      return;
    }
    if (!d.moved && d.mode === 'move') {
      undoBeforeDragRef.current = null;
      const n = notesRef.current[d.index];
      if (n) {
        setPlayheadAt(n.at);
        auditionNote(n.midi);
        setStatus(`♪ ${midiLabel(n.midi)}`);
      }
      return;
    }
    commit(notesRef.current, { undoFrom: undoBeforeDragRef.current });
    undoBeforeDragRef.current = null;
    const n = notesRef.current[d.index];
    if (n && d.mode === 'move') auditionNote(n.midi);
  };

  const onBgPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('.lab-staff__note')) return;
    const at = atForClientX(e.clientX);
    setPlayheadAt(at);
    setSel(null);
    scrollTimeIntoView(at);
    setStatus(`Курсор → ${formatPos(at)} · «+ у курсора» или N · двойной клик = нота здесь`);
    didDragRef.current = false;
    dragRef.current = {
      mode: 'playhead',
      index: -1,
      originX: e.clientX,
      originY: e.clientY,
      startAt: at,
      startMidi: 0,
      startDur: 0,
      moved: false,
    };
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };

  const onBgDoubleClick = (e: ReactPointerEvent) => {
    const svg = wrapRef.current?.querySelector('svg');
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const y = e.clientY - rect.top;
    addNoteAt(atForClientX(e.clientX), midiForY(y), 'click');
  };

  const barCount = Math.max(4, Math.ceil(maxAt / (beatSec * 4)) + 1);
  const selected = sel != null ? notes[sel] : null;
  const playheadX = xForAt(playheadAt);

  return (
    <div className="lab-staff" tabIndex={0}>
      <div className="lab-staff__head lab-staff__head--sticky">
        <div className="lab-staff__head-left">
          <span className="lab-staff__title">{title ?? 'Нотный стан'}</span>
          <span className="lab-staff__badge">{notes.length} нот · {bpm} BPM</span>
        </div>
        <div className="lab-staff__transport" role="toolbar" aria-label="Воспроизведение слоя">
          <button
            type="button"
            className={
              playing
                ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-on lab-staff__btn-play'
                : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on lab-staff__btn-play'
            }
            disabled={notes.length === 0}
            onClick={() => {
              if (playing) {
                stopPlayback();
                setStatus('Стоп');
              } else void startPlayback(0);
            }}
            title="Сначала (Space)"
          >
            {playing ? '■ Стоп' : '▶ Сначала'}
          </button>
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on lab-staff__btn-play"
            disabled={notes.length === 0 || playing}
            onClick={() => void startPlayback(playheadAt)}
            title="Играть с красного курсора"
          >
            ▶ С курсора
          </button>
          <button
            type="button"
            className={
              loopPlay
                ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
            }
            onClick={() => setLoopPlay((v) => !v)}
          >
            {loopPlay ? '● Loop' : 'Loop'}
          </button>
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
            onClick={() => {
              setPlayheadAt(0);
              setStatus('Курсор → начало');
            }}
            title="Курсор в начало"
          >
            ⏮
          </button>
        </div>
      </div>

      <div className="lab-staff__tools">
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset lab-staff__btn-undo"
          disabled={undoCount <= 0}
          title="Ctrl+Z"
          onClick={undoStaff}
        >
          ↩ Отмена{undoCount > 0 ? ` (${undoCount})` : ''}
        </button>
        <span className="lab-staff__tools-sep" />
        <span className="lab-staff__tools-label" title="Укоротить гудящие длинные ноты">
          ✂ Хвосты
        </span>
        {(
          [
            [0.5, '½', 'Макс полдоли (коротко)'],
            [1, '1', 'Макс 1 доля'],
            [2, '2', 'Макс 2 доли'],
          ] as const
        ).map(([beats, label, tip]) => (
          <button
            key={`trim-${beats}`}
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset lab-staff__btn-trim"
            disabled={notes.length === 0}
            title={`${tip}. Также не заезжать на следующую ноту. ↩ отмена.`}
            onClick={() => trimTails(beats)}
          >
            {label}
          </button>
        ))}
        <span className="lab-staff__tools-sep" />
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
          title={`Вставить ${midiLabel(insertMidi)} на красном курсоре (${formatPos(playheadAt)})`}
          onClick={() => addNoteAt(playheadAt, insertMidi, 'cursor')}
        >
          + у курсора ({formatPos(playheadAt)})
        </button>
        <span className="lab-staff__tools-sep" />
        <span className="lab-staff__tools-label" title="Сначала кликни ноту">
          Длит.
        </span>
        {([
          [0.25, '1/16'],
          [0.5, '1/8'],
          [1, '1/4'],
          [2, '1/2'],
        ] as const).map(([beats, label]) => (
          <button
            key={label}
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
            disabled={sel == null}
            title={sel == null ? 'Сначала выбери ноту' : `Длительность ${label}`}
            onClick={() => setDurPreset(beats)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
          disabled={sel == null}
          title="Короче на 1/16 ([)"
          onClick={() => nudgeDur(-1)}
        >
          −
        </button>
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
          disabled={sel == null}
          title="Длиннее на 1/16 (])"
          onClick={() => nudgeDur(1)}
        >
          +
        </button>
        <span className="lab-staff__tools-sep" />
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset lab-staff__btn-del"
          disabled={sel == null}
          title="Delete / Backspace"
          onClick={deleteSelected}
        >
          ⌫ Удалить
        </button>
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
          disabled={notes.length === 0}
          onClick={() => {
            commit(quantizeLocal(notes, bpm));
            setStatus('Квант → 1/16');
          }}
        >
          Квант 1/16
        </button>
        <span className="lab-staff__tools-sep" />
        <label className="lab-staff__zoom">
          Zoom
          <input
            type="range"
            min={PX_PER_BEAT_MIN}
            max={PX_PER_BEAT_MAX}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
          />
        </label>
      </div>

      <p className="lab-staff__status">
        {status}
        {selected
          ? ` · выбрано ${midiLabel(selected.midi)} @ ${formatPos(selected.at)} · ${(selected.dur ?? defaultDur).toFixed(2)}с`
          : ` · курсор ${formatPos(playheadAt)} · высота вставки ${midiLabel(insertMidi)}`}
      </p>
      <p className="lab-staff__hint">
        Курсор (красная линия): клик по стану. Нота: «+ у курсора» / N / двойной клик. Удалить: ⌫ или Del.
        Длительность: кнопки 1/16…1/2 или тяни синий квадрат справа у выбранной ноты.
      </p>

      <div className="lab-staff__scroll" ref={wrapRef}>
        <svg
          className="lab-staff__svg"
          width={contentW}
          height={contentH}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onPointerDown={onBgPointerDown}
          onDoubleClick={onBgDoubleClick}
        >
          {staffSteps.map((s) => {
            const y = PAD_T + (range.hi - s) * STEP_PX;
            const inGClef = s >= midiToDiatonicStep(64) && s <= midiToDiatonicStep(77);
            return (
              <line
                key={s}
                x1={PAD_L - 8}
                x2={contentW - 12}
                y1={y}
                y2={y}
                className={inGClef ? 'lab-staff__line' : 'lab-staff__line lab-staff__line--ledger'}
              />
            );
          })}

          <text x={8} y={PAD_T + (range.hi - midiToDiatonicStep(71)) * STEP_PX + 10} className="lab-staff__clef">
            𝄞
          </text>

          {Array.from({ length: barCount + 1 }, (_, b) => {
            const x = xForAt(b * 4 * beatSec);
            return (
              <g key={`bar-${b}`}>
                <line x1={x} x2={x} y1={PAD_T - 4} y2={contentH - 18} className="lab-staff__barline" />
                <text x={x + 4} y={PAD_T - 8} className="lab-staff__barnum">
                  {b + 1}
                </text>
              </g>
            );
          })}

          {Array.from({ length: barCount * 4 }, (_, i) => {
            if (i % 4 === 0) return null;
            const x = xForAt(i * beatSec);
            return (
              <line key={`beat-${i}`} x1={x} x2={x} y1={PAD_T} y2={contentH - 18} className="lab-staff__beatline" />
            );
          })}

          {/* playhead + место вставки — cap со static points (без template в attribute) */}
          <g transform={`translate(${Number.isFinite(playheadX) ? playheadX : 0},0)`}>
            <rect
              x={-1.5}
              y={PAD_T - 10}
              width={3}
              height={contentH - PAD_T - 4}
              className="lab-staff__insert-glow"
            />
            <line
              x1={0}
              x2={0}
              y1={PAD_T - 10}
              y2={contentH - 14}
              className={playing ? 'lab-staff__playhead lab-staff__playhead--run' : 'lab-staff__playhead'}
            />
            <polygon
              points={`-6,${PAD_T - 12} 6,${PAD_T - 12} 0,${PAD_T - 2}`}
              className="lab-staff__playhead-cap"
            />
          </g>
          <ellipse
            cx={playheadX + 4}
            cy={yForMidi(insertMidi)}
            rx={7}
            ry={5}
            transform={`rotate(-18 ${playheadX + 4} ${yForMidi(insertMidi)})`}
            className="lab-staff__insert-ghost"
          />
          <text x={playheadX + 14} y={yForMidi(insertMidi) + 4} className="lab-staff__insert-label">
            {midiLabel(insertMidi)}
          </text>

          {notes.map((n, i) => {
            const x = xForAt(n.at);
            const y = yForMidi(n.midi);
            const dur = n.dur ?? defaultDur;
            const w = Math.max(12, (dur / beatSec) * pxPerBeat);
            const on = i === sel;
            const flash = i === flashIdx;
            const sharp = midiNeedsSharp(n.midi);
            const stemUp = midiToDiatonicStep(n.midi) < midiToDiatonicStep(71);
            const activeHit = playing && playheadAt >= n.at && playheadAt < n.at + dur;
            return (
              <g
                key={`${i}-${n.at}-${n.midi}`}
                className={[
                  'lab-staff__note',
                  on ? 'lab-staff__note--on' : '',
                  flash ? 'lab-staff__note--flash' : '',
                  activeHit ? 'lab-staff__note--hit' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {(midiToDiatonicStep(n.midi) <= midiToDiatonicStep(60) ||
                  midiToDiatonicStep(n.midi) >= midiToDiatonicStep(79)) && (
                  <line x1={x - 10} x2={x + 14} y1={y} y2={y} className="lab-staff__ledger-short" />
                )}
                {sharp ? (
                  <text x={x - 16} y={y + 4} className="lab-staff__acc">
                    ♯
                  </text>
                ) : null}
                <ellipse
                  cx={x + 4}
                  cy={y}
                  rx={8}
                  ry={5.5}
                  transform={`rotate(-18 ${x + 4} ${y})`}
                  className="lab-staff__head"
                  onPointerDown={(e) => onNotePointerDown(e, i, 'move')}
                />
                <line
                  x1={stemUp ? x + 11 : x - 3}
                  x2={stemUp ? x + 11 : x - 3}
                  y1={y}
                  y2={stemUp ? y - 24 : y + 24}
                  className="lab-staff__stem"
                  onPointerDown={(e) => onNotePointerDown(e, i, 'move')}
                />
                <rect
                  x={x + 12}
                  y={y - 3}
                  width={Math.max(4, w - 10)}
                  height={6}
                  rx={2}
                  className="lab-staff__durbar"
                  onPointerDown={(e) => onNotePointerDown(e, i, 'move')}
                />
                <rect
                  x={x + Math.max(16, w)}
                  y={on ? y - 11 : y - 9}
                  width={on ? 14 : 11}
                  height={on ? 22 : 18}
                  rx={2}
                  className="lab-staff__durhandle"
                  onPointerDown={(e) => onNotePointerDown(e, i, 'dur')}
                />
                {on ? (
                  <text x={x + 2} y={y + 22} className="lab-staff__nametag">
                    {midiLabel(n.midi)} · {((n.dur ?? defaultDur) / beatSec).toFixed(2)}д
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}
