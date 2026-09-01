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
  const [playing, setPlaying] = useState(false);
  const [loopPlay, setLoopPlay] = useState(false);
  const [playheadAt, setPlayheadAt] = useState(0);
  const [zoom, setZoom] = useState(56);
  const [status, setStatus] = useState('Space — play/stop · клик по ноте — слушать');

  const wrapRef = useRef<HTMLDivElement | null>(null);
  const notesRef = useRef(notes);
  notesRef.current = notes;
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

  const commit = useCallback(
    (next: LabPhraseNote[]) => {
      const cleaned = next.map((n) => ({
        ...n,
        at: snapTime(n.at, stepSec),
        dur: Math.max(0.05, n.dur ?? defaultDur),
      }));
      onChange(cleaned);
      onCommit?.(cleaned);
    },
    [onChange, onCommit, stepSec, defaultDur],
  );

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
        playStartRef.current = performance.now();
        setPlayheadAt(0);
        void playLabPhrase(notesRef.current, voice);
        rafRef.current = requestAnimationFrame(tickPlayhead);
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
          ? list
          : list
              .filter((n) => n.at + (n.dur ?? defaultDur) > start)
              .map((n) => ({
                ...n,
                at: Math.max(0, n.at - start),
              }));
      if (sliced.length === 0) {
        setStatus('После курсора нот нет');
        return;
      }
      playOffsetRef.current = start;
      playStartRef.current = performance.now();
      setPlayheadAt(start);
      setPlaying(true);
      setStatus(start > 0.01 ? `▶ с ${start.toFixed(2)}с` : '▶ Играет…');
      await playLabPhrase(sliced, voice);
      rafRef.current = requestAnimationFrame(tickPlayhead);
      /* scroll playhead into view */
      const sc = wrapRef.current;
      if (sc) {
        const x = PAD_L + (start / beatSec) * pxPerBeat;
        sc.scrollLeft = Math.max(0, x - 80);
      }
    },
    [beatSec, defaultDur, pxPerBeat, stopPlayback, tickPlayhead, voice],
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
    setStatus(`Длительность → ${beats === 0.25 ? '1/16' : beats === 0.5 ? '1/8' : beats === 1 ? '1/4' : '1/2'}`);
  };

  const deleteSelected = () => {
    if (sel == null) return;
    const next = notes.filter((_, i) => i !== sel);
    setSel(null);
    commit(next);
    setStatus('Нота удалена');
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
    auditionNote(next[sel]!.midi);
  };

  const addNoteAt = (at: number, midi: number) => {
    const next = [...notes, { midi, at: snapTime(at, stepSec), dur: defaultDur }];
    commit(next);
    setSel(next.length - 1);
    auditionNote(midi);
    setStatus(`+ ${midiLabel(midi)}`);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

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
  }, [sel, notes, playing, playheadAt, beatSec, stepSec]);

  const onNotePointerDown = (e: ReactPointerEvent, index: number, mode: DragMode) => {
    e.preventDefault();
    e.stopPropagation();
    const n = notes[index];
    if (!n) return;
    setSel(index);
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
    if (d.mode === 'playhead') return;
    if (!d.moved && d.mode === 'move') {
      const n = notesRef.current[d.index];
      if (n) {
        setPlayheadAt(n.at);
        auditionNote(n.midi);
        setStatus(`♪ ${midiLabel(n.midi)}`);
      }
      return;
    }
    commit(notesRef.current);
    const n = notesRef.current[d.index];
    if (n && d.mode === 'move') auditionNote(n.midi);
  };

  const onBgPointerDown = (e: ReactPointerEvent) => {
    if ((e.target as Element).closest('.lab-staff__note')) return;
    const at = atForClientX(e.clientX);
    setPlayheadAt(at);
    setSel(null);
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
    addNoteAt(atForClientX(e.clientX), midiForY(y));
  };

  const barCount = Math.max(4, Math.ceil(maxAt / (beatSec * 4)) + 1);
  const selected = sel != null ? notes[sel] : null;
  const playheadX = xForAt(playheadAt);

  return (
    <div className="lab-staff" tabIndex={0}>
      <div className="lab-staff__head">
        <div className="lab-staff__head-left">
          <span className="lab-staff__title">{title ?? 'Нотный стан'}</span>
          <span className="lab-staff__badge">{notes.length} нот · {bpm} BPM</span>
        </div>
        <div className="lab-staff__transport">
          <button
            type="button"
            className={playing ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-on' : 'audio-sfx-lab__btn'}
            disabled={notes.length === 0}
            onClick={() => {
              if (playing) {
                stopPlayback();
                setStatus('Стоп');
              } else void startPlayback(0);
            }}
            title="Space"
          >
            {playing ? '■ Стоп' : '▶ Play'}
          </button>
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
            disabled={notes.length === 0 || playing}
            onClick={() => void startPlayback(playheadAt)}
            title="Играть с курсора"
          >
            ▶ с курсора
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
          >
            ⏮
          </button>
        </div>
      </div>

      <div className="lab-staff__tools">
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
          onClick={() => addNoteAt(playheadAt, selected?.midi ?? 72)}
        >
          + Нота
        </button>
        <span className="lab-staff__tools-sep" />
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
            onClick={() => setDurPreset(beats)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
          disabled={sel == null}
          onClick={deleteSelected}
        >
          Удалить
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
          ? ` · выбрано ${midiLabel(selected.midi)} @ ${selected.at.toFixed(2)}с · ${(selected.dur ?? defaultDur).toFixed(2)}с`
          : ` · курсор ${playheadAt.toFixed(2)}с`}
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

          {/* playhead */}
          <line
            x1={playheadX}
            x2={playheadX}
            y1={PAD_T - 10}
            y2={contentH - 14}
            className={playing ? 'lab-staff__playhead lab-staff__playhead--run' : 'lab-staff__playhead'}
          />
          <polygon
            points={`${playheadX - 6},${PAD_T - 12} ${playheadX + 6},${PAD_T - 12} ${playheadX},${PAD_T - 2}`}
            className="lab-staff__playhead-cap"
          />

          {notes.map((n, i) => {
            const x = xForAt(n.at);
            const y = yForMidi(n.midi);
            const dur = n.dur ?? defaultDur;
            const w = Math.max(12, (dur / beatSec) * pxPerBeat);
            const on = i === sel;
            const sharp = midiNeedsSharp(n.midi);
            const stemUp = midiToDiatonicStep(n.midi) < midiToDiatonicStep(71);
            const activeHit = playing && playheadAt >= n.at && playheadAt < n.at + dur;
            return (
              <g
                key={`${i}-${n.at}-${n.midi}`}
                className={[
                  'lab-staff__note',
                  on ? 'lab-staff__note--on' : '',
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
                  y={y - 9}
                  width={11}
                  height={18}
                  rx={2}
                  className="lab-staff__durhandle"
                  onPointerDown={(e) => onNotePointerDown(e, i, 'dur')}
                />
                {on ? (
                  <text x={x + 2} y={y + 22} className="lab-staff__nametag">
                    {midiLabel(n.midi)}
                  </text>
                ) : null}
              </g>
            );
          })}
        </svg>
      </div>

      <p className="lab-staff__hint">
        ▶ Play / Space — проиграть слой · клик по ноте — слышать · тащить — высота/время · правый край — длина ·
        двойной клик по стану — новая нота · стрелки — сдвиг · клик по фону — курсор
      </p>
    </div>
  );
}
