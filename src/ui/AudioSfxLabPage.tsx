/**
 * Лаборатория SFX: чеклист звуков игры → клавиатура → сохранить в партию.
 * Маршрут: /audio-sfx-lab (sessionStorage updown-devMode=1).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { installGameSample } from '../audio';
import type { SoundId } from '../audio/types';
import {
  downloadWav,
  encodeWavMono,
  LAB_CHORD_MAX,
  LAB_INSTRUMENTS,
  DEFAULT_LAB_BEAT,
  DEFAULT_LAB_MUSIC_PAD,
  LAB_BEAT_PRESETS,
  LAB_BEAT_RHYTHMS,
  LAB_BEAT_STEPS_PER_BAR,
  LAB_MUSIC_SLOTS,
  listLabSlotIds,
  loadLabPresets,
  loadLabSlot,
  midiToHz,
  playGameSample,
  playLabChord,
  playLabNote,
  playLabPhrase,
  playWavBytes,
  renderChordSamples,
  renderNoteSamples,
  renderPhraseSamples,
  renderMusicBedSamples,
  mixBeatIntoSamples,
  resumeLabAudio,
  saveLabSlot,
  startLabBeat,
  startLabMusicBed,
  stopAllLabNotes,
  stopLabBeat,
  stopLabPhrase,
  setLabBeatParams,
  setLabMusicPlaybackVolume,
  previewLabDrumHit,
  isLabBeatOn,
  upsertLabPreset,
  writeSlotToDevServer,
  writeMusicSlotToDevServer,
  barPatternFromRhythm,
  cloneBeatPattern,
  emptyBeatPattern,
  normalizeBeatPattern,
  patternsEqual,
  resolveDisplayPattern,
  createMelodyLayer,
  quantizePhraseNotes,
  wrapPhraseNotesToLoop,
  getLabBeatLoopDurationSec,
  getLabBeatRecordEpochMs,
  saveLabSessionDraft,
  loadLabSessionDraft,
  deleteLabPreset,
  type LabBeatBarPattern,
  type LabBeatLaneId,
  type LabBeatParams,
  type LabMelodyLayer,
  type LabMusicPadParams,
  type LabMusicSlotId,
  type LabPhraseNote,
  type LabPreset,
  type LabVoiceParams,
} from '../audio/lab';
import { LabStaffEditor } from './lab/LabStaffEditor';
import { LabTracksTimeline } from './lab/LabTracksTimeline';
import { LabKnob } from './lab/studio/LabKnob';
import { LabResizeHandle } from './lab/studio/LabResizeHandle';
import {
  DEFAULT_LAB_PANEL_LAYOUT,
  LAB_PANEL_LIMITS,
  clampLabPanelLayout,
  loadLabPanelLayout,
  saveLabPanelLayout,
  type LabPanelLayout,
} from './lab/studio/labPanelLayout';
import {
  GAME_SOUND_TASKS,
  loadLabDoneMap,
  setLabDone,
  voiceFromSuggest,
  type GameSoundTask,
} from '../audio/lab/gameSoundTasks';
import '../styles/audio-sfx-lab.css';
import '../styles/audio-lab-studio.css';

const BASE_MIDI_C = 48;
/** Три октавы хроматики на экране (C…B × 3). */
const CHROMATIC_KEYS = 36;

const NOTE_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'] as const;
const BLACK_PCS = new Set([1, 3, 6, 8, 10]);

function midiLabel(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12]!;
  const oct = Math.floor(midi / 12) - 1;
  return `${name}${oct}`;
}

type WhiteKey = { midi: number; label: string; short: string; pcHint: string };
type BlackKey = { midi: number; label: string; short: string; afterWhite: number; pcHint: string };

function buildKeyboard(rootMidi: number): { whites: WhiteKey[]; blacks: BlackKey[] } {
  const whites: WhiteKey[] = [];
  const blacks: BlackKey[] = [];
  for (let i = 0; i < CHROMATIC_KEYS; i++) {
    const midi = rootMidi + i;
    const pc = ((midi % 12) + 12) % 12;
    const short = NOTE_NAMES[pc]!;
    const label = midiLabel(midi);
    const pcHint = OFFSET_TO_PC[i] ?? '';
    if (BLACK_PCS.has(pc)) {
      blacks.push({ midi, label, short, afterWhite: whites.length - 1, pcHint });
    } else {
      whites.push({ midi, label, short, pcHint });
    }
  }
  return { whites, blacks };
}

const KEY_TO_OFFSET: Record<string, number> = {
  z: 0,
  s: 1,
  x: 2,
  d: 3,
  c: 4,
  v: 5,
  g: 6,
  b: 7,
  h: 8,
  n: 9,
  j: 10,
  m: 11,
  q: 12,
  '2': 13,
  w: 14,
  '3': 15,
  e: 16,
  r: 17,
  '5': 18,
  t: 19,
  '6': 20,
  y: 21,
  '7': 22,
  u: 23,
  i: 24,
  '9': 25,
  o: 26,
  '0': 27,
  p: 28,
  '[': 29,
  '=': 30,
  ']': 31,
  '\\': 32,
  k: 33,
  l: 34,
  ';': 35,
};

/** Физические клавиши — работает и на русской раскладке (KeyZ = я). */
const CODE_TO_OFFSET: Record<string, number> = {
  KeyZ: 0,
  KeyS: 1,
  KeyX: 2,
  KeyD: 3,
  KeyC: 4,
  KeyV: 5,
  KeyG: 6,
  KeyB: 7,
  KeyH: 8,
  KeyN: 9,
  KeyJ: 10,
  KeyM: 11,
  KeyQ: 12,
  Digit2: 13,
  KeyW: 14,
  Digit3: 15,
  KeyE: 16,
  KeyR: 17,
  Digit5: 18,
  KeyT: 19,
  Digit6: 20,
  KeyY: 21,
  Digit7: 22,
  KeyU: 23,
  KeyI: 24,
  Digit9: 25,
  KeyO: 26,
  Digit0: 27,
  KeyP: 28,
  BracketLeft: 29,
  Equal: 30,
  BracketRight: 31,
  Backslash: 32,
  KeyK: 33,
  KeyL: 34,
  Semicolon: 35,
};

const OFFSET_TO_PC: Record<number, string> = {};
for (const [key, off] of Object.entries(KEY_TO_OFFSET)) {
  OFFSET_TO_PC[off] = key.length === 1 ? key.toUpperCase() : key;
}

function pianoOffset(e: KeyboardEvent): number | undefined {
  return CODE_TO_OFFSET[e.code] ?? KEY_TO_OFFSET[e.key.toLowerCase()];
}

function isTextTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type !== 'range' && type !== 'button' && type !== 'checkbox' && type !== 'radio';
}

function holdId(e: KeyboardEvent): string {
  return e.code || e.key.toLowerCase();
}

type Props = { onBack: () => void };

function SliderRow({
  label,
  value,
  min,
  max,
  step,
  onChange,
  format,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
  format?: (n: number) => string;
}) {
  return (
    <label className="audio-sfx-lab__slider">
      <span className="audio-sfx-lab__slider-label">
        {label}
        <em>{format ? format(value) : value.toFixed(2)}</em>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function keyClass(kind: 'white' | 'black', lit: boolean, inChord: boolean): string {
  const base = `audio-sfx-lab__key audio-sfx-lab__key--${kind}`;
  const on = lit ? ' audio-sfx-lab__key--lit' : '';
  const ch = inChord ? ' audio-sfx-lab__key--chord' : '';
  return `${base}${on}${ch}`;
}

type SlotDraft = {
  voice: LabVoiceParams;
  phrase: LabPhraseNote[];
  chordMidis: number[];
  lastMidi: number;
};

export function AudioSfxLabPage({ onBack }: Props) {
  const [activeId, setActiveId] = useState<SoundId>(GAME_SOUND_TASKS[0]!.id);
  const activeTask = useMemo(
    () => GAME_SOUND_TASKS.find((t) => t.id === activeId) ?? GAME_SOUND_TASKS[0]!,
    [activeId],
  );

  const [voice, setVoice] = useState<LabVoiceParams>(() => voiceFromSuggest(GAME_SOUND_TASKS[0]?.suggest));
  const [activeMidi, setActiveMidi] = useState<Set<number>>(() => new Set());
  const [recording, setRecording] = useState(false);
  const [phrase, setPhrase] = useState<LabPhraseNote[]>([]);
  const recordT0 = useRef<number | null>(null);
  const [doneMap, setDoneMap] = useState(() => loadLabDoneMap());
  const [savedMap, setSavedMap] = useState<Partial<Record<SoundId, boolean>>>({});
  const [fileExists, setFileExists] = useState<Partial<Record<SoundId, boolean>>>({});
  const [status, setStatus] = useState('Выбери звук слева и сыграй его на клавиатуре');
  const [chordMode, setChordMode] = useState(false);
  const [chordMidis, setChordMidis] = useState<number[]>([]);
  const [beatOn, setBeatOn] = useState(false);
  const [bakeBeatInFile, setBakeBeatInFile] = useState(true);
  const [beatParams, setBeatParams] = useState<LabBeatParams>(() => ({ ...DEFAULT_LAB_BEAT }));
  const [labMode, setLabMode] = useState<'sfx' | 'music'>('sfx');
  const [musicSlot, setMusicSlot] = useState<LabMusicSlotId>('table_bed');
  const [musicPad, setMusicPad] = useState<LabMusicPadParams>(() => ({ ...DEFAULT_LAB_MUSIC_PAD }));
  const [melodyLayers, setMelodyLayers] = useState<LabMelodyLayer[]>([]);
  const [staffLayerId, setStaffLayerId] = useState<string | null>(null);
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [focusArrange, setFocusArrange] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [presetKindTab, setPresetKindTab] = useState<'all' | 'sfx' | 'music'>('all');
  const [presetsTick, setPresetsTick] = useState(0);
  const [slotsOpen, setSlotsOpen] = useState(true);
  const [playingLayerId, setPlayingLayerId] = useState<string | null>(null);
  const playingLayerTimerRef = useRef(0);
  const arrangeStackRef = useRef<HTMLDivElement | null>(null);
  const [panelLayout, setPanelLayout] = useState<LabPanelLayout>(() => loadLabPanelLayout());
  const panelLayoutRef = useRef(panelLayout);
  panelLayoutRef.current = panelLayout;

  const patchPanelLayout = useCallback((patch: Partial<LabPanelLayout>, persist = false) => {
    setPanelLayout((prev) => {
      const next = clampLabPanelLayout({ ...prev, ...patch });
      panelLayoutRef.current = next;
      if (persist) saveLabPanelLayout(next);
      return next;
    });
  }, []);

  const persistPanelLayout = useCallback(() => {
    saveLabPanelLayout(panelLayoutRef.current);
  }, []);

  const resetPanelKey = useCallback(
    (key: keyof LabPanelLayout) => {
      patchPanelLayout({ [key]: DEFAULT_LAB_PANEL_LAYOUT[key] }, true);
    },
    [patchPanelLayout],
  );

  const clampKeyboardPx = useCallback((desired: number) => {
    /* Клавиатура растёт вниз по документу; страница скроллится — не ужимаем workspace до нуля. */
    return Math.max(0, Math.min(desired, LAB_PANEL_LIMITS.KEYBOARD_MAX));
  }, []);

  const clampTracksPx = useCallback((desired: number) => {
    return Math.max(
      LAB_PANEL_LIMITS.TRACKS_MIN,
      Math.min(desired, LAB_PANEL_LIMITS.TRACKS_MAX),
    );
  }, []);

  const musicPadRef = useRef(musicPad);
  musicPadRef.current = musicPad;
  const melodyLayersRef = useRef(melodyLayers);
  melodyLayersRef.current = melodyLayers;

  const heldKeys = useRef<Set<string>>(new Set());
  const keyboardRef = useRef<HTMLDivElement | null>(null);
  const glideActiveRef = useRef(false);
  const lastGlideMidiRef = useRef<number | null>(null);
  const voiceRef = useRef(voice);
  voiceRef.current = voice;
  const recordingRef = useRef(recording);
  recordingRef.current = recording;
  const chordModeRef = useRef(chordMode);
  chordModeRef.current = chordMode;
  const chordMidisRef = useRef(chordMidis);
  chordMidisRef.current = chordMidis;
  const lastPlayedMidiRef = useRef(BASE_MIDI_C + 12);
  const phraseRef = useRef(phrase);
  phraseRef.current = phrase;
  const activeIdRef = useRef(activeId);
  activeIdRef.current = activeId;
  const beatOnRef = useRef(beatOn);
  beatOnRef.current = beatOn;
  const beatParamsRef = useRef(beatParams);
  beatParamsRef.current = beatParams;
  const bakeBeatInFileRef = useRef(bakeBeatInFile);
  bakeBeatInFileRef.current = bakeBeatInFile;
  const draftsRef = useRef<Partial<Record<SoundId, SlotDraft>>>({});
  const selectGenRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const map: Partial<Record<SoundId, boolean>> = {};
      await Promise.all(
        GAME_SOUND_TASKS.map(async (t) => {
          try {
            const res = await fetch(`/audio/sfx/${t.id}.wav?labprobe=1`, { cache: 'no-store' });
            map[t.id] = res.ok;
          } catch {
            map[t.id] = false;
          }
        }),
      );
      const savedIds = await listLabSlotIds();
      const saved: Partial<Record<SoundId, boolean>> = {};
      for (const id of savedIds) saved[id] = true;
      if (!cancelled) {
        setFileExists(map);
        setSavedMap(saved);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => () => stopLabBeat(), []);

  const applyDraft = useCallback((draft: SlotDraft) => {
    setVoice(voiceFromSuggest(draft.voice));
    setPhrase(draft.phrase);
    setChordMidis(draft.chordMidis);
    chordMidisRef.current = draft.chordMidis;
    lastPlayedMidiRef.current = draft.lastMidi;
  }, []);

  const snapshotDraft = useCallback((): SlotDraft => {
    return {
      voice: { ...voiceRef.current },
      phrase: [...phraseRef.current],
      chordMidis: [...chordMidisRef.current],
      lastMidi: lastPlayedMidiRef.current,
    };
  }, []);

  const selectTask = useCallback(
    (task: GameSoundTask) => {
      const prevId = activeIdRef.current;
      draftsRef.current[prevId] = snapshotDraft();
      setActiveId(task.id);
      setRecording(false);
      recordT0.current = null;
      const gen = ++selectGenRef.current;
      void (async () => {
        const saved = await loadLabSlot(task.id);
        if (gen !== selectGenRef.current) return;
        if (saved) {
          applyDraft({
            voice: saved.voice,
            phrase: saved.phrase,
            chordMidis: saved.chordMidis,
            lastMidi: saved.lastMidi,
          });
          setStatus(`Выбрано: ${task.title} · ваш сохранённый звук — слева ▶`);
          return;
        }
        const session = draftsRef.current[task.id];
        if (session) {
          applyDraft(session);
          setStatus(`Выбрано: ${task.title} · черновик этой сессии`);
          return;
        }
        const preset = loadLabPresets().find((p) => p.slotHint === task.id);
        if (preset) {
          applyDraft({
            voice: voiceFromSuggest(preset.voice),
            phrase: preset.phrase ?? [],
            chordMidis: preset.chordMidis ?? [],
            lastMidi: preset.lastMidi ?? BASE_MIDI_C + 12,
          });
          setStatus(`Выбрано: ${task.title} · подставлен ваш черновик`);
          return;
        }
        setVoice(voiceFromSuggest(task.suggest));
        setPhrase([]);
        setChordMidis([]);
        chordMidisRef.current = [];
        setStatus(`Выбрано: ${task.title}`);
      })();
    },
    [applyDraft, snapshotDraft],
  );

  const patchVoice = useCallback((patch: Partial<LabVoiceParams>) => {
    setVoice((v) => voiceFromSuggest({ ...v, ...patch }));
  }, []);

  const liveVoice = useCallback((): LabVoiceParams => voiceFromSuggest(voiceRef.current), []);

  const playMelodyLayer = useCallback(
    async (layerId: string) => {
      const layer = melodyLayersRef.current.find((l) => l.id === layerId);
      if (!layer) return;
      if (playingLayerId === layerId) {
        stopLabPhrase();
        window.clearTimeout(playingLayerTimerRef.current);
        setPlayingLayerId(null);
        setStatus(`Стоп «${layer.name}»`);
        return;
      }
      if (layer.notes.length === 0) {
        setStatus(`«${layer.name}» пустой`);
        return;
      }
      setStaffLayerId(layerId);
      const v = liveVoice();
      const layered: LabVoiceParams = {
        ...v,
        volume: Math.min(1, Math.max(0.05, v.volume * layer.gain)),
      };
      stopLabPhrase();
      window.clearTimeout(playingLayerTimerRef.current);
      setPlayingLayerId(layerId);
      const dur = await playLabPhrase(layer.notes, layered);
      setStatus(`▶ «${layer.name}» · ${dur.toFixed(1)}с`);
      playingLayerTimerRef.current = window.setTimeout(() => {
        setPlayingLayerId((cur) => (cur === layerId ? null : cur));
      }, Math.max(200, dur * 1000 + 80));
    },
    [liveVoice, playingLayerId],
  );

  const rootMidi = BASE_MIDI_C + voice.octave * 12;
  const rootMidiRef = useRef(rootMidi);
  rootMidiRef.current = rootMidi;
  const { whites: whiteKeys, blacks: blackKeys } = useMemo(() => buildKeyboard(rootMidi), [rootMidi]);
  const whiteCount = whiteKeys.length;

  const setPressed = useCallback((midi: number, on: boolean) => {
    setActiveMidi((prev) => {
      const next = new Set(prev);
      if (on) next.add(midi);
      else next.delete(midi);
      return next;
    });
  }, []);

  const triggerNote = useCallback(
    async (midi: number) => {
      const v = liveVoice();
      voiceRef.current = v;
      await resumeLabAudio();
      if (recordingRef.current) {
        if (recordT0.current == null) {
          const epoch = labMode === 'music' ? getLabBeatRecordEpochMs() : null;
          recordT0.current = epoch ?? performance.now();
        }
        const atRaw = (performance.now() - recordT0.current) / 1000;
        const bpm = beatParamsRef.current.bpm;
        const step = 60 / Math.min(190, Math.max(80, bpm)) / 4;
        const at = Math.max(0, Math.round(atRaw / step) * step);
        setPhrase((p) => [...p, { midi, at, dur: v.duration }]);
      }
      void playLabNote(midi, v);
      lastPlayedMidiRef.current = midi;
      setStatus(`${activeTask.title}: ${midiLabel(midi)} · ${Math.round(midiToHz(midi, v.detuneCents))} Hz`);
    },
    [activeTask.title, liveVoice, labMode],
  );

  const playCurrentChord = useCallback(async (midis: number[], recordHit: boolean) => {
    if (midis.length === 0) return;
    const v = liveVoice();
    voiceRef.current = v;
    await resumeLabAudio();
    if (recordHit && recordingRef.current) {
      if (recordT0.current == null) {
        const epoch = labMode === 'music' ? getLabBeatRecordEpochMs() : null;
        recordT0.current = epoch ?? performance.now();
      }
      const atRaw = (performance.now() - recordT0.current) / 1000;
      const bpm = beatParamsRef.current.bpm;
      const step = 60 / Math.min(190, Math.max(80, bpm)) / 4;
      const at = Math.max(0, Math.round(atRaw / step) * step);
      setPhrase((p) => [...p, ...midis.map((midi) => ({ midi, at, dur: v.duration }))]);
    }
    lastPlayedMidiRef.current = midis[0]!;
    const names = midis.map(midiLabel).join(' + ');
    setStatus(`Аккорд ${midis.length}/${LAB_CHORD_MAX}: ${names}`);
    await playLabChord(midis, v);
  }, [liveVoice, labMode]);

  const toggleChordNote = useCallback(
    (midi: number) => {
      const prev = chordMidisRef.current;
      let next: number[];
      if (prev.includes(midi)) {
        next = prev.filter((m) => m !== midi);
      } else if (prev.length >= LAB_CHORD_MAX) {
        setStatus(`В аккорде максимум ${LAB_CHORD_MAX} нот`);
        return;
      } else {
        next = [...prev, midi].sort((a, b) => a - b);
      }
      chordMidisRef.current = next;
      setChordMidis(next);
      if (next.length > 0) void playCurrentChord(next, false);
      else setStatus('Аккорд пуст — нажми 2–8 клавиш');
    },
    [playCurrentChord],
  );

  const midiFromPoint = useCallback((clientX: number, clientY: number): number | null => {
    for (const el of document.elementsFromPoint(clientX, clientY)) {
      if (!(el instanceof HTMLElement)) continue;
      const host = el.closest('[data-lab-midi]');
      if (host instanceof HTMLElement) {
        const midi = Number(host.dataset.labMidi);
        if (Number.isFinite(midi)) return midi;
      }
    }
    return null;
  }, []);

  const endGlide = useCallback((pointerId?: number) => {
    const last = lastGlideMidiRef.current;
    if (last != null) setPressed(last, false);
    glideActiveRef.current = false;
    lastGlideMidiRef.current = null;
    const node = keyboardRef.current;
    if (node && pointerId != null) {
      try {
        if (node.hasPointerCapture(pointerId)) node.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
    }
  }, [setPressed]);

  const onKeyboardPointerDown = useCallback(
    (e: ReactPointerEvent, midi: number) => {
      e.preventDefault();
      e.stopPropagation();
      setPressed(midi, true);
      lastGlideMidiRef.current = midi;
      keyboardRef.current?.setPointerCapture(e.pointerId);
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.blur();
      if (chordModeRef.current) {
        toggleChordNote(midi);
        return;
      }
      glideActiveRef.current = true;
      void triggerNote(midi);
    },
    [setPressed, toggleChordNote, triggerNote],
  );

  const onKeyboardPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (chordModeRef.current || !glideActiveRef.current) return;
      const midi = midiFromPoint(e.clientX, e.clientY);
      if (midi == null || midi === lastGlideMidiRef.current) return;
      if (lastGlideMidiRef.current != null) setPressed(lastGlideMidiRef.current, false);
      lastGlideMidiRef.current = midi;
      setPressed(midi, true);
      void triggerNote(midi);
    },
    [midiFromPoint, setPressed, triggerNote],
  );

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const off = pianoOffset(e);
      if (off == null) return;
      if (isTextTypingTarget(e.target)) return;
      const id = holdId(e);
      if (heldKeys.current.has(id)) return;
      e.preventDefault();
      heldKeys.current.add(id);
      const midi = rootMidiRef.current + off;
      setPressed(midi, true);
      if (chordModeRef.current) {
        toggleChordNote(midi);
        return;
      }
      void triggerNote(midi);
    };
    const onUp = (e: KeyboardEvent) => {
      const id = holdId(e);
      heldKeys.current.delete(id);
      const off = pianoOffset(e);
      if (off == null) return;
      setPressed(rootMidiRef.current + off, false);
    };
    const onBlur = () => {
      heldKeys.current.clear();
      setActiveMidi(new Set());
    };
    window.addEventListener('keydown', onDown, true);
    window.addEventListener('keyup', onUp, true);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown, true);
      window.removeEventListener('keyup', onUp, true);
      window.removeEventListener('blur', onBlur);
    };
  }, [setPressed, toggleChordNote, triggerNote]);

  useEffect(() => {
    heldKeys.current.clear();
    setActiveMidi(new Set());
  }, [rootMidi]);

  const hearGame = useCallback(
    async (id: SoundId = activeTask.id) => {
      await resumeLabAudio();
      const ok = await playGameSample(id);
      setStatus(
        ok
          ? `Игра (штатный файл): ${id}.wav`
          : `Нет ${id}.wav в public/audio/sfx — проверь npm run dev`,
      );
    },
    [activeTask.id],
  );

  const hearSaved = useCallback(
    async (id: SoundId = activeTask.id) => {
      await resumeLabAudio();
      const slot = await loadLabSlot(id);
      if (slot) {
        const raw = slot.wav instanceof Blob ? await slot.wav.arrayBuffer() : slot.wav;
        const ok = await playWavBytes(raw);
        setStatus(ok ? `Ваш сохранённый: ${id}` : `Не удалось проиграть ${id}`);
        return;
      }
      setStatus(`Своего сохранённого для ${id} ещё нет — сначала «Сохранить в игру»`);
    },
    [activeTask.id],
  );

  const hearMine = useCallback(async () => {
    const v = liveVoice();
    voiceRef.current = v;
    await resumeLabAudio();
    if (phrase.length > 0) {
      const samples = renderPhraseSamples(phrase, v);
      if (bakeBeatInFile && samples.length > 0) {
        const mixed = mixBeatIntoSamples(samples, { ...DEFAULT_LAB_BEAT, ...beatParamsRef.current });
        await playWavBytes(encodeWavMono(mixed));
        setStatus(`Черновик: фраза + бит (${(mixed.length / 44100).toFixed(1)}с) — как в сохранении`);
      } else {
        await playLabPhrase(phrase, v);
        setStatus('Черновик: только фраза (включи «Бит в WAV»)');
      }
      return;
    }
    if (chordMidis.length >= 2) {
      await playCurrentChord(chordMidis, false);
      return;
    }
    await playLabNote(lastPlayedMidiRef.current, v);
    setStatus(`Черновик: ${midiLabel(lastPlayedMidiRef.current)} с текущими крутилками`);
  }, [phrase, chordMidis, playCurrentChord, liveVoice]);

  const startRecord = () => {
    /* В музыке не трогаем уже сохранённые слои — пишем во временный буфер phrase. */
    setPhrase([]);
    phraseRef.current = [];
    if (labMode === 'music' && beatOnRef.current) {
      const epoch = getLabBeatRecordEpochMs();
      recordT0.current = epoch ?? performance.now();
      setRecording(true);
      setStatus(
        `● REC слой ${melodyLayersRef.current.length + 1} — синхрон с петлёй (1/16). Играй в ритм, потом ■ Стоп`,
      );
      return;
    }
    recordT0.current = null;
    setRecording(true);
    setStatus(
      labMode === 'music'
        ? `Запись слоя ${melodyLayersRef.current.length + 1}… (включи «Петля» для синка с битом)`
        : `Запись для «${activeTask.title}»…`,
    );
  };

  const restartMusicLoop = useCallback(
    (layers: LabMelodyLayer[] = melodyLayersRef.current, pad: LabMusicPadParams = musicPadRef.current) => {
      if (!beatOnRef.current || labMode !== 'music') return;
      void startLabMusicBed(
        beatParamsRef.current,
        pad,
        [],
        voiceRef.current,
        lastPlayedMidiRef.current,
        layers,
      );
    },
    [labMode],
  );

  const stopRecord = () => {
    setRecording(false);
    let notes = [...phraseRef.current];
    const n = notes.length;

    if (labMode === 'music') {
      if (n === 0) {
        setStatus('Запись пуста — слой не добавлен');
        return;
      }
      const bpm = beatParamsRef.current.bpm;
      const loopDur =
        getLabBeatLoopDurationSec() ||
        ((beatParamsRef.current.bars === 8 || beatParamsRef.current.bars === 16
          ? beatParamsRef.current.bars
          : 4) *
          4 *
          60) /
          bpm;
      notes = quantizePhraseNotes(wrapPhraseNotesToLoop(notes, loopDur), bpm, 4);
      const layer = createMelodyLayer(notes, melodyLayersRef.current.length + 1, voiceRef.current.duration);
      const next = [...melodyLayersRef.current, layer];
      melodyLayersRef.current = next;
      setMelodyLayers(next);
      setStaffLayerId(layer.id);
      setPhrase([]);
      phraseRef.current = [];
      recordT0.current = null;

      const padNext = {
        ...musicPadRef.current,
        melody: Math.max(musicPadRef.current.melody, 0.55),
      };
      musicPadRef.current = padNext;
      setMusicPad(padNext);

      if (beatOnRef.current) {
        restartMusicLoop(next, padNext);
        setStatus(`«${layer.name}»: ${n} нот, квант 1/16 + синхрон с петлёй`);
      } else {
        setStatus(`Слой «${layer.name}» сохранён (${n} нот). Включи «Петля»`);
      }
      return;
    }

    setStatus(n ? `Записано ${n} нот для «${activeTask.title}»` : 'Запись пуста');
  };

  const mixForExport = useCallback(
    (samples: Float32Array): Float32Array => {
      if (samples.length === 0 || !bakeBeatInFile) return samples;
      const params = { ...DEFAULT_LAB_BEAT, ...beatParamsRef.current };
      return mixBeatIntoSamples(samples, params);
    },
    [bakeBeatInFile],
  );

  const saveToGame = async () => {
    const id = activeTask.id;
    const v = liveVoice();
    voiceRef.current = v;
    setVoice(v);
    const wantPhrase = activeTask.shape === 'phrase';
    const hasPhrase = phrase.length > 0;
    const hasChord = chordMidis.length >= 2;
    if (wantPhrase && !hasPhrase && !hasChord) {
      setStatus('Нужна фраза (● Запись) или аккорд из 2–8 нот, потом «Сохранить в игру»');
      return;
    }
    const samples = hasPhrase
      ? renderPhraseSamples(phrase, v)
      : hasChord
        ? renderChordSamples(chordMidis, v)
        : renderNoteSamples(lastPlayedMidiRef.current, v);
    if (samples.length === 0) {
      setStatus('Пустой звук — сыграй ноту или аккорд');
      return;
    }
    const mixed = mixForExport(samples);
    const beatBaked = bakeBeatInFile && mixed.length >= samples.length;

    const wav = encodeWavMono(mixed);
    const wavForDisk = wav.slice(0);
    const phraseToStore = hasPhrase ? phrase : hasChord ? chordMidis.map((midi) => ({ midi, at: 0 })) : [];
    draftsRef.current[id] = snapshotDraft();

    try {
      await saveLabSlot({
        id,
        wav: wav.slice(0),
        voice: v,
        phrase: phraseToStore,
        chordMidis: hasChord ? [...chordMidis] : [],
        lastMidi: lastPlayedMidiRef.current,
        savedAt: Date.now(),
      });
    } catch {
      setStatus('Не удалось сохранить в браузере (IndexedDB)');
      return;
    }

    upsertLabPreset({
      name: activeTask.title,
      kind: 'sfx',
      voice: v,
      phrase: phraseToStore,
      slotHint: id,
      chordMidis: hasChord ? [...chordMidis] : [],
      lastMidi: lastPlayedMidiRef.current,
    });
    setPresetsTick((x) => x + 1);
    setDoneMap(setLabDone(id, true));
    setSavedMap((prev) => ({ ...prev, [id]: true }));

    const wroteFile = await writeSlotToDevServer(id, wavForDisk);
    await installGameSample(id, wavForDisk.slice(0));
    if (wroteFile) {
      setFileExists((prev) => ({ ...prev, [id]: true }));
      setStatus(
        beatBaked
          ? `В игре: ${id}.wav (мелодия + бит, ${(mixed.length / 44100).toFixed(1)}с). «Мой сохранённый» — проверка.`
          : `В игре: ${id}.wav (только мелодия). Включи «Бит в WAV» для микса.`,
      );
    } else {
      setStatus(
        beatBaked
          ? `В браузере: ${id} + бит (IndexedDB). «Мой сохранённый» ▶. На диск — перезапусти dev.`
          : `В браузере: ${id}. Включи «Бит в WAV» для микса.`,
      );
    }
  };

  const downloadCopy = async () => {
    const id = activeTask.id;
    const v = liveVoice();
    voiceRef.current = v;
    const hasPhrase = phrase.length > 0;
    const hasChord = chordMidis.length >= 2;
    const samples = hasPhrase
      ? renderPhraseSamples(phrase, v)
      : hasChord
        ? renderChordSamples(chordMidis, v)
        : renderNoteSamples(lastPlayedMidiRef.current, v);
    if (samples.length === 0) {
      setStatus('Нечего скачивать — сыграй ноту или аккорд');
      return;
    }
    const mixed = mixForExport(samples);
    const beatBaked = bakeBeatInFile && mixed.length >= samples.length;
    downloadWav(mixed, `${id}.wav`);
    setStatus(
      beatBaked
        ? `Скачано ${id}.wav с битом (${(mixed.length / 44100).toFixed(1)}с)`
        : `Скачано ${id}.wav — только мелодия`,
    );
  };

  const doneCount = GAME_SOUND_TASKS.filter((t) => doneMap[t.id]).length;
  const chordLabel =
    chordMidis.length > 0 ? chordMidis.map(midiLabel).join(' + ') : 'пусто — тыкни 2–8 клавиш';

  const applyBeatParams = useCallback((next: LabBeatParams, presetLabel?: string, presetId?: string | null) => {
    const prev = beatParamsRef.current;
    const merged: LabBeatParams = {
      ...DEFAULT_LAB_BEAT,
      ...next,
      pattern: normalizeBeatPattern(
        next.pattern ?? (next.rhythm === 'custom' ? prev.pattern : undefined) ?? barPatternFromRhythm(next.rhythm ?? prev.rhythm),
      ),
    };
    const contentSame =
      prev.bass === merged.bass &&
      prev.kick === merged.kick &&
      prev.hats === merged.hats &&
      prev.snare === merged.snare &&
      prev.industrial === merged.industrial &&
      prev.crackle === merged.crackle &&
      prev.bpm === merged.bpm &&
      prev.depth === merged.depth &&
      prev.rhythm === merged.rhythm &&
      (prev.bars ?? 4) === (merged.bars ?? 4) &&
      patternsEqual(prev.pattern, merged.pattern);

    setBeatParams(merged);
    beatParamsRef.current = merged;
    if (presetId !== undefined) setActivePresetId(presetId);
    else if (!presetLabel) setActivePresetId(null);

    if (beatOnRef.current) {
      if (labMode === 'music') {
        if (contentSame) {
          setLabMusicPlaybackVolume(merged.volume);
          return;
        }
        void startLabMusicBed(merged, musicPadRef.current, [], voiceRef.current, lastPlayedMidiRef.current, melodyLayersRef.current).then(
          () => {
            setStatus(presetLabel ? `Музыка: ${presetLabel}` : 'Петля обновлена');
          },
        );
      } else {
        void (async () => {
          if (isLabBeatOn()) await setLabBeatParams(merged);
          else await startLabBeat(merged);
          setStatus(presetLabel ? `Бит: ${presetLabel}` : 'Бит обновлён');
        })();
      }
    } else if (presetLabel) {
      setStatus(`Пресет «${presetLabel}» — включи «Бит» / «Петля»`);
    }
  }, [labMode]);

  const displayPattern = useMemo(() => resolveDisplayPattern(beatParams), [beatParams]);

  const applyCustomPattern = useCallback(
    (pattern: LabBeatBarPattern, label = 'свой ритм', bumpLevels = true) => {
      const prev = beatParamsRef.current;
      let kick = prev.kick;
      let snare = prev.snare;
      let hats = prev.hats;
      if (bumpLevels) {
        if (pattern.kick.some(Boolean) && kick < 0.05) kick = 0.85;
        if (pattern.snare.some(Boolean) && snare < 0.05) snare = 0.7;
        if (pattern.hats.some(Boolean) && hats < 0.05) hats = 0.55;
      }

      /* Правка сетки сама включает петлю — иначе клетки «горят», а звука нет. */
      if (!beatOnRef.current) {
        setBeatOn(true);
        beatOnRef.current = true;
        if (labMode === 'sfx') {
          setBakeBeatInFile(true);
          bakeBeatInFileRef.current = true;
        }
      }

      applyBeatParams(
        { ...prev, rhythm: 'custom', pattern: cloneBeatPattern(pattern), kick, snare, hats },
        label,
        null,
      );
    },
    [applyBeatParams, labMode],
  );

  const togglePatternStep = useCallback(
    (lane: LabBeatLaneId, step: number) => {
      const prev = beatParamsRef.current;
      const display = resolveDisplayPattern(prev);
      const level = prev[lane] ?? 0;
      const lit = Boolean(display[lane][step]);

      /* Шаблон + слой на 0: клетка уже «горит», но молчит — клик включает слой, не гасит шаг. */
      if (prev.rhythm !== 'custom' && level < 0.05 && lit) {
        const pattern = cloneBeatPattern(display);
        const bump = lane === 'kick' ? 0.85 : lane === 'snare' ? 0.7 : 0.55;
        if (!beatOnRef.current) {
          setBeatOn(true);
          beatOnRef.current = true;
          if (labMode === 'sfx') {
            setBakeBeatInFile(true);
            bakeBeatInFileRef.current = true;
          }
        }
        applyBeatParams(
          { ...prev, rhythm: 'custom', pattern, [lane]: bump },
          `вкл ${lane === 'kick' ? 'бочку' : lane === 'snare' ? 'снейр' : 'хеты'}`,
          null,
        );
        void previewLabDrumHit(lane, { ...prev, [lane]: bump });
        return;
      }

      const next = cloneBeatPattern(display);
      const turningOn = !next[lane][step];
      next[lane][step] = turningOn;
      applyCustomPattern(next, `сетка: ${lane} ${step + 1}`);
      if (turningOn) void previewLabDrumHit(lane);
    },
    [applyBeatParams, applyCustomPattern, labMode],
  );

  const applyMusicPad = useCallback(
    (next: LabMusicPadParams) => {
      setMusicPad(next);
      musicPadRef.current = next;
      if (beatOnRef.current && labMode === 'music') {
        void startLabMusicBed(
          beatParamsRef.current,
          next,
          [],
          voiceRef.current,
          lastPlayedMidiRef.current,
          melodyLayersRef.current,
        ).then(() => setStatus('Атмосфера обновлена'));
      }
    },
    [labMode],
  );

  const allPresets = useMemo(() => loadLabPresets(), [presetsTick]);
  const visiblePresets = useMemo(() => {
    if (presetKindTab === 'all') return allPresets;
    return allPresets.filter((p) => (p.kind ?? 'sfx') === presetKindTab);
  }, [allPresets, presetKindTab]);

  /* Восстановление черновика сессии при открытии */
  useEffect(() => {
    const draft = loadLabSessionDraft();
    if (!draft) return;
    setVoice(draft.voice);
    voiceRef.current = draft.voice;
    setBeatParams(draft.beat);
    beatParamsRef.current = draft.beat;
    setMusicPad(draft.pad);
    musicPadRef.current = draft.pad;
    setMelodyLayers(draft.layers ?? []);
    melodyLayersRef.current = draft.layers ?? [];
    setMusicSlot(draft.musicSlot);
    setLabMode(draft.labMode);
    setStaffLayerId(draft.staffLayerId);
    setBakeBeatInFile(draft.bakeBeat);
    setFocusArrange(!!draft.focusArrange);
    setKeyboardOpen(!!draft.keyboardOpen);
    setStatus('Восстановлен черновик студии');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Автосохранение черновика */
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveLabSessionDraft({
        voice,
        beat: beatParams,
        pad: musicPad,
        layers: melodyLayers,
        musicSlot,
        labMode,
        staffLayerId,
        beatOn,
        bakeBeat: bakeBeatInFile,
        focusArrange,
        keyboardOpen,
      });
    }, 600);
    return () => window.clearTimeout(t);
  }, [
    voice,
    beatParams,
    musicPad,
    melodyLayers,
    musicSlot,
    labMode,
    staffLayerId,
    beatOn,
    bakeBeatInFile,
    focusArrange,
    keyboardOpen,
  ]);

  const applyMusicPreset = useCallback(
    (preset: LabPreset) => {
      if (preset.voice) {
        setVoice(preset.voice);
        voiceRef.current = preset.voice;
      }
      if (preset.beat) {
        setBeatParams(preset.beat);
        beatParamsRef.current = preset.beat;
      }
      if (preset.pad) {
        setMusicPad(preset.pad);
        musicPadRef.current = preset.pad;
      }
      if (preset.layers) {
        setMelodyLayers(preset.layers);
        melodyLayersRef.current = preset.layers;
      }
      if (preset.musicSlot) setMusicSlot(preset.musicSlot);
      setLabMode('music');
      setStaffLayerId(preset.session?.staffLayerId ?? preset.layers?.[0]?.id ?? null);
      if (preset.session?.keyboardOpen != null) setKeyboardOpen(preset.session.keyboardOpen);
      if (preset.session?.focusArrange != null) setFocusArrange(preset.session.focusArrange);
      setActivePresetId(preset.id);
      setPresetKindTab('all');
      setStatus(`Пресет «${preset.name}» загружен`);
      const wantLoop = beatOnRef.current || !!preset.session?.beatOn;
      if (wantLoop) {
        setBeatOn(true);
        beatOnRef.current = true;
        void startLabMusicBed(
          beatParamsRef.current,
          musicPadRef.current,
          [],
          voiceRef.current,
          lastPlayedMidiRef.current,
          melodyLayersRef.current,
        ).then((ok) => {
          if (!ok) {
            setBeatOn(false);
            beatOnRef.current = false;
            setStatus(`Пресет «${preset.name}» — петля не стартовала`);
          } else {
            setStatus(`Пресет «${preset.name}» · ● Петля`);
          }
        });
      }
    },
    [],
  );

  const saveMusicBed = async () => {
    const v = liveVoice();
    voiceRef.current = v;
    const samples = renderMusicBedSamples({
      beat: { ...DEFAULT_LAB_BEAT, ...beatParamsRef.current },
      pad: musicPadRef.current,
      layers: melodyLayersRef.current,
      voice: v,
      rootMidi: lastPlayedMidiRef.current,
      applyVolume: true,
    });
    if (samples.length === 0) {
      setStatus('Пустая петля');
      return;
    }
    const wav = encodeWavMono(samples);
    const wavForDisk = wav.slice(0);
    downloadWav(samples, `${musicSlot}.wav`);
    const wrote = await writeMusicSlotToDevServer(musicSlot, wavForDisk);
    const slotLabel = LAB_MUSIC_SLOTS.find((s) => s.id === musicSlot)?.label ?? musicSlot;
    const d = new Date();
    const stamp = `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
    const saved = upsertLabPreset({
      name: `${slotLabel} · ${stamp}`,
      kind: 'music',
      voice: v,
      phrase: [],
      musicSlot,
      beat: { ...beatParamsRef.current },
      pad: { ...musicPadRef.current },
      layers: melodyLayersRef.current.map((l) => ({
        ...l,
        notes: l.notes.map((n) => ({ ...n })),
      })),
      session: {
        staffLayerId,
        labMode: 'music',
        beatOn: beatOnRef.current,
        bakeBeat: bakeBeatInFile,
        focusArrange,
        keyboardOpen,
      },
    });
    setActivePresetId(saved.id);
    setPresetsTick((x) => x + 1);
    setStatus(
      wrote
        ? `Сохранено ${musicSlot}.wav + пресет «${saved.name}»`
        : `Скачано ${musicSlot}.wav + пресет «${saved.name}» (на диск — перезапусти npm run dev)`,
    );
  };

  const renderLabKeyboardDrawer = (dock: boolean) => (
    <div
      className={
        dock
          ? 'audio-sfx-lab__keyboard-drawer audio-sfx-lab__keyboard-drawer--dock'
          : 'audio-sfx-lab__keyboard-drawer'
      }
      style={
        dock
          ? {
              height: keyboardOpen
                ? Math.max(clampKeyboardPx(panelLayout.keyboardPx), 160)
                : 44,
              flex: '0 0 auto',
            }
          : undefined
      }
    >
      <button
        type="button"
        className="audio-sfx-lab__keyboard-drawer-toggle"
        onClick={() => {
          const next = !keyboardOpen;
          setKeyboardOpen(next);
          if (dock && next && panelLayoutRef.current.keyboardPx < 140) {
            patchPanelLayout({ keyboardPx: Math.max(DEFAULT_LAB_PANEL_LAYOUT.keyboardPx, 200) }, true);
          }
        }}
      >
        {keyboardOpen
          ? dock
            ? '▾ Клавиатура · тяни границу выше'
            : '▾ Клавиатура'
          : '▸ Клавиатура (открыть)'}
      </button>
      <div
        className={
          keyboardOpen
            ? 'audio-sfx-lab__keyboard-drawer-body'
            : 'audio-sfx-lab__keyboard-drawer-body audio-sfx-lab__keyboard-drawer-body--closed'
        }
      >
<div className="audio-sfx-lab__keys-head">
            <h2>Клавиатура</h2>
            <span className="audio-sfx-lab__keys-hint">
              {chordMode
                ? 'Тыкай клавиши — они копятся в аккорд'
                : 'ПК: Z–M / Q–U / I–P — три октавы; клавиши на экране нажимаются вместе с кнопками'}
            </span>
          </div>

          <div className="audio-sfx-lab__chord-bar">
            <button
              type="button"
              className={
                beatOn
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-on'
                  : 'audio-sfx-lab__btn'
              }
              title={
                labMode === 'music'
                  ? 'Фоновая петля: бит + атмосфера + мелодия'
                  : 'Процедурный бит под клавиши. Если включён — попадёт в сохранённый WAV'
              }
              onClick={() => {
                const next = !beatOn;
                setBeatOn(next);
                if (next) {
                  if (labMode === 'sfx') setBakeBeatInFile(true);
                  const start =
                    labMode === 'music'
                      ? startLabMusicBed(
                          beatParamsRef.current,
                          musicPadRef.current,
                          [],
                          voiceRef.current,
                          lastPlayedMidiRef.current,
                          melodyLayersRef.current,
                        )
                      : startLabBeat(beatParamsRef.current);
                  void start.then((ok) => {
                    if (!ok) {
                      setBeatOn(false);
                      setStatus(labMode === 'music' ? 'Петля не запустилась' : 'Бит не запустился');
                    } else {
                      setStatus(
                        labMode === 'music'
                          ? 'Петля включена — крути атмосферу / такты, потом «Сохранить музыку»'
                          : 'Бит включён — «Бит в WAV» включит его в сохранение',
                      );
                    }
                  });
                } else {
                  stopLabBeat();
                  setStatus(labMode === 'music' ? 'Петля выключена' : 'Бит выключен');
                }
              }}
            >
              {beatOn
                ? labMode === 'music'
                  ? '● Петля вкл'
                  : '● Бит вкл'
                : labMode === 'music'
                  ? 'Петля'
                  : 'Бит'}
            </button>
            <button
              type="button"
              className={
                chordMode
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--chord-on'
                  : 'audio-sfx-lab__btn'
              }
              onClick={() => setChordMode((on) => !on)}
            >
              {chordMode ? '● Аккорд вкл' : 'Аккорд'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn"
              disabled={chordMidis.length < 2}
              onClick={() => void playCurrentChord(chordMidis, true)}
            >
              ▶ Сыграть аккорд ({chordMidis.length}/{LAB_CHORD_MAX})
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn"
              disabled={chordMidis.length === 0}
              onClick={() => {
                chordMidisRef.current = [];
                setChordMidis([]);
                setStatus('Аккорд очищен');
              }}
            >
              Сбросить аккорд
            </button>
            <span className="audio-sfx-lab__chord-notes">{chordLabel}</span>
          </div>

          <div
            ref={keyboardRef}
            className={
              chordMode
                ? 'audio-sfx-lab__keyboard audio-sfx-lab__keyboard--chord'
                : 'audio-sfx-lab__keyboard'
            }
            style={{ ['--lab-white-count' as string]: String(whiteCount) }}
            aria-label="Фортепианная клавиатура"
            onPointerMove={onKeyboardPointerMove}
            onPointerUp={(e) => endGlide(e.pointerId)}
            onPointerCancel={(e) => endGlide(e.pointerId)}
            onLostPointerCapture={() => endGlide()}
          >
            <div className="audio-sfx-lab__whites">
              {whiteKeys.map((k) => (
                <button
                  key={k.midi}
                  type="button"
                  tabIndex={-1}
                  data-lab-midi={k.midi}
                  className={keyClass('white', activeMidi.has(k.midi), chordMidis.includes(k.midi))}
                  aria-label={k.label}
                  title={k.label}
                  onPointerDown={(e) => onKeyboardPointerDown(e, k.midi)}
                >
                  <span className="audio-sfx-lab__key-pc">{k.pcHint}</span>
                  <span className="audio-sfx-lab__key-foot">
                    <span className="audio-sfx-lab__key-name">{k.short}</span>
                    <span className="audio-sfx-lab__key-oct">{k.label.replace(k.short, '')}</span>
                  </span>
                </button>
              ))}
            </div>
            <div className="audio-sfx-lab__blacks">
              {blackKeys.map((k) => {
                const leftPct = ((k.afterWhite + 1) / whiteCount) * 100;
                return (
                  <button
                    key={k.midi}
                    type="button"
                    tabIndex={-1}
                    data-lab-midi={k.midi}
                    className={keyClass('black', activeMidi.has(k.midi), chordMidis.includes(k.midi))}
                    style={{ left: `${leftPct}%` }}
                    aria-label={k.label}
                    title={k.label}
                    onPointerDown={(e) => onKeyboardPointerDown(e, k.midi)}
                  >
                    <span className="audio-sfx-lab__key-pc audio-sfx-lab__key-pc--black">{k.pcHint}</span>
                    <span className="audio-sfx-lab__key-name audio-sfx-lab__key-name--black">{k.short}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="audio-sfx-lab__transport">
            {!recording ? (
              <button type="button" className="audio-sfx-lab__btn audio-sfx-lab__btn--rec" onClick={startRecord}>
                {labMode === 'music' ? '● Запись мелодии (+слой)' : '● Запись фразы'}
              </button>
            ) : (
              <button type="button" className="audio-sfx-lab__btn audio-sfx-lab__btn--rec-on" onClick={stopRecord}>
                ■ Стоп ({phrase.length}
                {labMode === 'music' ? ` → слой ${melodyLayers.length + 1}` : ''})
              </button>
            )}
            <button
              type="button"
              className="audio-sfx-lab__btn"
              onClick={() => {
                const v = liveVoice();
                voiceRef.current = v;
                if (labMode === 'music') {
                  const enabled = melodyLayersRef.current.filter((l) => l.enabled && l.notes.length > 0);
                  if (enabled.length === 0) {
                    setStatus('Нет включённых слоёв мелодии');
                    return;
                  }
                  let maxLen = 0;
                  const parts = enabled.map((l) => {
                    const s = renderPhraseSamples(l.notes, v);
                    maxLen = Math.max(maxLen, s.length);
                    return { s, g: l.gain };
                  });
                  const out = new Float32Array(maxLen);
                  for (const { s, g } of parts) {
                    for (let i = 0; i < s.length; i++) out[i]! += s[i]! * g;
                  }
                  void playWavBytes(encodeWavMono(out));
                  setStatus(`Превью ${enabled.length} слой(ёв) мелодии`);
                  return;
                }
                const samples = renderPhraseSamples(phrase, v);
                if (bakeBeatInFile && samples.length > 0) {
                  const mixed = mixBeatIntoSamples(samples, { ...DEFAULT_LAB_BEAT, ...beatParamsRef.current });
                  void playWavBytes(encodeWavMono(mixed));
                  setStatus(`Фраза + бит (${(mixed.length / 44100).toFixed(1)}с)`);
                } else {
                  void playLabPhrase(phrase, v);
                  setStatus('Фраза без бита');
                }
              }}
              disabled={labMode === 'music' ? melodyLayers.every((l) => !l.enabled) : !phrase.length}
            >
              {labMode === 'music' ? '▶ Мелодии' : '▶ Фраза'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn"
              onClick={() => {
                if (labMode === 'music') {
                  setPhrase([]);
                  phraseRef.current = [];
                  recordT0.current = null;
                  setStatus('Буфер записи очищен (слои на месте)');
                  return;
                }
                setPhrase([]);
                recordT0.current = null;
              }}
              disabled={labMode === 'music' ? false : !phrase.length}
            >
              {labMode === 'music' ? 'Сброс буфера' : 'Очистить'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn"
              onClick={() => {
                stopAllLabNotes();
                setStatus('Стоп');
              }}
            >
              Тишина
            </button>
          </div>

          {phrase.length > 0 ? (
            <ol className="audio-sfx-lab__phrase">
              {phrase.map((n, i) => (
                <li key={`${n.at}-${n.midi}-${i}`}>
                  <span>{midiLabel(n.midi)}</span>
                  <em>{n.at.toFixed(2)} с</em>
                </li>
              ))}
            </ol>
          ) : activeTask.shape === 'phrase' ? (
            <p className="audio-sfx-lab__hint">
              Для этого пункта: запиши фразу или собери аккорд, потом «Сохранить в игру».
            </p>
          ) : (
            <p className="audio-sfx-lab__hint">
              Сыграй ноту, аккорд (2–8 клавиш) или фразу и нажми «Сохранить в игру».
            </p>
          )}
      </div>
    </div>
  );

  return (
    <div className="audio-sfx-lab audio-sfx-lab--studio">
      <header className="audio-sfx-lab__top">
        <button type="button" className="audio-sfx-lab__back" onClick={onBack}>
          ← В приложение
        </button>
        <div className="audio-sfx-lab__titles">
          <h1 className="audio-sfx-lab__title">Студия Up&Down</h1>
          <div className="audio-sfx-lab__mode-tabs">
            <button
              type="button"
              className={
                labMode === 'sfx'
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                  : 'audio-sfx-lab__btn'
              }
              onClick={() => {
                stopLabBeat();
                setBeatOn(false);
                setLabMode('sfx');
                setPresetKindTab('all');
                setStatus('Режим SFX — звуки партии');
              }}
            >
              SFX
            </button>
            <button
              type="button"
              className={
                labMode === 'music'
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                  : 'audio-sfx-lab__btn'
              }
              onClick={() => {
                stopLabBeat();
                setBeatOn(false);
                setLabMode('music');
                setBakeBeatInFile(false);
                setPresetKindTab('all');
                setBeatParams((p) => {
                  const next = { ...p, bars: (p.bars >= 8 ? p.bars : 8) as 4 | 8 | 16 };
                  beatParamsRef.current = next;
                  return next;
                });
                setStatus('Студия музыки — дорожки + стан');
              }}
            >
              Музыка
            </button>
          </div>
          <div className="audio-sfx-lab__transport-row">
            <button
              type="button"
              className={beatOn ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-on' : 'audio-sfx-lab__btn'}
              onClick={() => {
                const next = !beatOn;
                setBeatOn(next);
                if (next) {
                  if (labMode === 'sfx') setBakeBeatInFile(true);
                  const start =
                    labMode === 'music'
                      ? startLabMusicBed(
                          beatParamsRef.current,
                          musicPadRef.current,
                          [],
                          voiceRef.current,
                          lastPlayedMidiRef.current,
                          melodyLayersRef.current,
                        )
                      : startLabBeat(beatParamsRef.current);
                  void start.then((ok) => {
                    if (!ok) {
                      setBeatOn(false);
                      setStatus('Не запустилось');
                    } else setStatus(labMode === 'music' ? '● Петля' : '● Бит');
                  });
                } else {
                  stopLabBeat();
                  setStatus('Стоп');
                }
              }}
            >
              {beatOn ? (labMode === 'music' ? '■ Петля' : '■ Бит') : labMode === 'music' ? '▶ Петля' : '▶ Бит'}
            </button>
            <button
              type="button"
              className={recording ? 'audio-sfx-lab__btn audio-sfx-lab__btn--rec-on' : 'audio-sfx-lab__btn audio-sfx-lab__btn--rec'}
              onClick={() => (recording ? stopRecord() : startRecord())}
            >
              {recording ? `■ REC (${phrase.length})` : '● REC'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__btn--primary"
              onClick={() => void (labMode === 'music' ? saveMusicBed() : saveToGame())}
            >
              {labMode === 'music' ? 'Сохранить трек' : 'Сохранить в игру'}
            </button>
            <button
              type="button"
              className={
                focusArrange
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                  : 'audio-sfx-lab__btn'
              }
              onClick={() => setFocusArrange((v) => !v)}
              title="Скрыть боковые панели"
            >
              {focusArrange ? '● Focus' : 'Focus'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn"
              title="Сбросить размеры панелей"
              onClick={() => {
                const next = { ...DEFAULT_LAB_PANEL_LAYOUT };
                setPanelLayout(next);
                panelLayoutRef.current = next;
                saveLabPanelLayout(next);
                setStatus('Размеры панелей сброшены');
              }}
            >
              Сброс панелей
            </button>
            <label className="audio-sfx-lab__hint" style={{ margin: 0, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              BPM
              <input
                type="number"
                min={80}
                max={190}
                value={Math.round(beatParams.bpm)}
                onChange={(e) => applyBeatParams({ ...beatParamsRef.current, bpm: Number(e.target.value) || 120 })}
                style={{ width: 56 }}
              />
            </label>
          </div>
        </div>
        <p className="audio-sfx-lab__status" role="status">
          {status}
        </p>
      </header>

      <div className="audio-sfx-lab__context">
        <span>
          <strong>{labMode === 'music' ? 'Музыка' : 'SFX'}</strong>
          {' · '}
          {labMode === 'music'
            ? LAB_MUSIC_SLOTS.find((s) => s.id === musicSlot)?.label
            : activeTask.title}
        </span>
        <span>
          {LAB_INSTRUMENTS.find((i) => i.id === voice.instrument)?.label ?? voice.instrument}
          {voice.instrument === 'ebass' ? ' · упругость' : ''}
        </span>
        <span>{Math.round(beatParams.bpm)} BPM</span>
        {labMode === 'music' && staffLayerId ? (
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
            onClick={() => {
              const id = staffLayerId;
              const bpm = beatParamsRef.current.bpm;
              const next = melodyLayersRef.current.map((l) =>
                l.id === id ? { ...l, notes: quantizePhraseNotes(l.notes, bpm, 4) } : l,
              );
              melodyLayersRef.current = next;
              setMelodyLayers(next);
              restartMusicLoop(next);
              setStatus('Квант 1/16');
            }}
          >
            Квант 1/16
          </button>
        ) : null}
      </div>

      <div
        className={
          focusArrange
            ? 'audio-sfx-lab__studio-body audio-sfx-lab__studio-body--focus'
            : 'audio-sfx-lab__studio-body'
        }
        style={
          {
            ['--studio-rail' as string]: `${panelLayout.libraryPx}px`,
            ['--studio-inspect' as string]: `${panelLayout.inspectorPx}px`,
            ['--studio-presets-frac' as string]: String(panelLayout.presetsFrac),
            ['--studio-tracks-h' as string]: `${panelLayout.tracksPx}px`,
            ['--studio-keyboard-h' as string]: `${
              keyboardOpen ? Math.max(panelLayout.keyboardPx, 120) : 0
            }px`,
          } as CSSProperties
        }
      >
        <aside className="audio-sfx-lab__studio-library">
          <div
            className="audio-sfx-lab__lib-section audio-sfx-lab__lib-section--presets"
            style={{ flex: `${panelLayout.presetsFrac} 1 0` }}
          >
            <div className="audio-sfx-lab__lib-section-head">
              <h2 className="audio-sfx-lab__lib-title">Пресеты</h2>
              <span className="audio-sfx-lab__lib-count">{allPresets.length}</span>
            </div>
            <div className="audio-sfx-lab__lib-tabs" role="tablist" aria-label="Тип пресета">
              <button
                type="button"
                className={
                  presetKindTab === 'all'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                }
                onClick={() => setPresetKindTab('all')}
              >
                Все
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'sfx'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                }
                onClick={() => setPresetKindTab('sfx')}
              >
                SFX
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'music'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                }
                onClick={() => setPresetKindTab('music')}
              >
                Музыка
              </button>
            </div>
            <ul className="audio-sfx-lab__preset-list">
              {visiblePresets.length === 0 ? (
                <li className="audio-sfx-lab__hint">
                  Пока пусто — «Сохранить в игру» / «Сохранить трек» добавит сюда.
                </li>
              ) : (
                visiblePresets.map((p) => {
                  const kind = p.kind ?? 'sfx';
                  return (
                    <li key={p.id} className="audio-sfx-lab__preset-item">
                      <button
                        type="button"
                        className={
                          activePresetId === p.id
                            ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                            : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                        }
                        onClick={() => {
                          if (kind === 'music') applyMusicPreset(p);
                          else {
                            setVoice(p.voice);
                            voiceRef.current = p.voice;
                            setPhrase(p.phrase ?? []);
                            if (p.chordMidis?.length) setChordMidis(p.chordMidis);
                            setLabMode('sfx');
                            setActivePresetId(p.id);
                            setStatus(`SFX пресет «${p.name}»`);
                          }
                        }}
                      >
                        <span className="audio-sfx-lab__preset-name">{p.name}</span>
                        <span
                          className={
                            kind === 'music'
                              ? 'audio-sfx-lab__preset-kind audio-sfx-lab__preset-kind--music'
                              : 'audio-sfx-lab__preset-kind'
                          }
                        >
                          {kind === 'music' ? 'муз' : 'sfx'}
                        </span>
                      </button>
                      <button
                        type="button"
                        className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__preset-del"
                        title="Удалить"
                        onClick={() => {
                          deleteLabPreset(p.id);
                          setPresetsTick((x) => x + 1);
                          if (activePresetId === p.id) setActivePresetId(null);
                        }}
                      >
                        ×
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>

          <LabResizeHandle
            axis="y"
            label="Граница пресеты / слоты"
            onDrag={(dy) => {
              const lib = document.querySelector('.audio-sfx-lab__studio-library') as HTMLElement | null;
              const h = lib?.clientHeight ?? 400;
              if (h < 80) return;
              patchPanelLayout({
                presetsFrac: panelLayoutRef.current.presetsFrac + dy / h,
              });
            }}
            onDragEnd={persistPanelLayout}
            onReset={() => resetPanelKey('presetsFrac')}
          />

          <div
            className="audio-sfx-lab__lib-section audio-sfx-lab__lib-section--slots"
            style={{ flex: `${Math.max(0.08, 1 - panelLayout.presetsFrac)} 1 0` }}
          >
            <button
              type="button"
              className="audio-sfx-lab__lib-section-toggle"
              onClick={() => setSlotsOpen((v) => !v)}
            >
              <h2 className="audio-sfx-lab__lib-title">{labMode === 'music' ? 'Слоты музыки' : 'Слоты SFX'}</h2>
              <span>{slotsOpen ? '▾' : '▸'}</span>
            </button>
            {slotsOpen ? (
          <div className="audio-sfx-lab__grid audio-sfx-lab__grid--tasks">
        <section className="audio-sfx-lab__panel audio-sfx-lab__panel--tasks">
          {labMode === 'music' ? (
            <>
              <h2>Фоновые слоты</h2>
              <p className="audio-sfx-lab__hint" style={{ marginTop: 0 }}>
                Собери петлю справа → «Сохранить музыку» → <code>public/audio/music/</code>
              </p>
              <ol className="audio-sfx-lab__task-list">
                {LAB_MUSIC_SLOTS.map((slot, i) => (
                  <li key={slot.id} className="audio-sfx-lab__task-row">
                    <button
                      type="button"
                      className={
                        musicSlot === slot.id
                          ? 'audio-sfx-lab__task audio-sfx-lab__task--on'
                          : 'audio-sfx-lab__task'
                      }
                      onClick={() => {
                        setMusicSlot(slot.id);
                        setStatus(`Слот музыки: ${slot.label} (${slot.id}.wav)`);
                      }}
                    >
                      <span className="audio-sfx-lab__task-num">{i + 1}</span>
                      <span className="audio-sfx-lab__task-body">
                        <strong>{slot.label}</strong>
                        <span>{slot.hint}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            </>
          ) : (
            <>
              <h2>Звуки, которые нужны</h2>
              <p className="audio-sfx-lab__hint" style={{ marginTop: 0 }}>
                <strong>Игра</strong> — штатный звук из папки сейчас.{' '}
                <strong>Мой</strong> — то, что вы уже сохранили в лабе.{' '}
                <span className="audio-sfx-lab__badge audio-sfx-lab__badge--file">файл</span> /
                <span className="audio-sfx-lab__badge audio-sfx-lab__badge--done">мой</span> — метки.
              </p>
              <ol className="audio-sfx-lab__task-list">
                {GAME_SOUND_TASKS.map((task) => {
                  const selected = task.id === activeId;
                  const hasFile = !!fileExists[task.id];
                  const isSaved = !!savedMap[task.id];
                  const isDone = !!doneMap[task.id] || isSaved;
                  return (
                    <li key={task.id} className="audio-sfx-lab__task-row">
                      <button
                        type="button"
                        className={
                          selected
                            ? 'audio-sfx-lab__task audio-sfx-lab__task--on'
                            : 'audio-sfx-lab__task'
                        }
                        onClick={() => selectTask(task)}
                      >
                        <span className="audio-sfx-lab__task-num">{task.order}</span>
                        <span className="audio-sfx-lab__task-body">
                          <strong>{task.title}</strong>
                          <span>{task.when}</span>
                        </span>
                        <span className="audio-sfx-lab__task-flags">
                          {hasFile ? <span className="audio-sfx-lab__badge audio-sfx-lab__badge--file">файл</span> : null}
                          {isDone ? <span className="audio-sfx-lab__badge audio-sfx-lab__badge--done">мой</span> : null}
                          {!hasFile && !isDone ? (
                            <span className="audio-sfx-lab__badge audio-sfx-lab__badge--todo">сделать</span>
                          ) : null}
                        </span>
                      </button>
                      <div className="audio-sfx-lab__task-plays">
                        <button
                          type="button"
                          className="audio-sfx-lab__task-play"
                          title={`Штатный звук игры: ${task.id}.wav`}
                          onClick={(e) => {
                            e.stopPropagation();
                            void hearGame(task.id);
                          }}
                        >
                          Игра
                        </button>
                        <button
                          type="button"
                          className="audio-sfx-lab__task-play audio-sfx-lab__task-play--mine"
                          title={isSaved ? `Ваш сохранённый ${task.id}` : 'Сначала «Сохранить в игру»'}
                          disabled={!isSaved}
                          onClick={(e) => {
                            e.stopPropagation();
                            void hearSaved(task.id);
                          }}
                        >
                          Мой
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </>
          )}
        </section>
          </div>
            ) : null}
          </div>
        </aside>

        {!focusArrange ? (
          <LabResizeHandle
            axis="x"
            label="Ширина библиотеки"
            onDrag={(dx) => patchPanelLayout({ libraryPx: panelLayoutRef.current.libraryPx + dx })}
            onDragEnd={persistPanelLayout}
            onReset={() => resetPanelKey('libraryPx')}
          />
        ) : null}

        <main className="audio-sfx-lab__studio-arrange">
          <div className="audio-sfx-lab__active-card">
            <div>
              <p className="audio-sfx-lab__active-kicker">
                {labMode === 'music' ? 'Фоновая петля' : 'Сейчас делаем'}
              </p>
              <h2 className="audio-sfx-lab__active-title">
                {labMode === 'music'
                  ? (LAB_MUSIC_SLOTS.find((s) => s.id === musicSlot)?.label ?? musicSlot)
                  : `${activeTask.order}. ${activeTask.title}`}
              </h2>
              {labMode === 'music' ? (
                <>
                  <p className="audio-sfx-lab__hint" style={{ margin: '4px 0 0' }}>
                    Включи «Петля», крути бит и атмосферу, запиши мелодию (по желанию), сохрани.
                  </p>
                  <p className="audio-sfx-lab__hint">
                    Файл: <code>public/audio/music/{musicSlot}.wav</code>
                  </p>
                </>
              ) : (
                <>
                  <p className="audio-sfx-lab__hint" style={{ margin: '4px 0 0' }}>
                    {activeTask.when}
                  </p>
                  <p className="audio-sfx-lab__active-tip">{activeTask.tip}</p>
                  <p className="audio-sfx-lab__hint">
                    Файл в игре: <code>{activeTask.id}.wav</code>
                    {activeTask.shape === 'phrase' ? ' · фраза или аккорд' : ' · нота, аккорд или удар'}
                  </p>
                </>
              )}
            </div>
            <div className="audio-sfx-lab__active-actions">
              {labMode === 'music' ? (
                <button
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__btn--primary"
                  onClick={() => void saveMusicBed()}
                >
                  Сохранить музыку
                </button>
              ) : (
                <>
                  <button type="button" className="audio-sfx-lab__btn audio-sfx-lab__btn--primary" onClick={() => void saveToGame()}>
                    Сохранить в игру
                  </button>
                  <button type="button" className="audio-sfx-lab__btn" onClick={() => void downloadCopy()}>
                    Скачать копию
                  </button>
                  <button
                    type="button"
                    className="audio-sfx-lab__btn"
                    onClick={() => setDoneMap(setLabDone(activeTask.id, !doneMap[activeTask.id]))}
                  >
                    {doneMap[activeTask.id] ? 'Снять «готово»' : 'Отметить готово'}
                  </button>
                </>
              )}
            </div>
          </div>

          {labMode === 'sfx' ? (
          <div className="audio-sfx-lab__compare">
            <h2>Сравнить текущий слот</h2>
            <div className="audio-sfx-lab__compare-row">
              <button type="button" className="audio-sfx-lab__btn" onClick={() => void hearGame()}>
                ▶ Сейчас в игре
              </button>
              <button type="button" className="audio-sfx-lab__btn audio-sfx-lab__btn--mint" onClick={() => void hearMine()}>
                ▶ Мой черновик
              </button>
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--mint"
                disabled={!savedMap[activeTask.id]}
                onClick={() => void hearSaved()}
              >
                ▶ Мой сохранённый
              </button>
            </div>
            <p className="audio-sfx-lab__hint" style={{ marginTop: 6 }}>
              «Сейчас в игре» — штатный WAV из <code>public/audio/sfx/</code>. Черновик всегда с текущими
              крутилками (яркость, фильтр, атака…). Слева у каждого пункта тоже есть кнопки Игра / Мой.
            </p>
          </div>
          ) : null}


          {labMode === 'music' ? (
            <div ref={arrangeStackRef} className="audio-sfx-lab__arrange-stack">
              <div className="audio-sfx-lab__arrange-workspace">
            <div className="audio-sfx-lab__arrange-music audio-sfx-lab__arrange-music--split">
              <div
                className="audio-sfx-lab__arrange-pane audio-sfx-lab__arrange-pane--tracks"
                style={{
                  flex: `0 1 ${panelLayout.tracksPx}px`,
                  height: panelLayout.tracksPx,
                  maxHeight: 'none',
                  minHeight: 120,
                }}
              >
                    <div className="audio-sfx-lab__pane-head">
                      <p className="audio-sfx-lab__melody-title">Мелодии · дорожки</p>
                      <span className="audio-sfx-lab__pane-hint">тяни ручку клавиатуры вверх · страница скроллится</span>
                    </div>
                    <LabTracksTimeline
                      beat={beatParams}
                      layers={melodyLayers}
                      liveNotes={recording || phrase.length > 0 ? phrase : []}
                      recording={recording}
                      activeLayerId={staffLayerId}
                      playingLayerId={playingLayerId}
                      onSelectLayer={(id) => {
                        setStaffLayerId(id);
                        setStatus(`Нотный стан: слой`);
                      }}
                      onPlayLayer={(id) => void playMelodyLayer(id)}
                    />
                    {melodyLayers.length === 0 ? (
                      <p className="audio-sfx-lab__beat-hint" style={{ margin: 0 }}>
                        Пока пусто. Включи «Петля», нажми ● Запись, сыграй, ■ Стоп — слой появится здесь.
                      </p>
                    ) : (
                      <ul className="audio-sfx-lab__melody-layers">
                          {melodyLayers.map((layer) => (
                            <li key={layer.id} className="audio-sfx-lab__melody-layer">
                              <button
                                type="button"
                                className={
                                  playingLayerId === layer.id
                                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-on'
                                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                                }
                                title="Сыграть только этот слой"
                                disabled={layer.notes.length === 0}
                                onClick={() => void playMelodyLayer(layer.id)}
                              >
                                {playingLayerId === layer.id ? '■ Стоп' : '▶ Играть'}
                              </button>
                              <button
                                type="button"
                                className={
                                  staffLayerId === layer.id
                                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                                }
                                title="Открыть на нотном стане"
                                onClick={() => {
                                  setStaffLayerId(layer.id);
                                  setStatus(`Нотный стан: «${layer.name}»`);
                                }}
                              >
                                {staffLayerId === layer.id ? '🎼' : '♪'} {layer.name}
                              </button>
                              <button
                                type="button"
                                className={
                                  layer.enabled
                                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                                }
                                title={layer.enabled ? 'Выключить слой в петле' : 'Включить слой в петле'}
                                onClick={() => {
                                  const next = melodyLayersRef.current.map((l) =>
                                    l.id === layer.id ? { ...l, enabled: !l.enabled } : l,
                                  );
                                  melodyLayersRef.current = next;
                                  setMelodyLayers(next);
                                  restartMusicLoop(next);
                                  setStatus(
                                    next.find((l) => l.id === layer.id)?.enabled
                                      ? `«${layer.name}» вкл`
                                      : `«${layer.name}» выкл`,
                                  );
                                }}
                              >
                                {layer.enabled ? '● звук' : '○ звук'}
                              </button>
                              <span className="audio-sfx-lab__melody-meta">{layer.notes.length} нот</span>
                              <label className="audio-sfx-lab__melody-gain">
                                <span>ур.</span>
                                <input
                                  type="range"
                                  min={0}
                                  max={1}
                                  step={0.01}
                                  value={layer.gain}
                                  onChange={(e) => {
                                    const gain = Number(e.target.value);
                                    const next = melodyLayersRef.current.map((l) =>
                                      l.id === layer.id ? { ...l, gain } : l,
                                    );
                                    melodyLayersRef.current = next;
                                    setMelodyLayers(next);
                                    restartMusicLoop(next);
                                  }}
                                />
                              </label>
                              <button
                                type="button"
                                className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                                title="Удалить слой"
                                onClick={() => {
                                  const next = melodyLayersRef.current.filter((l) => l.id !== layer.id);
                                  melodyLayersRef.current = next;
                                  setMelodyLayers(next);
                                  if (staffLayerId === layer.id) setStaffLayerId(next[0]?.id ?? null);
                                  restartMusicLoop(next);
                                  setStatus(`Удалён «${layer.name}»`);
                                }}
                              >
                                ×
                              </button>
                            </li>
                          ))}
                        </ul>
                    )}
                    {melodyLayers.length > 0 ? (
                      <>
                        <SliderRow
                          label="Мастер мелодий"
                          value={musicPad.melody}
                          min={0}
                          max={1}
                          step={0.01}
                          format={(n) => `${Math.round(n * 100)}%`}
                          onChange={(melody) => applyMusicPad({ ...musicPadRef.current, melody })}
                        />
                        <div className="audio-sfx-lab__melody-actions">
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                            onClick={() => {
                              const id = staffLayerId ?? melodyLayersRef.current[melodyLayersRef.current.length - 1]?.id;
                              if (!id) return;
                              const bpm = beatParamsRef.current.bpm;
                              const next = melodyLayersRef.current.map((l) =>
                                l.id === id ? { ...l, notes: quantizePhraseNotes(l.notes, bpm, 4) } : l,
                              );
                              melodyLayersRef.current = next;
                              setMelodyLayers(next);
                              restartMusicLoop(next);
                              setStatus('Квантизация слоя → 1/16');
                            }}
                          >
                            Квант 1/16
                          </button>
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                            onClick={() => {
                              const next = melodyLayersRef.current.map((l) => ({ ...l, enabled: true }));
                              melodyLayersRef.current = next;
                              setMelodyLayers(next);
                              restartMusicLoop(next);
                              setStatus('Все слои включены');
                            }}
                          >
                            Все вкл
                          </button>
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                            onClick={() => {
                              const next = melodyLayersRef.current.map((l) => ({ ...l, enabled: false }));
                              melodyLayersRef.current = next;
                              setMelodyLayers(next);
                              restartMusicLoop(next);
                              setStatus('Все слои выкл (бит остаётся)');
                            }}
                          >
                            Все выкл
                          </button>
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                            onClick={() => {
                              melodyLayersRef.current = [];
                              setMelodyLayers([]);
                              setStaffLayerId(null);
                              restartMusicLoop([]);
                              applyMusicPad({ ...musicPadRef.current, melody: 0 });
                              setStatus('Все мелодии удалены');
                            }}
                          >
                            Удалить все
                          </button>
                        </div>
                      </>
                    ) : null}
              </div>

              <LabResizeHandle
                axis="y"
                label="Высота дорожек"
                onDrag={(dy) =>
                  patchPanelLayout({
                    tracksPx: clampTracksPx(panelLayoutRef.current.tracksPx + dy),
                  })
                }
                onDragEnd={persistPanelLayout}
                onReset={() => resetPanelKey('tracksPx')}
              />

              <div className="audio-sfx-lab__arrange-pane audio-sfx-lab__arrange-pane--staff">
                <div className="audio-sfx-lab__pane-head">
                  <p className="audio-sfx-lab__melody-title">Нотный стан</p>
                </div>
                {(() => {
                  const staffLayer =
                    melodyLayers.find((l) => l.id === staffLayerId) ?? melodyLayers[melodyLayers.length - 1];
                  if (!staffLayer) {
                    return (
                      <p className="audio-sfx-lab__beat-hint" style={{ margin: 0 }}>
                        Нотный стан — после первой записи слоя. Тяни границу сверху, чтобы дать больше места.
                      </p>
                    );
                  }
                  return (
                    <LabStaffEditor
                      key={staffLayer.id}
                      title={`Стан: ${staffLayer.name}`}
                      notes={staffLayer.notes}
                      bpm={beatParams.bpm}
                      voice={voice}
                      defaultDur={voice.duration}
                      onChange={(notes) => {
                        const next = melodyLayersRef.current.map((l) =>
                          l.id === staffLayer.id ? { ...l, notes } : l,
                        );
                        melodyLayersRef.current = next;
                        setMelodyLayers(next);
                        if (staffLayerId !== staffLayer.id) setStaffLayerId(staffLayer.id);
                      }}
                      onCommit={() => {
                        restartMusicLoop(melodyLayersRef.current);
                      }}
                    />
                  );
                })()}
              </div>
            </div>
              </div>

            <LabResizeHandle
              axis="y"
              invert
              label="Высота клавиатуры"
              onDrag={(dy) => {
                /* invert: тянуть ручку вверх → dy>0 → клавиатура выше */
                const next = clampKeyboardPx(panelLayoutRef.current.keyboardPx + dy);
                if (!keyboardOpen && dy > 4) setKeyboardOpen(true);
                patchPanelLayout({ keyboardPx: next });
              }}
              onDragEnd={() => {
                if (panelLayoutRef.current.keyboardPx < 64) {
                  setKeyboardOpen(false);
                  patchPanelLayout({ keyboardPx: DEFAULT_LAB_PANEL_LAYOUT.keyboardPx }, true);
                } else {
                  setKeyboardOpen(true);
                  persistPanelLayout();
                }
              }}
              onReset={() => {
                setKeyboardOpen(true);
                resetPanelKey('keyboardPx');
              }}
            />

          {renderLabKeyboardDrawer(true)}
            </div>
          ) : (
            renderLabKeyboardDrawer(false)
          )}

          <div className="audio-sfx-lab__hint audio-sfx-lab__hint--path">
            После скачивания: файл из Downloads положи в{' '}
            <code>public\audio\sfx\{activeTask.id}.wav</code> (замени старый) → в{' '}
            <code>src\audio\bus.ts</code> увеличь <code>SAMPLE_VER</code> → жёсткий F5 в игре.
          </div>
        </main>

        {!focusArrange ? (
          <LabResizeHandle
            axis="x"
            label="Ширина инспектора"
            onDrag={(dx) => patchPanelLayout({ inspectorPx: panelLayoutRef.current.inspectorPx - dx })}
            onDragEnd={persistPanelLayout}
            onReset={() => resetPanelKey('inspectorPx')}
          />
        ) : null}

        <aside className="audio-sfx-lab__studio-inspector">
          <details className="audio-sfx-lab__accordion" open>
            <summary>Голос · крутилки</summary>
            <div className="audio-sfx-lab__accordion-body">
          <div className="audio-sfx-lab__inst-grid audio-sfx-lab__inst-grid--row" role="listbox">
            {LAB_INSTRUMENTS.map((inst) => (
              <button
                key={inst.id}
                type="button"
                role="option"
                aria-selected={voice.instrument === inst.id}
                className={
                  voice.instrument === inst.id
                    ? 'audio-sfx-lab__inst audio-sfx-lab__inst--on'
                    : 'audio-sfx-lab__inst'
                }
                onClick={() => patchVoice({ instrument: inst.id })}
              >
                <strong>{inst.label}</strong>
                <span>{inst.hint}</span>
              </button>
            ))}
          </div>
          <div className="audio-sfx-lab__knob-row">
            <LabKnob
              label="Яркость"
              value={voice.brightness}
              onChange={(brightness) => patchVoice({ brightness })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label={voice.instrument === 'ebass' ? 'Упругость' : 'Глубина'}
              value={voice.depth}
              onChange={(depth) => patchVoice({ depth })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label="Фильтр"
              value={voice.filter}
              onChange={(filter) => patchVoice({ filter })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label="Громк."
              value={voice.volume}
              min={0.05}
              max={1}
              onChange={(volume) => patchVoice({ volume })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
          </div>
          <SliderRow
            label="Длительность"
            value={voice.duration}
            min={0.06}
            max={6}
            step={0.01}
            format={(n) => `${n.toFixed(2)} с`}
            onChange={(duration) => patchVoice({ duration })}
          />
          <details className="audio-sfx-lab__accordion" open>
            <summary>Атака · релиз · cents</summary>
            <div className="audio-sfx-lab__accordion-body">
          <div className="audio-sfx-lab__sliders audio-sfx-lab__sliders--full">
            <SliderRow
              label="Атака"
              value={voice.attack}
              min={0.001}
              max={0.35}
              step={0.001}
              format={(n) => `${(n * 1000).toFixed(0)} мс`}
              onChange={(attack) => patchVoice({ attack })}
            />
            <SliderRow
              label="Релиз"
              value={voice.release}
              min={0.02}
              max={3.5}
              step={0.01}
              format={(n) => `${n.toFixed(2)} с`}
              onChange={(release) => patchVoice({ release })}
            />
            <SliderRow
              label="Расстройка"
              value={voice.detuneCents}
              min={-50}
              max={50}
              step={1}
              format={(n) => `${n > 0 ? '+' : ''}${n} ¢`}
              onChange={(detuneCents) => patchVoice({ detuneCents })}
            />
            <SliderRow
              label="Октава"
              value={voice.octave}
              min={-2}
              max={2}
              step={1}
              format={(n) => `${n > 0 ? '+' : ''}${n}`}
              onChange={(octave) => patchVoice({ octave })}
            />
          </div>
            </div>
          </details>
            </div>
          </details>

          <details className="audio-sfx-lab__accordion" open={beatParams.rhythm === 'custom'}>
            <summary>Бит · ритм</summary>
            <div className="audio-sfx-lab__accordion-body">
              <div className="audio-sfx-lab__beat-panel audio-sfx-lab__beat-panel--inspect">

            <div className="audio-sfx-lab__beat-presets">
              <span className="audio-sfx-lab__beat-label">Пресет:</span>
              {LAB_BEAT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    activePresetId === preset.id
                      ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                      : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                  }
                  title={
                    activePresetId === preset.id
                      ? 'Ещё раз — снять пресет (крутилки останутся)'
                      : `Применить «${preset.label}»`
                  }
                  onClick={() => {
                    if (activePresetId === preset.id) {
                      setActivePresetId(null);
                      setStatus('Пресет снят — свой микс (крутилки как есть)');
                      return;
                    }
                    applyBeatParams(
                      {
                        ...preset.params,
                        bars: beatParamsRef.current.bars ?? preset.params.bars,
                        pattern: barPatternFromRhythm(preset.params.rhythm),
                      },
                      preset.label,
                      preset.id,
                    );
                  }}
                >
                  {activePresetId === preset.id ? `● ${preset.label}` : preset.label}
                </button>
              ))}
            </div>
            <div className="audio-sfx-lab__beat-presets">
              <span className="audio-sfx-lab__beat-label">Ритм:</span>
              {LAB_BEAT_RHYTHMS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={
                    beatParams.rhythm === r.id
                      ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                      : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                  }
                  title={r.hint}
                  onClick={() => {
                    const prev = beatParamsRef.current;
                    if (r.id === 'custom') {
                      const pattern =
                        prev.rhythm === 'custom'
                          ? normalizeBeatPattern(prev.pattern)
                          : barPatternFromRhythm(prev.rhythm);
                      applyBeatParams({ ...prev, rhythm: 'custom', pattern }, 'Свой ритм', null);
                      return;
                    }
                    if (beatParams.rhythm === r.id && r.id !== 'none') {
                      applyBeatParams(
                        { ...prev, rhythm: 'none', pattern: emptyBeatPattern() },
                        'ритм выкл',
                        null,
                      );
                      return;
                    }
                    applyBeatParams(
                      { ...prev, rhythm: r.id, pattern: barPatternFromRhythm(r.id) },
                      r.label,
                      null,
                    );
                  }}
                >
                  {beatParams.rhythm === r.id ? `● ${r.label}` : r.label}
                </button>
              ))}
            </div>
            <details className="audio-sfx-lab__accordion" open={beatParams.rhythm === 'custom'}>
              <summary>Секвенсор сетки</summary>
              <div className="audio-sfx-lab__accordion-body">
            <div className="audio-sfx-lab__seq" aria-label="Секвенсор ритма">
              <div className="audio-sfx-lab__seq-head">
                <span className="audio-sfx-lab__beat-label">Сетка (1 такт = 16 шагов, повторяется)</span>
                <div className="audio-sfx-lab__seq-actions">
                  <button
                    type="button"
                    className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                    onClick={() => applyCustomPattern(emptyBeatPattern(), 'сетка очищена', false)}
                  >
                    Очистить
                  </button>
                  <button
                    type="button"
                    className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                    onClick={() => {
                      const next = cloneBeatPattern(displayPattern);
                      for (let i = 0; i < LAB_BEAT_STEPS_PER_BAR; i++) next.hats[i] = i % 2 === 0;
                      applyCustomPattern(next, 'хеты: восьмые');
                    }}
                  >
                    Хеты 8ths
                  </button>
                  <button
                    type="button"
                    className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                    onClick={() => {
                      const next = emptyBeatPattern();
                      next.kick[0] = true;
                      next.kick[8] = true;
                      next.snare[4] = true;
                      next.snare[12] = true;
                      next.hats = Array.from({ length: 16 }, (_, i) => i % 2 === 0);
                      applyCustomPattern(next, 'базовый 4/4');
                    }}
                  >
                    Базовый 4/4
                  </button>
                </div>
              </div>
              <p className="audio-sfx-lab__beat-hint">
                Кликни клетки — сразу услышишь удар и запустится петля. Крутилки = громкость слоя
                (0 = слой молчит). Шаблон Sync/808… можно править: первая правка → <strong>Свой</strong>.
              </p>
              {(
                [
                  { lane: 'kick' as const, label: 'Бочка', tone: 'kick' },
                  { lane: 'snare' as const, label: 'Снейр', tone: 'snare' },
                  { lane: 'hats' as const, label: 'Хеты', tone: 'hats' },
                ] as const
              ).map((row) => (
                <div key={row.lane} className="audio-sfx-lab__seq-row">
                  <span className={`audio-sfx-lab__seq-lane audio-sfx-lab__seq-lane--${row.tone}`}>{row.label}</span>
                  <div className="audio-sfx-lab__seq-steps">
                    {Array.from({ length: LAB_BEAT_STEPS_PER_BAR }, (_, step) => {
                      const on = Boolean(displayPattern[row.lane][step]);
                      const beat = step % 4 === 0;
                      return (
                        <button
                          key={step}
                          type="button"
                          className={[
                            'audio-sfx-lab__seq-step',
                            `audio-sfx-lab__seq-step--${row.tone}`,
                            on ? 'audio-sfx-lab__seq-step--on' : '',
                            beat ? 'audio-sfx-lab__seq-step--beat' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-pressed={on}
                          title={`${row.label} · шаг ${step + 1}${beat ? ' (доля)' : ''}`}
                          onClick={() => togglePatternStep(row.lane, step)}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="audio-sfx-lab__seq-marks" aria-hidden>
                <span className="audio-sfx-lab__seq-lane" />
                <div className="audio-sfx-lab__seq-steps">
                  {Array.from({ length: LAB_BEAT_STEPS_PER_BAR }, (_, step) => (
                    <span key={step} className="audio-sfx-lab__seq-mark">
                      {step % 4 === 0 ? step / 4 + 1 : ''}
                    </span>
                  ))}
                </div>
              </div>
            </div>
              </div>
            </details>
            <div className="audio-sfx-lab__beat-presets">
              <span className="audio-sfx-lab__beat-label">Такты:</span>
              {([4, 8, 16] as const).map((bars) => (
                <button
                  key={bars}
                  type="button"
                  className={
                    (beatParams.bars ?? 4) === bars
                      ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                      : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                  }
                  onClick={() => applyBeatParams({ ...beatParamsRef.current, bars }, `${bars} тактов`, null)}
                >
                  {bars}
                </button>
              ))}
            </div>
            <p className="audio-sfx-lab__beat-hint">
              Слои: <strong>Бочка / Хеты / Снейр</strong> — громкость. Бас — отдельно от бочки.
              {labMode === 'music'
                ? ' Мелодии: ● Запись добавляет слой в список (можно вкл/выкл).'
                : ''}
            </p>
            {labMode === 'sfx' ? (
            <label className="audio-sfx-lab__beat-bake">
              <input
                type="checkbox"
                checked={bakeBeatInFile}
                onChange={(e) => {
                  const on = e.target.checked;
                  setBakeBeatInFile(on);
                  bakeBeatInFileRef.current = on;
                  setStatus(on ? 'Бит будет подмешан в «Сохранить» и «Скачать»' : 'В файл сохранится только мелодия');
                }}
              />
              <span>Бит в сохранённый WAV</span>
            </label>
            ) : null}
            <div className="audio-sfx-lab__beat-sliders">
              <SliderRow
                label="Громкость"
                value={beatParams.volume ?? 1}
                min={0}
                max={2}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(volume) => applyBeatParams({ ...beatParamsRef.current, volume })}
              />
              <SliderRow
                label="Бас"
                value={beatParams.bass}
                min={0}
                max={1}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(bass) => applyBeatParams({ ...beatParamsRef.current, bass })}
              />
              <SliderRow
                label="Бочка"
                value={beatParams.kick}
                min={0}
                max={1}
                step={0.01}
                format={(n) => (n < 0.02 ? 'выкл' : `${Math.round(n * 100)}%`)}
                onChange={(kick) => applyBeatParams({ ...beatParamsRef.current, kick })}
              />
              <SliderRow
                label="Хеты"
                value={beatParams.hats}
                min={0}
                max={1}
                step={0.01}
                format={(n) => (n < 0.02 ? 'выкл' : `${Math.round(n * 100)}%`)}
                onChange={(hats) => applyBeatParams({ ...beatParamsRef.current, hats })}
              />
              <SliderRow
                label="Снейр"
                value={beatParams.snare}
                min={0}
                max={1}
                step={0.01}
                format={(n) => (n < 0.02 ? 'выкл' : `${Math.round(n * 100)}%`)}
                onChange={(snare) => applyBeatParams({ ...beatParamsRef.current, snare })}
              />
              <SliderRow
                label="Глубина 808"
                value={beatParams.depth}
                min={0}
                max={1}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(depth) => applyBeatParams({ ...beatParamsRef.current, depth })}
              />
                            <SliderRow
                label="Грязь"
                value={beatParams.crackle}
                min={0}
                max={1}
                step={0.01}
                format={(n) => (n < 0.02 ? 'выкл' : `${Math.round(n * 100)}%`)}
                onChange={(crackle) => applyBeatParams({ ...beatParamsRef.current, crackle })}
              />
              <SliderRow
                label="Drive"
                value={beatParams.industrial}
                min={0}
                max={1}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(industrial) => applyBeatParams({ ...beatParamsRef.current, industrial })}
              />
              <SliderRow
                label="BPM"
                value={beatParams.bpm}
                min={80}
                max={190}
                step={1}
                format={(n) => `${Math.round(n)}`}
                onChange={(bpm) => applyBeatParams({ ...beatParamsRef.current, bpm })}
              />
              </div>
              </div>
            </div>
          </details>
          {labMode === 'music' ? (
            <details className="audio-sfx-lab__accordion">
              <summary>Атмосфера</summary>
              <div className="audio-sfx-lab__accordion-body">
                  <SliderRow
                    label="Атмосфера"
                    value={musicPad.pad}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(n) => `${Math.round(n * 100)}%`}
                    onChange={(pad) => applyMusicPad({ ...musicPadRef.current, pad })}
                  />
                  <SliderRow
                    label="Яркость пада"
                    value={musicPad.tone}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(n) => `${Math.round(n * 100)}%`}
                    onChange={(tone) => applyMusicPad({ ...musicPadRef.current, tone })}
                  />

              </div>
            </details>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export default AudioSfxLabPage;
