/**
 * Лаборатория SFX: чеклист звуков игры → клавиатура → сохранить в партию.
 * Маршрут: /audio-sfx-lab (sessionStorage updown-devMode=1).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type RefObject } from 'react';
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
  releaseLabNote,
  cancelPendingGateRelease,
  isLabNoteActive,
  releaseUnheldLabNotes,
  playLabPhrase,
  playWavBytes,
  renderChordSamples,
  renderNoteSamples,
  renderPhraseSamples,
  renderMusicBedSamples,
  mixBeatIntoSamples,
  resumeLabAudio,
  getLabAudioContext,
  saveLabSlot,
  startLabBeat,
  startLabMusicBed,
  playLabBeatOnce,
  playLabMusicOnce,
  stopAllLabNotes,
  stopLabBeat,
  stopLabOneShot,
  stopLabPhrase,
  setLabBeatParams,
  setLabMusicPlaybackVolume,
  previewLabDrumHit,
  isLabBeatOn,
  markLabUiMounted,
  scheduleLabUiTeardown,
  isLabOneShotPlaying,
  upsertLabPreset,
  writeSlotToDevServer,
  writeMusicSlotToDevServer,
  barPatternFromRhythm,
  cloneBeatPattern,
  emptyBeatPattern,
  emptyBeatPatternForBars,
  normalizeBeatPattern,
  normalizeBeatPatternForBars,
  resolveCustomBeatPattern,
  firstBarPattern,
  writeBarIntoPattern,
  beatPatternStepCount,
  patternsEqual,
  resolveDisplayPattern,
  createMelodyLayer,
  ensureMelodyLayerVoices,
  stampVoiceOntoMelodyLayers,
  quantizePhraseNotes,
  wrapPhraseNotesToLoop,
  fitMelodyNotesToLoop,
  labSectionDurationSec,
  extendMelodyLayersIntoNextSection,
  swapMelodyLayerSections,
  insertChordNotesAt,
  normalizeLabBars,
  normalizeMusicPad,
  addLabBars,
  cloneLabMelodyLayers,
  cloneLabBeatParams,
  cloneLabVoiceParams,
  cloneLabMusicPad,
  extractLoopClip,
  pasteLoopClip,
  cloneLoopClip,
  summarizeLoopClip,
  barsNeededForPaste,
  clearLoopRegion,
  loopPasteTargetHasContent,
  LAB_BARS_OPTIONS,
  LAB_BARS_ADD_DELTAS,
  LAB_BARS_MAX,
  LAB_PAD_KINDS,
  createAtmosphereLayer,
  type LabPadKind,
  type LabAtmosphereLayer,
  type LabChordPreset,
  getLabBeatRecordEpochMs,
  getLabBeatLoopPhaseSec,
  seekLabBeatLoop,
  saveLabSessionDraft,
  loadLabSessionDraft,
  loadLabChordPresets,
  saveLabChordEverywhere,
  removeLabChordEverywhere,
  syncLabLibraryWithCloud,
  inspectLabCloudSync,
  pushLabPresetToCloud,
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
  type LabCloudInspect,
  type LabBarsAddDelta,
  type LabLoopClip,
  type LabPasteMode,
} from '../audio/lab';
import { LabStaffEditor } from './lab/LabStaffEditor';
import { LabTracksTimeline } from './lab/LabTracksTimeline';
import { LabKnob } from './lab/studio/LabKnob';
import { LabResizeHandle } from './lab/studio/LabResizeHandle';
import {
  DEFAULT_LAB_PANEL_LAYOUT,
  LAB_PANEL_LIMITS,
  LAB_LIBRARY_RAIL_PX,
  clampLabPanelLayout,
  loadLabPanelLayout,
  saveLabPanelLayout,
  type LabPanelLayout,
} from './lab/studio/labPanelLayout';
import { useAuth } from '../contexts/AuthContext';
import { getPlayerProfile } from '../game/persistence';
import { isSupabaseConfigured } from '../lib/supabase';
import { AuthModal, type AuthMode } from './AuthModal';
import { PlayerAvatar } from './PlayerAvatar';
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
/** Четыре октавы + верхняя C (C…B × 4 + C). */
const CHROMATIC_KEYS = 49;

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

/**
 * ПК-раскладка — ряды разделены как на ноутбуке:
 *   белые:  Z X C V B N M , . /   и   Q W E R T Y U I O P [ ] =
 *   чёрные: S D   G H J   L ;     и   2 3 4 5 6 7   9 0 -
 *   хвост (верх клавиатуры без подписи): ' \ ` 1 8 A F K + .
 * (A/F/K и 1/8 в среднем регистре — «дыры» E–F / B–C; здесь закрывают правый край.)
 */
const KEY_TO_OFFSET: Record<string, number> = {
  /* —— белые, нижний ряд —— */
  z: 0,
  x: 2,
  c: 4,
  v: 5,
  b: 7,
  n: 9,
  m: 11,
  ',': 12,
  '.': 14,
  '/': 16,
  /* —— чёрные, ряд ASDF —— */
  s: 1,
  d: 3,
  g: 6,
  h: 8,
  j: 10,
  l: 13,
  ';': 15,
  /* —— белые, ряд QWERTY —— */
  q: 17,
  w: 19,
  e: 21,
  r: 23,
  t: 24,
  y: 26,
  u: 28,
  i: 29,
  o: 31,
  p: 33,
  '[': 35,
  ']': 36,
  '=': 38,
  /* —— чёрные, цифровой ряд —— */
  '2': 18,
  '3': 20,
  '4': 22,
  '5': 25,
  '6': 27,
  '7': 30,
  '9': 32,
  '0': 34,
  '-': 37,
  /* —— хвост до верхней C (свободные клавиши) —— */
  "'": 39,
  '\\': 40,
  '`': 41,
  '1': 42,
  '8': 43,
  a: 44,
  f: 45,
  k: 46,
  '+': 47,
};

/** Физические клавиши — работает и на русской раскладке (KeyZ = я). */
const CODE_TO_OFFSET: Record<string, number> = {
  KeyZ: 0,
  KeyX: 2,
  KeyC: 4,
  KeyV: 5,
  KeyB: 7,
  KeyN: 9,
  KeyM: 11,
  Comma: 12,
  Period: 14,
  Slash: 16,
  KeyS: 1,
  KeyD: 3,
  KeyG: 6,
  KeyH: 8,
  KeyJ: 10,
  KeyL: 13,
  Semicolon: 15,
  KeyQ: 17,
  KeyW: 19,
  KeyE: 21,
  KeyR: 23,
  KeyT: 24,
  KeyY: 26,
  KeyU: 28,
  KeyI: 29,
  KeyO: 31,
  KeyP: 33,
  BracketLeft: 35,
  BracketRight: 36,
  Digit2: 18,
  Digit3: 20,
  Digit4: 22,
  Digit5: 25,
  Digit6: 27,
  Digit7: 30,
  Digit9: 32,
  Digit0: 34,
  Minus: 37,
  Equal: 38,
  Quote: 39,
  Backslash: 40,
  Backquote: 41,
  Digit1: 42,
  Digit8: 43,
  KeyA: 44,
  KeyF: 45,
  KeyK: 46,
  NumpadAdd: 47,
  NumpadDecimal: 48,
};

/** Подпись на экранной клавише: предпочитаем code-имя, без дублей. */
const OFFSET_TO_PC: Record<number, string> = {
  0: 'Z',
  1: 'S',
  2: 'X',
  3: 'D',
  4: 'C',
  5: 'V',
  6: 'G',
  7: 'B',
  8: 'H',
  9: 'N',
  10: 'J',
  11: 'M',
  12: ',',
  13: 'L',
  14: '.',
  15: ';',
  16: '/',
  17: 'Q',
  18: '2',
  19: 'W',
  20: '3',
  21: 'E',
  22: '4',
  23: 'R',
  24: 'T',
  25: '5',
  26: 'Y',
  27: '6',
  28: 'U',
  29: 'I',
  30: '7',
  31: 'O',
  32: '9',
  33: 'P',
  34: '0',
  35: '[',
  36: ']',
  37: '-',
  38: '=',
  39: "'",
  40: '\\',
  41: '`',
  42: '1',
  43: '8',
  44: 'A',
  45: 'F',
  46: 'K',
  47: '+',
  48: 'N.',
};

function pianoOffset(e: KeyboardEvent): number | undefined {
  return CODE_TO_OFFSET[e.code] ?? KEY_TO_OFFSET[e.key.toLowerCase()];
}

function isTextTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type !== 'range' && type !== 'button' && type !== 'checkbox' && type !== 'radio';
}

const LAB_UI_FLAGS_KEY = 'updown_audio_lab_ui_flags_v1';

type LabUiFlags = {
  beatOn: boolean;
  keyboardOpen: boolean;
  keyboardFloat: boolean;
};

function saveLabUiFlags(flags: LabUiFlags): void {
  try {
    sessionStorage.setItem(LAB_UI_FLAGS_KEY, JSON.stringify(flags));
  } catch {
    /* ignore */
  }
}

function loadLabUiFlags(): LabUiFlags | null {
  try {
    const raw = sessionStorage.getItem(LAB_UI_FLAGS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as LabUiFlags;
    if (typeof p?.beatOn !== 'boolean') return null;
    return {
      beatOn: !!p.beatOn,
      keyboardOpen: !!p.keyboardOpen,
      keyboardFloat: !!p.keyboardFloat,
    };
  } catch {
    return null;
  }
}

/** Блокировать Ctrl+C/V только при реальном наборе текста (select/кнопки — ок). */
function isClipShortcutBlocked(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return type === 'text' || type === 'search' || type === 'password' || type === 'email' || type === 'url' || type === 'number' || type === '';
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

/** Сила удара с экранной клавиши: верх тихо, низ громко; touch/pen — pressure. */
function velocityFromPointer(e: {
  clientY: number;
  pressure: number;
  pointerType: string;
  currentTarget: EventTarget;
}): number {
  const el = e.currentTarget;
  let fromY = 0.55;
  if (el instanceof HTMLElement) {
    const rect = el.getBoundingClientRect();
    const yNorm = Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height)));
    /* Сильный контраст: верх ≈ тихий, низ ≈ forte */
    fromY = 0.08 + Math.pow(yNorm, 0.85) * 0.92;
  }
  const p = e.pressure;
  if ((e.pointerType === 'touch' || e.pointerType === 'pen') && p > 0.02) {
    fromY = Math.max(fromY * 0.4, 0.1 + Math.pow(p, 0.9) * 0.9);
  }
  return Math.min(1, Math.max(0.06, fromY));
}

let lastComputerKeyOnAt = 0;

/** ПК-клавиатура: Sens + скорость игры (быстрые ноты = акцент). */
function velocityFromComputerKey(sens: number): number {
  const now = performance.now();
  const dt = lastComputerKeyOnAt > 0 ? now - lastComputerKeyOnAt : 999;
  lastComputerKeyOnAt = now;
  let fromTiming = 0.55;
  if (dt < 80) fromTiming = 1;
  else if (dt < 140) fromTiming = 0.88;
  else if (dt < 220) fromTiming = 0.72;
  else if (dt > 650) fromTiming = 0.28;
  else if (dt > 400) fromTiming = 0.4;
  const fromSens = 0.12 + sens * 0.88;
  return Math.min(1, Math.max(0.08, fromTiming * 0.5 + fromSens * 0.5));
}

type SlotDraft = {
  voice: LabVoiceParams;
  phrase: LabPhraseNote[];
  chordMidis: number[];
  lastMidi: number;
};

type LabSyncSnapshot = {
  at: number;
  ok: boolean;
  chords: number;
  presets: number;
  message: string;
};

function formatLabSyncWhen(ts: number | string | null | undefined): string {
  if (ts == null) return '—';
  const ms = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(ms) || ms <= 0) return '—';
  return new Date(ms).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function LabShimmerEmail({ email }: { email: string }) {
  return (
    <span className="audio-sfx-lab__auth-email" title={email}>
      {email}
    </span>
  );
}

export function AudioSfxLabPage({ onBack }: Props) {
  const { user, configured: authConfigured, loading: authLoading, signOut } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [authMenuOpen, setAuthMenuOpen] = useState(false);
  const [syncInspect, setSyncInspect] = useState<LabCloudInspect | null>(null);
  const [syncInspectLoading, setSyncInspectLoading] = useState(false);
  const [syncPanelOpen, setSyncPanelOpen] = useState(false);
  const [lastLabSync, setLastLabSync] = useState<LabSyncSnapshot | null>(null);
  const authStripRef = useRef<HTMLDivElement>(null);
  const [playerProfile, setPlayerProfile] = useState(() => getPlayerProfile());
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
  const [chordLibrary, setChordLibrary] = useState<LabChordPreset[]>(() => loadLabChordPresets());
  const [chordLibOpen, setChordLibOpen] = useState(true);
  const [beatOn, setBeatOn] = useState(false);
  const [oneShotOn, setOneShotOn] = useState(false);
  const [bakeBeatInFile, setBakeBeatInFile] = useState(true);
  const [beatParams, setBeatParams] = useState<LabBeatParams>(() => ({
    ...DEFAULT_LAB_BEAT,
    rhythm: 'custom',
    pattern: emptyBeatPatternForBars(4),
    patternRepeat: false,
    kick: 0.85,
    snare: 0.7,
    hats: 0.55,
    bass: 0.7,
    volume: 1,
    bars: 4,
    crackle: 0,
    depth: 0.7,
  }));
  const [labMode, setLabMode] = useState<'sfx' | 'music'>('sfx');
  const [musicSlot, setMusicSlot] = useState<LabMusicSlotId>('table_bed');
  const [musicPad, setMusicPad] = useState<LabMusicPadParams>(() => normalizeMusicPad({ ...DEFAULT_LAB_MUSIC_PAD }));
  type InspectorTab = 'voice' | 'beat' | 'atmosphere';
  const [inspectorTab, setInspectorTab] = useState<InspectorTab>('voice');
  const [melodyLayers, setMelodyLayers] = useState<LabMelodyLayer[]>([]);
  const [stitchPickIds, setStitchPickIds] = useState<string[] | null>(null);
  const [stitchAddDelta, setStitchAddDelta] = useState<LabBarsAddDelta>(8);
  /** Индексы кусков по 4 такта для произвольного обмена. */
  const [swapChunkA, setSwapChunkA] = useState(0);
  const [swapChunkB, setSwapChunkB] = useState(1);
  const [clipFromBar, setClipFromBar] = useState(1);
  const [clipToBar, setClipToBar] = useState(4);
  const [clipSelActive, setClipSelActive] = useState(false);
  const [clipPasteAt, setClipPasteAt] = useState(5);
  const [loopToolsOpen, setLoopToolsOpen] = useState(false);
  type LoopFloatGeom = { left: number; top: number };
  const loadLoopFloatGeom = (): LoopFloatGeom => {
    try {
      const raw = localStorage.getItem('updown_lab_loop_float_geom_v1');
      if (raw) {
        const p = JSON.parse(raw) as Partial<LoopFloatGeom>;
        return {
          left: Math.max(8, Number(p.left) || Math.round(window.innerWidth / 2 - 280)),
          top: Math.max(48, Number(p.top) || Math.round(window.innerHeight / 2 - 200)),
        };
      }
    } catch {
      /* ignore */
    }
    return {
      left: Math.max(48, Math.round(window.innerWidth / 2 - 280)),
      top: Math.max(80, Math.round(window.innerHeight / 2 - 220)),
    };
  };
  const [loopFloatGeom, setLoopFloatGeom] = useState<LoopFloatGeom>(() =>
    typeof window !== 'undefined'
      ? loadLoopFloatGeom()
      : { left: 120, top: 120 },
  );
  const loopFloatGeomRef = useRef(loopFloatGeom);
  loopFloatGeomRef.current = loopFloatGeom;
  const loopFloatDragRef = useRef<{
    startX: number;
    startY: number;
    orig: LoopFloatGeom;
  } | null>(null);

  useEffect(() => {
    if (!loopToolsOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (stitchPickIds != null) return;
      setLoopToolsOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loopToolsOpen, stitchPickIds]);
  const [clipKick, setClipKick] = useState(true);
  const [clipSnare, setClipSnare] = useState(true);
  const [clipHats, setClipHats] = useState(true);
  /** Явный список id в ▣. Пустой = мелодии вне клипа. Никогда null («все молча»). */
  const [clipLayerIds, setClipLayerIds] = useState<string[]>([]);
  const clipLayersInitedRef = useRef(false);
  const loopClipRef = useRef<LabLoopClip | null>(null);
  const [loopClipInfo, setLoopClipInfo] = useState<string | null>(null);
  /** Id слоёв / ударных в буфере — для подсветки «скопировано». */
  const [bufferLayerIds, setBufferLayerIds] = useState<string[]>([]);
  const [bufferDrums, setBufferDrums] = useState<{ kick: boolean; snare: boolean; hats: boolean }>({
    kick: false,
    snare: false,
    hats: false,
  });
  const [pasteConflict, setPasteConflict] = useState<{
    pasteAt: number;
    endBar: number;
  } | null>(null);
  const arrangeUndoRef = useRef<{ beat: LabBeatParams; layers: LabMelodyLayer[] }[]>([]);
  const [arrangeUndoCount, setArrangeUndoCount] = useState(0);
  const stitchPanelRef = useRef<HTMLDivElement | null>(null);
  const loopToolbarRef = useRef<HTMLDivElement | null>(null);
  const [staffLayerId, setStaffLayerId] = useState<string | null>(null);
  /** После Стоп: черновик слоя до «Сохранить / Отменить». */
  const [pendingLayerSave, setPendingLayerSave] = useState<{
    notes: LabPhraseNote[];
    laps: number;
    defaultName: string;
    name: string;
  } | null>(null);
  /** Плавающее окно стана свежего / выбранного слоя. */
  const [layerDockOpen, setLayerDockOpen] = useState(false);
  const [layerDockName, setLayerDockName] = useState('');
  const [activePresetId, setActivePresetId] = useState<string | null>(null);
  const [focusArrange, setFocusArrange] = useState(false);
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  /** Клавиатура поверх низа экрана — удобно писать, не сжимая дорожки. */
  const [keyboardFloat, setKeyboardFloat] = useState(false);
  type FloatKbGeom = { left: number; top: number; width: number; height: number };
  const loadFloatKbGeom = (): FloatKbGeom => {
    try {
      const raw = localStorage.getItem('updown_lab_float_kb_geom_v1');
      if (raw) {
        const p = JSON.parse(raw) as Partial<FloatKbGeom>;
        return {
          left: Math.max(8, Number(p.left) || 48),
          top: Math.max(48, Number(p.top) || 120),
          width: Math.min(Math.max(360, Number(p.width) || 720), window.innerWidth - 16),
          height: Math.min(Math.max(180, Number(p.height) || 280), window.innerHeight - 24),
        };
      }
    } catch {
      /* ignore */
    }
    return {
      left: Math.max(48, window.innerWidth - 760),
      top: Math.max(80, window.innerHeight - 340),
      width: Math.min(720, window.innerWidth - 80),
      height: 280,
    };
  };
  const [floatKbGeom, setFloatKbGeom] = useState<FloatKbGeom>(() =>
    typeof window !== 'undefined'
      ? loadFloatKbGeom()
      : { left: 48, top: 120, width: 720, height: 280 },
  );
  const floatKbGeomRef = useRef(floatKbGeom);
  floatKbGeomRef.current = floatKbGeom;
  const persistFloatKbGeom = useCallback((g: FloatKbGeom) => {
    try {
      localStorage.setItem('updown_lab_float_kb_geom_v1', JSON.stringify(g));
    } catch {
      /* ignore */
    }
  }, []);
  const floatDragRef = useRef<{
    mode: 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
    startX: number;
    startY: number;
    orig: FloatKbGeom;
  } | null>(null);
  const [presetKindTab, setPresetKindTab] = useState<'all' | 'sfx' | 'music'>('sfx');
  const [presetsTick, setPresetsTick] = useState(0);
  const [slotsOpen, setSlotsOpen] = useState(true);
  const [playingLayerId, setPlayingLayerId] = useState<string | null>(null);
  /** Solo: только этот слой enabled; null = обычный mute-режим. */
  const [soloLayerId, setSoloLayerId] = useState<string | null>(null);
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

  const clampKnobsPx = useCallback((desired: number) => {
    return Math.max(
      LAB_PANEL_LIMITS.KNOBS_MIN,
      Math.min(desired, LAB_PANEL_LIMITS.KNOBS_MAX),
    );
  }, []);

  const musicPadRef = useRef(musicPad);
  musicPadRef.current = musicPad;
  const melodyLayersRef = useRef(melodyLayers);
  melodyLayersRef.current = melodyLayers;

  /* ▣ слоёв: явный список. Старт = все; новые слои добавляются в маску; удалённые вычищаются. */
  useEffect(() => {
    const live = melodyLayers.map((l) => l.id);
    setClipLayerIds((prev) => {
      if (!clipLayersInitedRef.current) {
        clipLayersInitedRef.current = true;
        return live;
      }
      const liveSet = new Set(live);
      const kept = prev.filter((id) => liveSet.has(id));
      const prevSet = new Set(prev);
      const added = live.filter((id) => !prevSet.has(id));
      return [...kept, ...added];
    });
  }, [melodyLayers]);

  const heldKeys = useRef<Set<string>>(new Set());
  /** Физически удерживаемые ноты (клава / мышь). */
  const heldMidisRef = useRef<Set<number>>(new Set());
  /** Звучат из‑за педали после отпускания клавиши. */
  const pedaledMidisRef = useRef<Set<number>>(new Set());
  const noteOnAtRef = useRef<Map<number, number>>(new Map());
  const noteOffTimersRef = useRef<Map<number, number>>(new Map());
  const sustainPedalRef = useRef(false);
  const [sustainPedal, setSustainPedal] = useState(false);
  /** Caps физически зажат (ловим потерянные keyup). */
  const capsPedalHeldRef = useRef(false);
  /** Удержание: звук следует за нажатием; выкл = фиксированная длительность. */
  const [keyGate, setKeyGate] = useState(true);
  const keyGateRef = useRef(keyGate);
  keyGateRef.current = keyGate;
  /** 0 = нужны более длинные нажатия; 1 = лёгкие тапы тоже звучат и подсвечиваются. */
  const [keySensitivity, setKeySensitivity] = useState(0.72);
  const keySensitivityRef = useRef(keySensitivity);
  keySensitivityRef.current = keySensitivity;
  /** Учитывать силу удара (экран: Y/pressure; ПК-клава: база от Sens). */
  const [keyVelocityOn, setKeyVelocityOn] = useState(false);
  const keyVelocityOnRef = useRef(keyVelocityOn);
  keyVelocityOnRef.current = keyVelocityOn;
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
  /** Склейка быстрого набора нот в аккорд — один play на кадр, только финальный набор. */
  const chordPreviewRafRef = useRef(0);
  const chordPreviewPendingRef = useRef<number[] | null>(null);
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

  useEffect(() => {
    const token = markLabUiMounted();
    return () => {
      scheduleLabUiTeardown(token);
    };
  }, []);

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
      const v = layer.voice ? cloneLabVoiceParams(layer.voice) : liveVoice();
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
    /* Сразу в DOM — не ждём ререндер всей лабы (тяжёлый синтез иначе блокирует подсветку). */
    const el = keyboardRef.current?.querySelector(`[data-lab-midi="${midi}"]`);
    if (el) {
      el.classList.toggle('audio-sfx-lab__key--lit', on);
    }
    setActiveMidi((prev) => {
      const has = prev.has(midi);
      if (on === has) return prev;
      const next = new Set(prev);
      if (on) next.add(midi);
      else next.delete(midi);
      return next;
    });
  }, []);

  const setSustainPedalOn = useCallback((on: boolean) => {
    sustainPedalRef.current = on;
    setSustainPedal(on);
    if (on) {
      setStatus('Педаль ⇪ · вкл — ноты тянутся после отпускания');
      return;
    }
    /* Сброс отложенных noteOff: иначе нота ещё не в pedaledMidis и «залипает» */
    for (const [midi, t] of [...noteOffTimersRef.current.entries()]) {
      window.clearTimeout(t);
      noteOffTimersRef.current.delete(midi);
    }
    const damper = Math.min(0.28, Math.max(0.06, voiceRef.current.release ?? 0.12));
    const pedaled = [...pedaledMidisRef.current];
    pedaledMidisRef.current.clear();
    /* Длительность в записи = удержание + педаль (до этого момента) */
    if (recordingRef.current) {
      const endMs = performance.now();
      for (const midi of pedaled) {
        if (heldMidisRef.current.has(midi)) continue;
        const started = noteOnAtRef.current.get(midi);
        if (started == null) continue;
        const sens = keySensitivityRef.current;
        const minRec = 0.06 + (1 - sens) * 0.12;
        const heldForRec = Math.max(minRec, (endMs - started) / 1000);
        noteOnAtRef.current.delete(midi);
        setPhrase((p) => {
          for (let i = p.length - 1; i >= 0; i--) {
            if (p[i]!.midi === midi) {
              const next = p.slice();
              next[i] = { ...next[i]!, dur: heldForRec };
              phraseRef.current = next;
              return next;
            }
          }
          return p;
        });
      }
    } else {
      for (const midi of pedaled) {
        if (!heldMidisRef.current.has(midi)) noteOnAtRef.current.delete(midi);
      }
    }
    const released = releaseUnheldLabNotes(heldMidisRef.current, damper);
    if (released.length > 0) {
      setActiveMidi((prev) => {
        const next = new Set(prev);
        for (const midi of released) next.delete(midi);
        return next;
      });
    }
    setStatus('Педаль · выкл');
  }, []);

  const finalizeRecordedNoteDur = useCallback((midi: number, endMs = performance.now()) => {
    if (!recordingRef.current) {
      noteOnAtRef.current.delete(midi);
      return;
    }
    const started = noteOnAtRef.current.get(midi);
    if (started == null) return;
    noteOnAtRef.current.delete(midi);
    const sens = keySensitivityRef.current;
    const minRec = 0.06 + (1 - sens) * 0.12;
    const heldForRec = Math.max(minRec, (endMs - started) / 1000);
    setPhrase((p) => {
      for (let i = p.length - 1; i >= 0; i--) {
        if (p[i]!.midi === midi) {
          const next = p.slice();
          next[i] = { ...next[i]!, dur: heldForRec };
          phraseRef.current = next;
          return next;
        }
      }
      return p;
    });
  }, []);

  const triggerNote = useCallback(
    async (midi: number, opts?: { gate?: boolean; longGate?: boolean; velocity?: number }) => {
      const v = liveVoice();
      voiceRef.current = v;
      const pedal = sustainPedalRef.current;
      const useGate =
        opts?.gate === true ||
        (opts?.gate !== false && (keyGateRef.current || pedal));
      const longGate = opts?.longGate === true || (useGate && pedal);
      if (recordingRef.current && !useGate) {
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
      const velocity =
        keyVelocityOnRef.current && opts?.velocity != null ? opts.velocity : undefined;
      /* Не await resume здесь — батч в playLabNote сам поднимет ctx; иначе аккорд рвётся */
      void playLabNote(midi, v, {
        ...(useGate ? { gate: true as const, ...(longGate ? { longGate: true as const } : {}) } : {}),
        ...(velocity != null ? { velocity } : {}),
      });
      lastPlayedMidiRef.current = midi;
      /* Без setStatus на каждую ноту — иначе React-рендер рвёт аккорд на «лесенку» */
    },
    [liveVoice, labMode],
  );

  const noteOn = useCallback(
    (midi: number, velocity?: number) => {
      const pendingOff = noteOffTimersRef.current.get(midi);
      if (pendingOff != null) {
        window.clearTimeout(pendingOff);
        noteOffTimersRef.current.delete(midi);
      }
      cancelPendingGateRelease(midi);
      /* Повторный удар по той же ноте — закрыть предыдущую длительность в записи */
      if (noteOnAtRef.current.has(midi) && (pedaledMidisRef.current.has(midi) || recordingRef.current)) {
        finalizeRecordedNoteDur(midi);
      }
      heldMidisRef.current.add(midi);
      pedaledMidisRef.current.delete(midi);
      noteOnAtRef.current.set(midi, performance.now());
      setPressed(midi, true);
      if (recordingRef.current && (keyGateRef.current || sustainPedalRef.current)) {
        if (recordT0.current == null) {
          const epoch = labMode === 'music' ? getLabBeatRecordEpochMs() : null;
          recordT0.current = epoch ?? performance.now();
        }
        const atRaw = (performance.now() - recordT0.current) / 1000;
        const bpm = beatParamsRef.current.bpm;
        const step = 60 / Math.min(190, Math.max(80, bpm)) / 4;
        const at = Math.max(0, Math.round(atRaw / step) * step);
        const provisional = Math.max(0.06, voiceRef.current.duration);
        setPhrase((p) => [...p, { midi, at, dur: provisional }]);
      }
      const wantGate = keyGateRef.current || sustainPedalRef.current;
      void triggerNote(midi, {
        gate: wantGate,
        longGate: sustainPedalRef.current,
        velocity,
      });
    },
    [finalizeRecordedNoteDur, labMode, setPressed, triggerNote],
  );

  const noteOff = useCallback(
    (midi: number) => {
      heldMidisRef.current.delete(midi);
      const started = noteOnAtRef.current.get(midi);
      const heldSec = started != null ? (performance.now() - started) / 1000 : 0;

      const finishOff = () => {
        noteOffTimersRef.current.delete(midi);
        if (heldMidisRef.current.has(midi)) return;
        if (sustainPedalRef.current) {
          pedaledMidisRef.current.add(midi);
          /* dur закроем при отпускании педали — пока тянется сустейн */
          return;
        }
        finalizeRecordedNoteDur(midi);
        setPressed(midi, false);
        if (isLabNoteActive(midi)) {
          const rel = Math.max(0.1, voiceRef.current.release ?? 0.12);
          releaseLabNote(midi, rel);
        }
      };

      /* Фикс. длина без педали — буфер сам доиграет */
      if (!keyGateRef.current && !sustainPedalRef.current) {
        noteOnAtRef.current.delete(midi);
        setPressed(midi, false);
        return;
      }

      /* Лёгкий тап: не гасить мгновенно — минимум звука + подсветка */
      const sens = keySensitivityRef.current;
      const minHold = 0.1 + (1 - sens) * 0.22; /* ~0.10…0.32 с */
      const remainMs = Math.max(0, (minHold - heldSec) * 1000);
      if (remainMs > 8) {
        const prev = noteOffTimersRef.current.get(midi);
        if (prev != null) window.clearTimeout(prev);
        noteOffTimersRef.current.set(midi, window.setTimeout(finishOff, remainMs));
      } else {
        finishOff();
      }
    },
    [finalizeRecordedNoteDur, setPressed],
  );

  const playCurrentChord = useCallback(async (midis: number[], recordHit: boolean) => {
    if (midis.length === 0) return;
    const snap = [...midis];
    const v = liveVoice();
    voiceRef.current = v;
    /* Без await перед play — иначе React-рендер/гонка рвут аккорд на 2 ноты */
    if (recordHit && recordingRef.current) {
      if (recordT0.current == null) {
        const epoch = labMode === 'music' ? getLabBeatRecordEpochMs() : null;
        recordT0.current = epoch ?? performance.now();
      }
      const atRaw = (performance.now() - recordT0.current) / 1000;
      const bpm = beatParamsRef.current.bpm;
      const step = 60 / Math.min(190, Math.max(80, bpm)) / 4;
      const at = Math.max(0, Math.round(atRaw / step) * step);
      setPhrase((p) => [...p, ...snap.map((midi) => ({ midi, at, dur: v.duration }))]);
    }
    lastPlayedMidiRef.current = snap[0]!;
    await playLabChord(snap, v);
    const names = snap.map(midiLabel).join(' + ');
    setStatus(`Аккорд ${snap.length}/${LAB_CHORD_MAX}: ${names}`);
  }, [liveVoice, labMode]);

  /** Превью при наборе: не запускать тяжёлый рендер на каждую клавишу. */
  const scheduleChordPreview = useCallback(
    (midis: number[]) => {
      chordPreviewPendingRef.current = [...midis];
      if (chordPreviewRafRef.current) return;
      chordPreviewRafRef.current = window.requestAnimationFrame(() => {
        chordPreviewRafRef.current = 0;
        const pending = chordPreviewPendingRef.current;
        chordPreviewPendingRef.current = null;
        if (pending && pending.length > 0) void playCurrentChord(pending, false);
      });
    },
    [playCurrentChord],
  );

  const refreshChordLibrary = useCallback(() => {
    setChordLibrary(loadLabChordPresets());
  }, []);

  const applyLabSyncResult = useCallback(
    (r: { ok: boolean; chords: number; presets: number; message: string }) => {
      setLastLabSync({
        at: Date.now(),
        ok: r.ok,
        chords: r.chords,
        presets: r.presets,
        message: r.message,
      });
      refreshChordLibrary();
      setPresetsTick((t) => t + 1);
      return r;
    },
    [refreshChordLibrary],
  );

  const handleToggleLabSync = useCallback(async () => {
    if (!user?.id) return;
    if (syncPanelOpen && !syncInspectLoading) {
      setSyncPanelOpen(false);
      return;
    }
    setSyncPanelOpen(true);
    setSyncInspectLoading(true);
    try {
      const inspect = await inspectLabCloudSync(user.id);
      setSyncInspect(inspect);
      const r = await syncLabLibraryWithCloud(user.id);
      applyLabSyncResult(r);
      setStatus(`Синк · ${r.message}`);
    } finally {
      setSyncInspectLoading(false);
    }
  }, [user?.id, syncPanelOpen, syncInspectLoading, applyLabSyncResult]);

  const handleLabSignOut = useCallback(async () => {
    setAuthMenuOpen(false);
    setSyncPanelOpen(false);
    setSyncInspect(null);
    await signOut();
    setLastLabSync(null);
    setStatus('Вы вышли из аккаунта');
  }, [signOut]);

  const handleLabSwitchAccount = useCallback(async () => {
    setAuthMenuOpen(false);
    setSyncPanelOpen(false);
    setSyncInspect(null);
    await signOut();
    setLastLabSync(null);
    setAuthMode('login');
    setShowAuthModal(true);
    setStatus('Войдите другим аккаунтом');
  }, [signOut]);

  useEffect(() => {
    if (!authMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (!authStripRef.current?.contains(e.target as Node)) {
        setAuthMenuOpen(false);
        setSyncPanelOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setAuthMenuOpen(false);
        setSyncPanelOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [authMenuOpen]);

  useEffect(() => {
    if (!user?.id) {
      setAuthMenuOpen(false);
      setSyncPanelOpen(false);
      setSyncInspect(null);
    }
  }, [user?.id]);

  const saveCurrentChordToLibrary = useCallback(async () => {
    const midis = chordMidisRef.current;
    if (midis.length < 2) {
      setStatus('Собери аккорд (2–8 нот), потом сохрани');
      return;
    }
    const suggested = midis.map(midiLabel).join(' ');
    const name =
      typeof window !== 'undefined'
        ? window.prompt('Имя аккорда', suggested)?.trim()
        : suggested;
    if (!name) {
      setStatus('Сохранение аккорда отменено');
      return;
    }
    const saved = await saveLabChordEverywhere({ name, midis }, user?.id ?? null);
    if (!saved) {
      setStatus('Не удалось сохранить аккорд');
      return;
    }
    refreshChordLibrary();
    setStatus(
      user?.id
        ? `Аккорд «${saved.name}» · локально + облако`
        : `Аккорд «${saved.name}» · локально (войди — синк в облако)`,
    );
  }, [user?.id, refreshChordLibrary]);

  const loadChordFromLibrary = useCallback(
    (chord: LabChordPreset) => {
      const midis = [...chord.midis].sort((a, b) => a - b);
      chordMidisRef.current = midis;
      setChordMidis(midis);
      setChordMode(true);
      void playCurrentChord(midis, false);
      setStatus(`Загружен «${chord.name}»`);
    },
    [playCurrentChord],
  );

  const deleteChordFromLibrary = useCallback(
    async (id: string) => {
      await removeLabChordEverywhere(id, user?.id ?? null);
      refreshChordLibrary();
      setStatus('Аккорд удалён');
    },
    [user?.id, refreshChordLibrary],
  );

  useEffect(() => {
    setPlayerProfile(getPlayerProfile());
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || !authConfigured || !isSupabaseConfigured()) return;
    let cancelled = false;
    void syncLabLibraryWithCloud(user.id).then((r) => {
      if (cancelled) return;
      applyLabSyncResult(r);
      setStatus(`Облако лабы · ${r.message}`);
    });
    return () => {
      cancelled = true;
    };
  }, [user?.id, authConfigured, applyLabSyncResult]);

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
      if (next.length > 0) scheduleChordPreview(next);
      else setStatus('Аккорд пуст — нажми 2–8 клавиш');
    },
    [scheduleChordPreview],
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
    if (last != null) {
      if (chordModeRef.current) {
        setPressed(last, false);
      } else {
        noteOff(last);
      }
    }
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
  }, [noteOff, setPressed]);

  const onKeyboardPointerDown = useCallback(
    (e: ReactPointerEvent, midi: number) => {
      e.preventDefault();
      e.stopPropagation();
      lastGlideMidiRef.current = midi;
      keyboardRef.current?.setPointerCapture(e.pointerId);
      if (e.currentTarget instanceof HTMLElement) e.currentTarget.blur();
      if (chordModeRef.current) {
        setPressed(midi, true);
        toggleChordNote(midi);
        return;
      }
      glideActiveRef.current = true;
      const vel = keyVelocityOnRef.current ? velocityFromPointer(e) : undefined;
      noteOn(midi, vel);
    },
    [noteOn, setPressed, toggleChordNote],
  );

  const onKeyboardPointerMove = useCallback(
    (e: ReactPointerEvent) => {
      if (chordModeRef.current || !glideActiveRef.current) return;
      const midi = midiFromPoint(e.clientX, e.clientY);
      if (midi == null || midi === lastGlideMidiRef.current) return;
      if (lastGlideMidiRef.current != null) noteOff(lastGlideMidiRef.current);
      lastGlideMidiRef.current = midi;
      const host = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-lab-midi]');
      const vel = keyVelocityOnRef.current
        ? host instanceof HTMLElement
          ? velocityFromPointer({
              clientY: e.clientY,
              pressure: e.pressure,
              pointerType: e.pointerType,
              currentTarget: host,
            })
          : 0.7
        : undefined;
      noteOn(midi, vel);
    },
    [midiFromPoint, noteOff, noteOn],
  );

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'CapsLock') {
        if (isTextTypingTarget(e.target)) return;
        e.preventDefault();
        /* Потерянный keyup: Caps ещё «зажат» в логике → этот down снимает залипание */
        if (capsPedalHeldRef.current) {
          capsPedalHeldRef.current = false;
          setSustainPedalOn(false);
          return;
        }
        capsPedalHeldRef.current = true;
        setSustainPedalOn(true);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const off = pianoOffset(e);
      if (off == null) return;
      if (isTextTypingTarget(e.target)) return;
      const id = holdId(e);
      if (heldKeys.current.has(id)) return;
      e.preventDefault();
      heldKeys.current.add(id);
      const midi = rootMidiRef.current + off;
      if (chordModeRef.current) {
        setPressed(midi, true);
        toggleChordNote(midi);
        return;
      }
      const vel = keyVelocityOnRef.current
        ? velocityFromComputerKey(keySensitivityRef.current)
        : undefined;
      noteOn(midi, vel);
    };
    const onUp = (e: KeyboardEvent) => {
      if (e.code === 'CapsLock') {
        if (isTextTypingTarget(e.target)) return;
        e.preventDefault();
        capsPedalHeldRef.current = false;
        setSustainPedalOn(false);
        return;
      }
      const id = holdId(e);
      heldKeys.current.delete(id);
      const off = pianoOffset(e);
      if (off == null) return;
      const midi = rootMidiRef.current + off;
      if (chordModeRef.current) {
        setPressed(midi, false);
        return;
      }
      noteOff(midi);
    };
    const onBlur = () => {
      heldKeys.current.clear();
      capsPedalHeldRef.current = false;
      for (const t of noteOffTimersRef.current.values()) window.clearTimeout(t);
      noteOffTimersRef.current.clear();
      for (const midi of [...heldMidisRef.current]) noteOff(midi);
      heldMidisRef.current.clear();
      if (sustainPedalRef.current) setSustainPedalOn(false);
      keyboardRef.current?.querySelectorAll('.audio-sfx-lab__key--lit').forEach((el) => {
        el.classList.remove('audio-sfx-lab__key--lit');
      });
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
  }, [noteOff, noteOn, setPressed, setSustainPedalOn, toggleChordNote]);

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
    const bars = normalizeLabBars(beatParamsRef.current.bars);
    const overHint =
      labMode === 'music' && bars >= 8
        ? ` Уже есть ${bars} тактов: новый слой ляжет поверх. Для 2-й половины играй на тактах ${bars / 2 + 1}–${bars} (по playhead).`
        : '';
    if (labMode === 'music' && beatOnRef.current) {
      const epoch = getLabBeatRecordEpochMs();
      recordT0.current = epoch ?? performance.now();
      setRecording(true);
      setStatus(
        `● REC новый слой — синхрон с петлёй (1/16). Сыграй, ■ Стоп.${overHint}`,
      );
      return;
    }
    recordT0.current = null;
    setRecording(true);
    setStatus(
      labMode === 'music'
        ? `Запись нового слоя… (включи «Петля» для синка).${overHint}`
        : `Запись для «${activeTask.title}»…`,
    );
  };

  const musicRestartTimer = useRef<number | null>(null);

  const restartMusicLoop = useCallback(
    (
      layers: LabMelodyLayer[] = melodyLayersRef.current,
      pad: LabMusicPadParams = musicPadRef.current,
      opts?: { immediate?: boolean },
    ) => {
      if (!beatOnRef.current || labMode !== 'music') return;
      /* Ноты в state не переписываем — fit/cap только внутри renderMusicBed */
      const run = () => {
        musicRestartTimer.current = null;
        void startLabMusicBed(
          beatParamsRef.current,
          pad,
          [],
          voiceRef.current,
          lastPlayedMidiRef.current,
          layers,
        ).then((ok) => {
          /* Отменённый gen (false) не гасит beatOn — старая петля ещё играет.
           * true = новый буфер уже в эфире. */
          if (!ok && beatOnRef.current && !isLabBeatOn()) {
            /* Редкий случай: последний старт упал после stop — поднять снова */
            void startLabMusicBed(
              beatParamsRef.current,
              pad,
              [],
              voiceRef.current,
              lastPlayedMidiRef.current,
              melodyLayersRef.current,
            );
          }
        });
      };
      if (musicRestartTimer.current != null) {
        window.clearTimeout(musicRestartTimer.current);
        musicRestartTimer.current = null;
      }
      if (opts?.immediate) {
        run();
        return;
      }
      /* Слайдеры/крутилки не должны каждый кадр пересобирать 8–16 тактов WAV */
      musicRestartTimer.current = window.setTimeout(run, 200);
    },
    [labMode],
  );

  const insertChordIntoTrack = useCallback(
    (chord: LabChordPreset) => {
      if (labMode !== 'music') {
        setStatus('Вставка в трек — в режиме ♪ Музыка');
        return;
      }
      const phase = getLabBeatLoopPhaseSec() ?? 0;
      const bpm = beatParamsRef.current.bpm;
      const dur = voiceRef.current.duration;
      const enabled = melodyLayersRef.current.filter((l) => l.enabled);
      const targetId = staffLayerId ?? enabled[enabled.length - 1]?.id ?? null;

      if (!targetId) {
        const layer = createMelodyLayer(
          insertChordNotesAt([], chord.midis, phase, bpm, dur),
          1,
          dur,
          chord.name,
          voiceRef.current,
        );
        melodyLayersRef.current = [layer];
        setMelodyLayers([layer]);
        setStaffLayerId(layer.id);
        if (beatOnRef.current) {
          restartMusicLoop([layer], musicPadRef.current, { immediate: true });
        }
        setStatus(`Слой «${chord.name}» · аккорд на ${phase.toFixed(2)}с`);
        return;
      }

      const next = melodyLayersRef.current.map((l) =>
        l.id === targetId
          ? {
              ...l,
              notes: insertChordNotesAt(l.notes, chord.midis, phase, bpm, dur),
            }
          : l,
      );
      melodyLayersRef.current = next;
      setMelodyLayers(next);
      if (beatOnRef.current) {
        restartMusicLoop(next, musicPadRef.current, { immediate: true });
      }
      const layerName = next.find((l) => l.id === targetId)?.name ?? 'слой';
      setStatus(`«${chord.name}» → ${layerName} @ ${phase.toFixed(2)}с`);
    },
    [labMode, staffLayerId, restartMusicLoop],
  );

  useEffect(
    () => () => {
      if (musicRestartTimer.current != null) window.clearTimeout(musicRestartTimer.current);
    },
    [],
  );

  const stopRecord = () => {
    setRecording(false);
    recordingRef.current = false;
    /* Закрыть длины нот, ещё висящих на педали / не отпущенных */
    const endMs = performance.now();
    let notes = [...phraseRef.current];
    const openMidis = new Set<number>([
      ...pedaledMidisRef.current,
      ...noteOnAtRef.current.keys(),
    ]);
    for (const midi of openMidis) {
      const started = noteOnAtRef.current.get(midi);
      if (started == null) continue;
      const sens = keySensitivityRef.current;
      const minRec = 0.06 + (1 - sens) * 0.12;
      const heldForRec = Math.max(minRec, (endMs - started) / 1000);
      for (let i = notes.length - 1; i >= 0; i--) {
        if (notes[i]!.midi === midi) {
          notes[i] = { ...notes[i]!, dur: heldForRec };
          break;
        }
      }
      noteOnAtRef.current.delete(midi);
    }
    phraseRef.current = notes;
    const n = notes.length;

    if (labMode === 'music') {
      if (n === 0) {
        setPhrase([]);
        phraseRef.current = [];
        recordT0.current = null;
        setStatus('Запись пуста — слой не добавлен');
        return;
      }
      const bpm = beatParamsRef.current.bpm;
      const bars = normalizeLabBars(beatParamsRef.current.bars);
      /* Сетка = bars×bpm; live-буфер может чуть отличаться — для wrap берём шкалу сетки */
      const loopDur = labSectionDurationSec(bpm, bars);
      const rawMaxAt = notes.reduce((m, x) => Math.max(m, x.at), 0);
      const laps = Math.max(1, Math.ceil((rawMaxAt + 0.001) / loopDur));
      notes = quantizePhraseNotes(wrapPhraseNotesToLoop(notes, loopDur), bpm, 4);
      notes = fitMelodyNotesToLoop(notes, loopDur);
      const ordinal = melodyLayersRef.current.length + 1;
      const defaultName = `Слой ${ordinal}`;
      setPendingLayerSave({
        notes,
        laps,
        defaultName,
        name: defaultName,
      });
      setPhrase([]);
      phraseRef.current = [];
      recordT0.current = null;
      setStatus(`Запись: ${notes.length} нот — сохранить слой?`);
      return;
    }

    setStatus(n ? `Записано ${n} нот для «${activeTask.title}»` : 'Запись пуста');
  };

  const discardPendingLayerSave = useCallback(() => {
    setPendingLayerSave(null);
    setStatus('Запись отменена — слой не добавлен');
  }, []);

  const commitPendingLayerSave = useCallback(() => {
    const pending = pendingLayerSave;
    if (!pending || pending.notes.length === 0) {
      setPendingLayerSave(null);
      return;
    }
    const name =
      pending.name.trim().length > 0 ? pending.name.trim() : pending.defaultName;
    const ordinal = melodyLayersRef.current.length + 1;
    const layer = createMelodyLayer(
      pending.notes,
      ordinal,
      voiceRef.current.duration,
      name,
      voiceRef.current,
    );
    const next = [...melodyLayersRef.current, layer];
    melodyLayersRef.current = next;
    setMelodyLayers(next);
    setStaffLayerId(layer.id);
    setPendingLayerSave(null);
    setLayerDockName(layer.name);
    setLayerDockOpen(true);
    setFocusArrange(true);

    const padNext = {
      ...musicPadRef.current,
      melody: Math.max(musicPadRef.current.melody, 0.55),
    };
    musicPadRef.current = padNext;
    setMusicPad(padNext);

    if (beatOnRef.current) {
      restartMusicLoop(next, padNext, { immediate: true });
      setStatus(
        pending.laps > 1
          ? `«${layer.name}»: ${pending.notes.length} нот (круг ${pending.laps}) · стан открыт`
          : `«${layer.name}»: ${pending.notes.length} нот · стан открыт`,
      );
    } else {
      setStatus(`Слой «${layer.name}» сохранён · стан открыт · включи «Петля»`);
    }
  }, [pendingLayerSave, restartMusicLoop]);

  const startNewTrack = () => {
    if (labMode !== 'music') {
      setLabMode('music');
      setBakeBeatInFile(false);
      setPresetKindTab('music');
    }
    const dirty =
      melodyLayersRef.current.length > 0 ||
      phraseRef.current.length > 0 ||
      recordingRef.current;
    if (dirty) {
      const ok =
        typeof window === 'undefined' ||
        window.confirm('Начать новый трек? Текущие слои и буфер записи будут очищены.');
      if (!ok) return;
    }
    stopLabPhrase();
    setPlayingLayerId(null);
    setRecording(false);
    setPhrase([]);
    phraseRef.current = [];
    recordT0.current = null;
    melodyLayersRef.current = [];
    setMelodyLayers([]);
    setStaffLayerId(null);
    setSoloLayerId(null);
    setStitchPickIds(null);
    setActivePresetId(null);
    const pad = normalizeMusicPad({ ...DEFAULT_LAB_MUSIC_PAD });
    musicPadRef.current = pad;
    setMusicPad(pad);
    /* Чистый холст: пустая сетка, не «залипший» пресет 808 с прошлого трека */
    const cleanBeat: LabBeatParams = {
      ...DEFAULT_LAB_BEAT,
      bpm: beatParamsRef.current.bpm || DEFAULT_LAB_BEAT.bpm,
      rhythm: 'custom',
      pattern: emptyBeatPatternForBars(8),
      kick: 0.85,
      snare: 0.7,
      hats: 0.55,
      bass: 0.7,
      volume: 1,
      bars: 8,
      industrial: 0.15,
      crackle: 0,
      depth: 0.7,
    };
    beatParamsRef.current = cleanBeat;
    setBeatParams(cleanBeat);
    setInspectorTab('beat');
    /* Новый холст — тишина: не продолжаем старую петлю и не автостартуем */
    if (beatOnRef.current || isLabBeatOn() || isLabOneShotPlaying()) {
      setBeatOn(false);
      beatOnRef.current = false;
      setOneShotOn(false);
      stopLabBeat();
    }
    setStatus('Новый трек · пустой бит · ▶ один раз · ↻ петля');
  };

  const toggleLoop = () => {
    const next = !beatOn;
    setBeatOn(next);
    if (next) {
      stopLabOneShot();
      setOneShotOn(false);
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
      setOneShotOn(false);
      setStatus('Стоп');
    }
  };

  /** Один проход трека без зацикливания; повторный клик / ■ — стоп. */
  const playOnce = () => {
    if (oneShotOn || isLabOneShotPlaying()) {
      stopLabOneShot();
      setOneShotOn(false);
      setStatus('Стоп (один раз)');
      return;
    }
    if (beatOnRef.current) {
      setBeatOn(false);
      beatOnRef.current = false;
      stopLabBeat();
    }
    const start =
      labMode === 'music'
        ? playLabMusicOnce(
            beatParamsRef.current,
            musicPadRef.current,
            [],
            voiceRef.current,
            lastPlayedMidiRef.current,
            melodyLayersRef.current,
          )
        : playLabBeatOnce(beatParamsRef.current);
    void start.then((ok) => {
      setOneShotOn(ok);
      setStatus(ok ? '▶ Один раз (без петли)' : 'Нечего проиграть');
    });
  };

  useEffect(() => {
    if (!oneShotOn) return;
    let raf = 0;
    const tick = () => {
      if (!isLabOneShotPlaying()) {
        setOneShotOn(false);
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [oneShotOn]);

  const previewMelodies = () => {
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
      setStatus(`Превью ${enabled.length} слой(ёв)`);
      return;
    }
    const samples = renderPhraseSamples(phrase, v);
    if (bakeBeatInFile && samples.length > 0) {
      const mixed = mixBeatIntoSamples(samples, { ...DEFAULT_LAB_BEAT, ...beatParamsRef.current });
      void playWavBytes(encodeWavMono(mixed));
      setStatus(`Фраза + бит`);
    } else {
      void playLabPhrase(phrase, v);
      setStatus('Фраза');
    }
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
    if (user?.id) {
      const list = loadLabPresets();
      const just = list.find((p) => (p.kind ?? 'sfx') === 'sfx' && p.slotHint === id);
      if (just) void pushLabPresetToCloud(user.id, just);
    }
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
    const mergedBars = normalizeLabBars(next.bars ?? prev.bars);
    const rawPattern =
      next.pattern ??
      (next.rhythm === 'custom' ? prev.pattern : undefined) ??
      barPatternFromRhythm(next.rhythm ?? prev.rhythm);
    const mergedRhythm = next.rhythm ?? prev.rhythm;
    const prevBars = normalizeLabBars(prev.bars ?? 4);
    const barsGrew = mergedBars > prevBars;
    /* Удлинение петли: не тайлить 1-й такт на всю сетку (ломает 1–N и «рисует» хеты везде). */
    const mergedPatternRepeat =
      mergedRhythm === 'custom'
        ? barsGrew
          ? false
          : (next.patternRepeat ?? prev.patternRepeat ?? false)
        : undefined;
    const merged: LabBeatParams = {
      ...DEFAULT_LAB_BEAT,
      ...next,
      bars: mergedBars,
      patternRepeat: mergedPatternRepeat,
      pattern:
        mergedRhythm === 'custom'
          ? resolveCustomBeatPattern(rawPattern, mergedBars, mergedPatternRepeat)
          : normalizeBeatPatternForBars(rawPattern, mergedBars, {
              /* пресет-ритм при росте bars — дописать шаги без перезаписи старых */
              tileOneBar: !barsGrew,
            }),
    };
    const patternTileOneBar = merged.rhythm !== 'custom' || merged.patternRepeat === true;
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
      patternsEqual(prev.pattern, merged.pattern, merged.bars ?? 4, patternTileOneBar);

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
        if (musicRestartTimer.current != null) {
          window.clearTimeout(musicRestartTimer.current);
          musicRestartTimer.current = null;
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

  const loopBarsNow = normalizeLabBars(beatParams.bars);

  const stitchTargetBars = addLabBars(loopBarsNow, stitchAddDelta);

  const pushArrangeUndo = useCallback(() => {
    arrangeUndoRef.current = [
      ...arrangeUndoRef.current.slice(-24),
      {
        beat: cloneLabBeatParams(beatParamsRef.current),
        layers: cloneLabMelodyLayers(melodyLayersRef.current),
      },
    ];
    setArrangeUndoCount(arrangeUndoRef.current.length);
  }, []);

  const undoArrangeEdit = useCallback(() => {
    const prev = arrangeUndoRef.current.pop();
    setArrangeUndoCount(arrangeUndoRef.current.length);
    if (!prev) {
      setStatus('Нечего отменять');
      return;
    }
    beatParamsRef.current = prev.beat;
    setBeatParams(prev.beat);
    melodyLayersRef.current = prev.layers;
    setMelodyLayers(prev.layers);
    if (beatOnRef.current) {
      restartMusicLoop(prev.layers, musicPadRef.current, { immediate: true });
    }
    setStatus('Отменено');
  }, [restartMusicLoop]);

  const getClipSelect = useCallback(() => {
    const totalBars = normalizeLabBars(beatParamsRef.current.bars);
    const from = Math.min(clipFromBar, totalBars);
    const to = Math.min(Math.max(clipToBar, from), totalBars);
    return {
      fromBar: from,
      toBar: to,
      kick: clipKick,
      snare: clipSnare,
      hats: clipHats,
      layerIds: clipLayerIds,
    };
  }, [clipFromBar, clipToBar, clipKick, clipSnare, clipHats, clipLayerIds]);

  const commitClipBuffer = useCallback((clip: LabLoopClip) => {
    const snap = cloneLoopClip(clip);
    loopClipRef.current = snap;
    setLoopClipInfo(summarizeLoopClip(snap));
    setBufferLayerIds(snap.layers?.map((l) => l.id) ?? []);
    setBufferDrums({
      kick: Boolean(snap.drums?.kick),
      snare: Boolean(snap.drums?.snare),
      hats: Boolean(snap.drums?.hats),
    });
  }, []);

  const runClipCopy = useCallback(() => {
    const select = getClipSelect();
    if (!select.kick && !select.snare && !select.hats && select.layerIds.length === 0) {
      setStatus('Нечего копировать — отметь строки (▣) и такты');
      return;
    }
    const clip = extractLoopClip(
      beatParamsRef.current,
      melodyLayersRef.current,
      select,
      resolveDisplayPattern(beatParamsRef.current),
    );
    if (!clip) {
      setStatus('В выделении пусто — выбери другие такты или дорожки');
      return;
    }
    commitClipBuffer(clip);
    const nextPaste = Math.min(LAB_BARS_MAX, select.toBar + 1);
    setClipPasteAt(nextPaste);
    setStatus(`Скопировано ${summarizeLoopClip(clip)} → вставка с ${nextPaste}`);
  }, [commitClipBuffer, getClipSelect]);

  const applyClipPaste = useCallback(
    (mode: LabPasteMode, atOverride?: number) => {
      const clip = loopClipRef.current;
      if (!clip) {
        setStatus('Буфер пуст — сначала Ctrl+C / 📋');
        return;
      }
      const pasteAt = Math.max(
        1,
        Math.min(LAB_BARS_MAX, Math.round(atOverride ?? clipPasteAt)),
      );
      pushArrangeUndo();
      const result = pasteLoopClip(
        beatParamsRef.current,
        melodyLayersRef.current,
        clip,
        pasteAt,
        mode,
      );
      beatParamsRef.current = result.beat;
      setBeatParams(result.beat);
      melodyLayersRef.current = result.layers;
      setMelodyLayers(result.layers);
      setPasteConflict(null);
      if (beatOnRef.current) {
        restartMusicLoop(result.layers, musicPadRef.current, { immediate: true });
      }
      const modeLabel = mode === 'mix' ? 'смешано' : 'заменено';
      const melN = result.matchedLayerIds.length + result.createdLayerIds.length;
      const drumN = clip.drums
        ? (['kick', 'snare', 'hats'] as const).filter((k) => clip.drums?.[k]).length
        : 0;
      const extra = [
        result.truncated ? 'обрезано' : null,
        result.createdLayerIds.length ? `+${result.createdLayerIds.length} нов.слой` : null,
        result.extendedTo ? `петля→${result.extendedTo}` : null,
      ].filter(Boolean);
      setStatus(
        `Вставлено ${result.actualAt}–${result.endBar} (${modeLabel}) · ♪${melN} · барабаны:${drumN}${
          extra.length ? ` · ${extra.join(' · ')}` : ''
        }`,
      );
      setClipPasteAt(Math.min(LAB_BARS_MAX, result.endBar + 1));
    },
    [clipPasteAt, pushArrangeUndo, restartMusicLoop],
  );

  const runClipPaste = useCallback(() => {
    const clip = loopClipRef.current;
    if (!clip) {
      setStatus('Буфер пуст — сначала Ctrl+C / 📋');
      return;
    }
    const pasteAt = Math.max(1, Math.min(LAB_BARS_MAX, Math.round(clipPasteAt)));
    const endBar = Math.min(LAB_BARS_MAX, pasteAt + clip.barsCount - 1);
    const occupied = loopPasteTargetHasContent(
      beatParamsRef.current,
      melodyLayersRef.current,
      clip,
      pasteAt,
      resolveDisplayPattern(beatParamsRef.current),
    );
    if (occupied) {
      setPasteConflict({ pasteAt, endBar });
      setStatus(`В ${pasteAt}–${endBar} уже есть звук — выбери: заменить / смешать`);
      return;
    }
    applyClipPaste('replace');
  }, [applyClipPaste, clipPasteAt]);

  const runClipClear = useCallback(() => {
    const select = getClipSelect();
    if (!select.kick && !select.snare && !select.hats && select.layerIds.length === 0) {
      setStatus('Отметьте строки (▣) для очистки');
      return;
    }
    pushArrangeUndo();
    const cleared = clearLoopRegion(beatParamsRef.current, melodyLayersRef.current, select);
    beatParamsRef.current = cleared.beat;
    setBeatParams(cleared.beat);
    melodyLayersRef.current = cleared.layers;
    setMelodyLayers(cleared.layers);
    if (beatOnRef.current) {
      restartMusicLoop(cleared.layers, musicPadRef.current, { immediate: true });
    }
    setStatus(`Удалено содержимое ${select.fromBar}–${select.toBar} (▣ дорожки)`);
  }, [getClipSelect, pushArrangeUndo, restartMusicLoop]);

  const runClipCut = useCallback(() => {
    const select = getClipSelect();
    if (!select.kick && !select.snare && !select.hats && select.layerIds.length === 0) {
      setStatus('Нечего вырезать — отметь строки (▣) и такты');
      return;
    }
    const clip = extractLoopClip(
      beatParamsRef.current,
      melodyLayersRef.current,
      select,
      resolveDisplayPattern(beatParamsRef.current),
    );
    if (!clip) {
      setStatus('В выделении пусто — выбери другие такты или дорожки');
      return;
    }
    commitClipBuffer(clip);
    setClipPasteAt(Math.min(LAB_BARS_MAX, select.toBar + 1));
    pushArrangeUndo();
    const cleared = clearLoopRegion(beatParamsRef.current, melodyLayersRef.current, select);
    beatParamsRef.current = cleared.beat;
    setBeatParams(cleared.beat);
    melodyLayersRef.current = cleared.layers;
    setMelodyLayers(cleared.layers);
    if (beatOnRef.current) {
      restartMusicLoop(cleared.layers, musicPadRef.current, { immediate: true });
    }
    setStatus(`Вырезано ${summarizeLoopClip(clip)}`);
  }, [commitClipBuffer, getClipSelect, pushArrangeUndo, restartMusicLoop]);
  const runClipAction = useCallback(
    (action: 'copy' | 'cut' | 'paste' | 'clear' | 'undo') => {
      if (action === 'copy') runClipCopy();
      else if (action === 'cut') runClipCut();
      else if (action === 'paste') runClipPaste();
      else if (action === 'clear') runClipClear();
      else undoArrangeEdit();
    },
    [runClipClear, runClipCopy, runClipCut, runClipPaste, undoArrangeEdit],
  );

  /* Ctrl/Cmd+C/V/X/Z — буфер тактов; Delete — удалить содержимое выделения. */
  useEffect(() => {
    if (labMode !== 'music') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && pasteConflict) {
        e.preventDefault();
        setPasteConflict(null);
        setStatus('Вставка отменена');
        return;
      }
      if (
        e.key === 'Delete' &&
        !(e.ctrlKey || e.metaKey || e.altKey) &&
        !isClipShortcutBlocked(e.target)
      ) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('.lab-staff, .lab-staff-editor, textarea, input, [contenteditable="true"]')) {
          return;
        }
        e.preventDefault();
        e.stopPropagation();
        runClipClear();
        return;
      }
      if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
      if (isClipShortcutBlocked(e.target)) return;
      const code = e.code;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
      const isCopy = code === 'KeyC' || key === 'c' || key === 'с';
      const isPaste = code === 'KeyV' || key === 'v' || key === 'м';
      const isCut = code === 'KeyX' || key === 'x' || key === 'ч';
      const isUndo = code === 'KeyZ' || key === 'z' || key === 'я';
      if (!isCopy && !isPaste && !isCut && !isUndo) return;
      e.preventDefault();
      e.stopPropagation();
      if (isCopy) runClipCopy();
      else if (isPaste) runClipPaste();
      else if (isCut) runClipCut();
      else undoArrangeEdit();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [labMode, pasteConflict, runClipClear, runClipCopy, runClipCut, runClipPaste, undoArrangeEdit]);

  const scrollToStitchPanel = useCallback(() => {
    setLoopToolsOpen(true);
    window.requestAnimationFrame(() => {
      stitchPanelRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  }, []);

  const libraryCollapsed = panelLayout.libraryCollapsed === true;

  const toggleLibraryCollapsed = useCallback(() => {
    const next = !panelLayoutRef.current.libraryCollapsed;
    patchPanelLayout({ libraryCollapsed: next }, true);
    setStatus(next ? 'Библиотека свёрнута' : 'Библиотека развёрнута');
  }, [patchPanelLayout]);

  const beginStitchBars = useCallback(
    (delta: LabBarsAddDelta) => {
      const cur = normalizeLabBars(beatParamsRef.current.bars);
      const nxt = addLabBars(cur, delta);
      if (!nxt) {
        setStatus(`Уже ${LAB_BARS_MAX} тактов (макс.)`);
        return;
      }
      setStitchAddDelta(delta);
      const enabled = melodyLayersRef.current.filter((l) => l.enabled).map((l) => l.id);
      setStitchPickIds(
        enabled.length > 0 ? enabled : melodyLayersRef.current.map((l) => l.id),
      );
      setLoopToolsOpen(true);
      setStatus(`+${delta} такт (${cur}→${nxt}): в окне «Такты» → Склеить / Отмена`);
      scrollToStitchPanel();
    },
    [scrollToStitchPanel],
  );

  const cancelStitchBars = useCallback(() => {
    setStitchPickIds(null);
    setStatus('Добавление тактов отменено');
  }, []);

  const confirmStitchBars = useCallback(() => {
    const curBars = normalizeLabBars(beatParamsRef.current.bars);
    const nextBars = addLabBars(curBars, stitchAddDelta);
    if (!nextBars) {
      setStitchPickIds(null);
      setStatus(`Уже ${LAB_BARS_MAX} тактов`);
      return;
    }
    pushArrangeUndo();
    const offset = labSectionDurationSec(beatParamsRef.current.bpm, curBars);
    const ids = stitchPickIds ?? [];
    const nextLayers = extendMelodyLayersIntoNextSection(melodyLayersRef.current, ids, offset);
    melodyLayersRef.current = nextLayers;
    setMelodyLayers(nextLayers);
    /* Не тайлить бит при удлинении — иначе хеты с такта 1 заливают всю сетку */
    applyBeatParams(
      {
        ...beatParamsRef.current,
        bars: nextBars,
        ...(beatParamsRef.current.rhythm === 'custom' ? { patternRepeat: false } : {}),
      },
      `${curBars}→${nextBars}`,
      null,
    );
    setStitchPickIds(null);
    setSwapChunkA(0);
    setSwapChunkB(1);
    if (beatOnRef.current) {
      restartMusicLoop(nextLayers, musicPadRef.current, { immediate: true });
    }
    setStatus(
      ids.length > 0
        ? `Петля ${curBars}→${nextBars} · скопировано дорожек: ${ids.length}. Новые такты ${curBars + 1}–${nextBars}.`
        : `Петля ${curBars}→${nextBars}. Новые такты ${curBars + 1}–${nextBars} пустые.`,
    );
  }, [applyBeatParams, pushArrangeUndo, restartMusicLoop, stitchAddDelta, stitchPickIds]);

  const requestAddLoopBars = useCallback(
    (delta: LabBarsAddDelta) => {
      if (labMode === 'music') {
        beginStitchBars(delta);
        return;
      }
      const cur = normalizeLabBars(beatParamsRef.current.bars);
      const next = addLabBars(cur, delta);
      if (!next) {
        setStatus(`Уже ${LAB_BARS_MAX} тактов (макс.)`);
        return;
      }
      applyBeatParams({ ...beatParamsRef.current, bars: next }, `+${delta} такт → ${next}`, null);
    },
    [applyBeatParams, beginStitchBars, labMode],
  );

  const displayPattern = useMemo(
    () => firstBarPattern(resolveDisplayPattern(beatParams)),
    [beatParams],
  );

  const applyCustomPattern = useCallback(
    (pattern: LabBeatBarPattern, label = 'свой ритм', bumpLevels = true, tileOneBar = false) => {
      const prev = beatParamsRef.current;
      const bars = normalizeLabBars(prev.bars);
      const full = normalizeBeatPatternForBars(pattern, bars, { tileOneBar });
      let kick = prev.kick;
      let snare = prev.snare;
      let hats = prev.hats;
      if (bumpLevels) {
        if (full.kick.some(Boolean) && kick < 0.05) kick = 0.85;
        if (full.snare.some(Boolean) && snare < 0.05) snare = 0.7;
        if (full.hats.some(Boolean) && hats < 0.05) hats = 0.55;
      }

      applyBeatParams(
        { ...prev, rhythm: 'custom', pattern: full, kick, snare, hats, patternRepeat: tileOneBar },
        label,
        null,
      );
    },
    [applyBeatParams],
  );

  const togglePatternStep = useCallback(
    (lane: LabBeatLaneId, step: number, globalStep?: number) => {
      const prev = beatParamsRef.current;
      const display = resolveDisplayPattern(prev);
      const bars = normalizeLabBars(prev.bars);
      const idx = globalStep ?? step;
      const level = prev[lane] ?? 0;
      const lit = Boolean(display[lane][idx]);

      if (prev.rhythm !== 'custom' && level < 0.05 && lit) {
        const pattern = cloneBeatPattern(display);
        const bump = lane === 'kick' ? 0.85 : lane === 'snare' ? 0.7 : 0.55;
        applyBeatParams(
          { ...prev, rhythm: 'custom', pattern, [lane]: bump },
          `вкл ${lane === 'kick' ? 'бочку' : lane === 'snare' ? 'снейр' : 'хеты'}`,
          null,
        );
        return;
      }

      const next = cloneBeatPattern(display);
      next[lane][idx] = !lit;
      /* Секвенсор = только 1-й такт: сброс старого «эха» на 2–4 тактах той же доли. */
      if (globalStep == null && step < LAB_BEAT_STEPS_PER_BAR) {
        for (let bar = 1; bar < bars; bar++) {
          const echo = bar * LAB_BEAT_STEPS_PER_BAR + step;
          if (echo < next[lane].length) next[lane][echo] = false;
        }
      }
      applyCustomPattern(next, `сетка: ${lane} · шаг ${idx + 1}`, true, false);
    },
    [applyBeatParams, applyCustomPattern],
  );

  const applyMusicPad = useCallback(
    (next: LabMusicPadParams) => {
      const normalized = normalizeMusicPad(next);
      setMusicPad(normalized);
      musicPadRef.current = normalized;
      if (beatOnRef.current && labMode === 'music') {
        restartMusicLoop(melodyLayersRef.current, normalized);
      }
    },
    [labMode, restartMusicLoop],
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
    setVoice(cloneLabVoiceParams(draft.voice));
    voiceRef.current = cloneLabVoiceParams(draft.voice);
    const bars = normalizeLabBars(draft.beat.bars);
    const restoredBeat = cloneLabBeatParams({
      ...draft.beat,
      pattern:
        draft.beat.rhythm === 'custom'
          ? resolveCustomBeatPattern(draft.beat.pattern, bars, draft.beat.patternRepeat)
          : normalizeBeatPatternForBars(
              draft.beat.pattern ?? barPatternFromRhythm(draft.beat.rhythm),
              bars,
              { tileOneBar: true },
            ),
      patternRepeat: draft.beat.rhythm === 'custom' ? (draft.beat.patternRepeat ?? false) : undefined,
    });
    setBeatParams(restoredBeat);
    beatParamsRef.current = restoredBeat;
    const padNorm = cloneLabMusicPad(draft.pad);
    setMusicPad(padNorm);
    musicPadRef.current = padNorm;
    const stamped = ensureMelodyLayerVoices(
      cloneLabMelodyLayers(draft.layers ?? []),
      draft.voice,
    );
    setMelodyLayers(stamped.layers);
    melodyLayersRef.current = stamped.layers;
    setMusicSlot(draft.musicSlot);
    setLabMode(draft.labMode);
    setStaffLayerId(draft.staffLayerId);
    setBakeBeatInFile(draft.bakeBeat);
    setFocusArrange(!!draft.focusArrange);
    const flags = loadLabUiFlags();
    const wantFloat = draft.keyboardFloat === true || flags?.keyboardFloat === true;
    const wantKbOpen = draft.keyboardOpen || flags?.keyboardOpen === true || wantFloat;
    setKeyboardOpen(!!wantKbOpen);
    setKeyboardFloat(wantFloat);
    const wantLoop = draft.beatOn === true || flags?.beatOn === true;
    if (wantLoop) {
      setBeatOn(true);
      beatOnRef.current = true;
      const start =
        draft.labMode === 'music'
          ? startLabMusicBed(
              restoredBeat,
              padNorm,
              [],
              voiceRef.current,
              lastPlayedMidiRef.current,
              stamped.layers,
            )
          : startLabBeat(restoredBeat);
      void start.then((ok) => {
        if (!ok) {
          setBeatOn(false);
          beatOnRef.current = false;
          saveLabUiFlags({ beatOn: false, keyboardOpen: !!wantKbOpen, keyboardFloat: wantFloat });
          setStatus(
            stamped.stamped
              ? 'Восстановлен черновик · петля не поднялась'
              : 'Восстановлен черновик · петля не поднялась',
          );
          return;
        }
        saveLabUiFlags({ beatOn: true, keyboardOpen: !!wantKbOpen, keyboardFloat: wantFloat });
        setStatus(
          stamped.stamped
            ? 'Восстановлен черновик · тембр слоёв · петля'
            : 'Восстановлен черновик · петля',
        );
      });
    } else {
      saveLabUiFlags({ beatOn: false, keyboardOpen: !!wantKbOpen, keyboardFloat: wantFloat });
      setStatus(
        stamped.stamped
          ? 'Восстановлен черновик · тембр слоёв зафиксирован'
          : 'Восстановлен черновик студии',
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Автосохранение черновика */
  useEffect(() => {
    const t = window.setTimeout(() => {
      saveLabUiFlags({ beatOn, keyboardOpen, keyboardFloat });
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
        keyboardFloat,
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
    keyboardFloat,
  ]);

  /* Мгновенно зафиксировать UI-флаги (не ждать 600мс autosave) */
  useEffect(() => {
    saveLabUiFlags({ beatOn, keyboardOpen, keyboardFloat });
  }, [beatOn, keyboardOpen, keyboardFloat]);

  /* Watchdog: вкладка/AudioContext — не терять петлю и UI после suspend */
  useEffect(() => {
    const revive = () => {
      void resumeLabAudio().then(() => {
        if (!beatOnRef.current || isLabBeatOn()) return;
        if (labMode !== 'music' && labMode !== 'sfx') return;
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
          if (ok) setStatus('Петля восстановлена');
        });
      });
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') revive();
    };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', revive);
    let ctx: AudioContext | null = null;
    try {
      ctx = getLabAudioContext();
    } catch {
      ctx = null;
    }
    const onState = () => {
      if (ctx?.state === 'running') revive();
    };
    ctx?.addEventListener('statechange', onState);
    const tick = window.setInterval(() => {
      if (beatOnRef.current && !isLabBeatOn()) revive();
    }, 12000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('focus', revive);
      ctx?.removeEventListener('statechange', onState);
      window.clearInterval(tick);
    };
  }, [labMode]);

  const applyMusicPreset = useCallback(
    (preset: LabPreset) => {
      if (preset.voice) {
        const v = cloneLabVoiceParams(preset.voice);
        setVoice(v);
        voiceRef.current = v;
      }
      if (preset.beat) {
        const b = cloneLabBeatParams(preset.beat);
        setBeatParams(b);
        beatParamsRef.current = b;
      }
      if (preset.pad) {
        const padNorm = cloneLabMusicPad(preset.pad);
        setMusicPad(padNorm);
        musicPadRef.current = padNorm;
      }
      if (preset.layers) {
        const stamped = ensureMelodyLayerVoices(
          cloneLabMelodyLayers(preset.layers),
          voiceRef.current,
        );
        setMelodyLayers(stamped.layers);
        melodyLayersRef.current = stamped.layers;
      }
      if (preset.musicSlot) setMusicSlot(preset.musicSlot);
      setLabMode('music');
      setStaffLayerId(preset.session?.staffLayerId ?? preset.layers?.[0]?.id ?? null);
      if (preset.session?.keyboardOpen != null) setKeyboardOpen(preset.session.keyboardOpen);
      if (preset.session?.keyboardFloat != null) setKeyboardFloat(preset.session.keyboardFloat);
      if (preset.session?.focusArrange != null) setFocusArrange(preset.session.focusArrange);
      setActivePresetId(preset.id);
      setPresetKindTab('music');
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
    const suggested = `${slotLabel} · ${stamp}`;
    const typed =
      typeof window !== 'undefined'
        ? window.prompt('Имя пресета / трека', suggested)?.trim()
        : suggested;
    if (typed === null) {
      setStatus('Сохранение пресета отменено (WAV уже скачан/записан)');
      return;
    }
    const presetName = typed && typed.length > 0 ? typed : suggested;
    const saved = upsertLabPreset({
      name: presetName,
      kind: 'music',
      voice: cloneLabVoiceParams(v),
      phrase: [],
      musicSlot,
      beat: cloneLabBeatParams(beatParamsRef.current),
      pad: cloneLabMusicPad(musicPadRef.current),
      layers: cloneLabMelodyLayers(melodyLayersRef.current),
      session: {
        staffLayerId,
        labMode: 'music',
        beatOn: beatOnRef.current,
        bakeBeat: bakeBeatInFile,
        focusArrange,
        keyboardOpen,
        keyboardFloat,
      },
    });
    setActivePresetId(saved.id);
    setPresetKindTab('music');
    setPresetsTick((x) => x + 1);
    if (user?.id) void pushLabPresetToCloud(user.id, saved);
    setStatus(
      wrote
        ? `Сохранено ${musicSlot}.wav + пресет «${saved.name}»${user?.id ? ' · облако' : ''}`
        : `Скачано ${musicSlot}.wav + пресет «${saved.name}»${user?.id ? ' · облако' : ''} (на диск — перезапусти npm run dev)`,
    );
  };

  const onFloatKbPointerDown = (
    mode: 'move' | 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw',
    e: ReactPointerEvent,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    floatDragRef.current = {
      mode,
      startX: e.clientX,
      startY: e.clientY,
      orig: { ...floatKbGeomRef.current },
    };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onFloatKbPointerMove = (e: ReactPointerEvent) => {
    const d = floatDragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    const o = d.orig;
    let left = o.left;
    let top = o.top;
    let width = o.width;
    let height = o.height;
    const minW = 360;
    const minH = 160;
    const maxW = window.innerWidth - 16;
    const maxH = window.innerHeight - 24;

    if (d.mode === 'move') {
      left = o.left + dx;
      top = o.top + dy;
    } else {
      if (d.mode.includes('e')) width = o.width + dx;
      if (d.mode.includes('s')) height = o.height + dy;
      if (d.mode.includes('w')) {
        width = o.width - dx;
        left = o.left + dx;
      }
      if (d.mode.includes('n')) {
        height = o.height - dy;
        top = o.top + dy;
      }
    }

    width = Math.min(maxW, Math.max(minW, width));
    height = Math.min(maxH, Math.max(minH, height));
    left = Math.min(window.innerWidth - width - 8, Math.max(8, left));
    top = Math.min(window.innerHeight - height - 8, Math.max(40, top));

    /* если тянули за левый/верхний край — удержать противоположную сторону */
    if (d.mode.includes('w') && width === minW) left = o.left + o.width - minW;
    if (d.mode.includes('n') && height === minH) top = o.top + o.height - minH;

    const next = { left, top, width, height };
    floatKbGeomRef.current = next;
    setFloatKbGeom(next);
  };

  const onFloatKbPointerUp = (e: ReactPointerEvent) => {
    if (!floatDragRef.current) return;
    floatDragRef.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    persistFloatKbGeom(floatKbGeomRef.current);
    patchPanelLayout({ keyboardPx: floatKbGeomRef.current.height }, true);
  };

  const renderLabKeyboardDrawer = (mode: 'dock' | 'inline' | 'float') => (
    <div
      className={
        mode === 'float'
          ? 'audio-sfx-lab__keyboard-drawer audio-sfx-lab__keyboard-drawer--float'
          : mode === 'dock'
            ? 'audio-sfx-lab__keyboard-drawer audio-sfx-lab__keyboard-drawer--dock'
            : 'audio-sfx-lab__keyboard-drawer'
      }
      style={
        mode === 'float'
          ? {
              left: floatKbGeom.left,
              top: floatKbGeom.top,
              width: floatKbGeom.width,
              height: keyboardOpen ? floatKbGeom.height : 44,
              right: 'auto',
              bottom: 'auto',
              maxHeight: 'none',
            }
          : mode === 'dock'
            ? {
                height: keyboardOpen
                  ? Math.max(clampKeyboardPx(panelLayout.keyboardPx), 220)
                  : 44,
                flex: '0 0 auto',
              }
            : undefined
      }
      onPointerMove={mode === 'float' ? onFloatKbPointerMove : undefined}
      onPointerUp={mode === 'float' ? onFloatKbPointerUp : undefined}
      onPointerCancel={mode === 'float' ? onFloatKbPointerUp : undefined}
    >
      {mode === 'float' && keyboardOpen ? (
        <>
          <div
            className="audio-sfx-lab__float-edge audio-sfx-lab__float-edge--n"
            title="Высота"
            onPointerDown={(e) => onFloatKbPointerDown('n', e)}
          />
          <div
            className="audio-sfx-lab__float-edge audio-sfx-lab__float-edge--s"
            title="Высота"
            onPointerDown={(e) => onFloatKbPointerDown('s', e)}
          />
          <div
            className="audio-sfx-lab__float-edge audio-sfx-lab__float-edge--e"
            title="Ширина"
            onPointerDown={(e) => onFloatKbPointerDown('e', e)}
          />
          <div
            className="audio-sfx-lab__float-edge audio-sfx-lab__float-edge--w"
            title="Ширина"
            onPointerDown={(e) => onFloatKbPointerDown('w', e)}
          />
          <div
            className="audio-sfx-lab__float-corner audio-sfx-lab__float-corner--nw"
            onPointerDown={(e) => onFloatKbPointerDown('nw', e)}
          />
          <div
            className="audio-sfx-lab__float-corner audio-sfx-lab__float-corner--ne"
            onPointerDown={(e) => onFloatKbPointerDown('ne', e)}
          />
          <div
            className="audio-sfx-lab__float-corner audio-sfx-lab__float-corner--sw"
            onPointerDown={(e) => onFloatKbPointerDown('sw', e)}
          />
          <div
            className="audio-sfx-lab__float-corner audio-sfx-lab__float-corner--se"
            title="Размер"
            onPointerDown={(e) => onFloatKbPointerDown('se', e)}
          />
        </>
      ) : null}
      <div
        className="audio-sfx-lab__keyboard-drawer-bar"
      >
        {mode === 'float' ? (
          <div
            className="audio-sfx-lab__keyboard-drawer-drag"
            title="Перетащить клавиатуру"
            onPointerDown={(e) => onFloatKbPointerDown('move', e)}
          >
            <span className="audio-sfx-lab__keyboard-drawer-drag-grip" aria-hidden>
              ⠿⠿
            </span>
            <span>{keyboardOpen ? 'Клавиатура' : 'Клавиатура · свёрнута'}</span>
          </div>
        ) : (
          <button
            type="button"
            className="audio-sfx-lab__keyboard-drawer-toggle"
            style={{ flex: 1, textAlign: 'left' }}
            onClick={() => {
              const next = !keyboardOpen;
              setKeyboardOpen(next);
              if (next && panelLayoutRef.current.keyboardPx < 140) {
                patchPanelLayout({ keyboardPx: Math.max(DEFAULT_LAB_PANEL_LAYOUT.keyboardPx, 200) }, true);
              }
            }}
          >
            {keyboardOpen
              ? mode === 'dock'
                ? '▾ Клавиатура · тяни границу выше'
                : '▾ Клавиатура'
              : '▸ Клавиатура (открыть)'}
          </button>
        )}
        {mode === 'float' ? (
          <button
            type="button"
            className="audio-sfx-lab__keyboard-drawer-toggle"
            title={keyboardOpen ? 'Свернуть' : 'Развернуть'}
            aria-label={keyboardOpen ? 'Свернуть клавиатуру' : 'Развернуть клавиатуру'}
            onClick={() => {
              const next = !keyboardOpen;
              setKeyboardOpen(next);
              if (next && panelLayoutRef.current.keyboardPx < 140) {
                patchPanelLayout({ keyboardPx: Math.max(DEFAULT_LAB_PANEL_LAYOUT.keyboardPx, 200) }, true);
              }
            }}
          >
            {keyboardOpen ? '▾' : '▸'}
          </button>
        ) : null}
        <button
          type="button"
          className={
            keyGate
              ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on audio-sfx-lab__keyboard-float-btn'
              : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__keyboard-float-btn'
          }
          title={
            keyGate
              ? 'Удержание вкл: долго держишь — долго звучит; отпустил — релиз'
              : 'Удержание выкл: фиксированная длительность из слайдера'
          }
          aria-pressed={keyGate}
          onClick={() => {
            setKeyGate((v) => {
              const next = !v;
              setStatus(next ? 'Удержание клавиш · вкл' : 'Удержание · выкл (фикс. длина)');
              return next;
            });
          }}
        >
          ⌨
          <span className="audio-sfx-lab__keyboard-float-btn-label">
            {keyGate ? 'Hold' : 'Fix'}
          </span>
        </button>
        {keyGate ? (
          <label
            className="audio-sfx-lab__keyboard-sens"
            title="Чувствительность лёгких нажатий: выше = короткие тапы тоже звучат и подсвечиваются"
          >
            <span className="audio-sfx-lab__keyboard-sens-label">Sens</span>
            <input
              type="range"
              min={0.25}
              max={1}
              step={0.05}
              value={keySensitivity}
              onChange={(e) => {
                const v = Number(e.target.value);
                setKeySensitivity(v);
                keySensitivityRef.current = v;
              }}
            />
          </label>
        ) : null}
        <button
          type="button"
          className={
            keyVelocityOn
              ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on audio-sfx-lab__keyboard-float-btn'
              : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__keyboard-float-btn'
          }
          title={
            keyVelocityOn
              ? 'Velocity вкл: экран — верх клавиши тихо / низ громко; touch — нажим; ПК-клава — Sens + темп игры'
              : 'Velocity выкл: все ноты одинаковой силы'
          }
          aria-pressed={keyVelocityOn}
          onClick={() => {
            setKeyVelocityOn((v) => {
              const next = !v;
              setStatus(
                next
                  ? 'Velocity · вкл — экран: верх/низ клавиши; ПК: Sens + быстрые ноты громче'
                  : 'Velocity · выкл (ровная динамика)',
              );
              return next;
            });
          }}
        >
          V
          <span className="audio-sfx-lab__keyboard-float-btn-label">Vel</span>
        </button>
        <button
          type="button"
          className={
            sustainPedal
              ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on audio-sfx-lab__keyboard-float-btn audio-sfx-lab__keyboard-pedal--on'
              : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__keyboard-float-btn'
          }
          title="Педаль сустейна: клик = вкл/выкл · Caps Lock = удерживай"
          aria-pressed={sustainPedal}
          onClick={() => {
            const next = !sustainPedalRef.current;
            if (!next) capsPedalHeldRef.current = false;
            setSustainPedalOn(next);
          }}
        >
          ⇪
          <span className="audio-sfx-lab__keyboard-float-btn-label">Pedal</span>
        </button>
        <button
          type="button"
          className={
            keyboardFloat
              ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on audio-sfx-lab__keyboard-float-btn'
              : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__keyboard-float-btn'
          }
          title={
            keyboardFloat
              ? 'Вернуть клавиатуру в панель аранжировки'
              : 'Плавающая клавиатура: перетаскивай и меняй размер'
          }
          aria-pressed={keyboardFloat}
          onClick={() => {
            setKeyboardFloat((v) => {
              const next = !v;
              if (next) {
                setKeyboardOpen(true);
                setFloatKbGeom(loadFloatKbGeom());
                setStatus('Клавиатура поверх · тяни за ⠿ шапку · края = размер');
              } else {
                setStatus('Клавиатура снова в панели');
              }
              return next;
            });
          }}
        >
          {keyboardFloat ? '📌' : '📌'}
          <span className="audio-sfx-lab__keyboard-float-btn-label">
            {keyboardFloat ? 'В панель' : 'Поверх'}
          </span>
        </button>
      </div>
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
                : keyGate
                  ? keyVelocityOn
                    ? 'Hold + Vel: низ клавиши/нажим = громче · Pedal/Caps = сустейн'
                    : 'Держи = длина · Sens · Pedal = клик вкл/выкл · Caps = держи'
                  : 'ПК: Z…/ · Q…= · хвост \' \\ ` 1 8 A F K + N. · Pedal/Caps · Hold'}
            </span>
          </div>

          <div className="audio-sfx-lab__chord-bar">
            <button
              type="button"
              className={
                beatOn
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--loop-on audio-sfx-lab__btn--beat-on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__btn--loop'
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
                  ? 'audio-sfx-lab__btn audio-sfx-lab__btn--chord-mode audio-sfx-lab__btn--chord-on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__btn--chord-mode'
              }
              onClick={() => setChordMode((on) => !on)}
            >
              {chordMode ? '● Аккорд вкл' : 'Аккорд'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__btn--play-chord"
              disabled={chordMidis.length < 2}
              onClick={() => void playCurrentChord(chordMidis, true)}
            >
              ▶ Сыграть аккорд ({chordMidis.length}/{LAB_CHORD_MAX})
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__btn--clear-chord"
              disabled={chordMidis.length === 0}
              onClick={() => {
                chordMidisRef.current = [];
                setChordMidis([]);
                setStatus('Аккорд очищен');
              }}
            >
              Сбросить аккорд
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__btn--save-chord"
              disabled={chordMidis.length < 2}
              title="Сохранить в библиотеку аккордов"
              onClick={() => void saveCurrentChordToLibrary()}
            >
              💾 Аккорд
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
              className="audio-sfx-lab__btn audio-sfx-lab__btn--preview-mel"
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

  const renderChordLibraryPanel = () => (
    <details
      className="audio-sfx-lab__chord-lib audio-sfx-lab__chord-lib--inspector"
      open={chordLibOpen}
      onToggle={(e) => setChordLibOpen((e.target as HTMLDetailsElement).open)}
    >
      <summary className="audio-sfx-lab__chord-lib-summary">
        <span className="audio-sfx-lab__chord-lib-title">Аккорды</span>
        <span className="audio-sfx-lab__chord-lib-meta">
          {chordLibrary.length ? `${chordLibrary.length} шт.` : 'пусто'}
          {user?.id ? ' · облако' : authConfigured ? ' · локально' : ''}
        </span>
      </summary>
      <div className="audio-sfx-lab__chord-lib-body">
        <p className="audio-sfx-lab__beat-hint" style={{ margin: '0 0 8px' }}>
          Режим «Аккорд» на клавиатуре → 2–8 нот → «💾 Аккорд». Вставка в трек — по playhead.
          Синк облака — в меню аккаунта (☁).
        </p>
        {chordLibrary.length === 0 ? null : (
          <ul className="audio-sfx-lab__chord-lib-list">
            {chordLibrary.map((c) => (
              <li key={c.id} className="audio-sfx-lab__chord-lib-item">
                <button
                  type="button"
                  className="audio-sfx-lab__chord-lib-name"
                  title={c.midis.map(midiLabel).join(' + ')}
                  onClick={() => loadChordFromLibrary(c)}
                >
                  {c.name}
                </button>
                <span className="audio-sfx-lab__chord-lib-notes">
                  {c.midis.map(midiLabel).join(' ')}
                </span>
                <button
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__glyph"
                  title="Сыграть"
                  onClick={() => void playCurrentChord(c.midis, false)}
                >
                  ▶
                </button>
                <button
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__glyph"
                  title={
                    labMode === 'music' ? 'Вставить в слой на playhead' : 'Только в режиме Музыка'
                  }
                  disabled={labMode !== 'music'}
                  onClick={() => insertChordIntoTrack(c)}
                >
                  ＋
                </button>
                <button
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--rec"
                  title="Удалить"
                  onClick={() => void deleteChordFromLibrary(c.id)}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );

  const renderStitchFlowPanel = (opts?: {
    panelRef?: RefObject<HTMLDivElement | null>;
    inInspector?: boolean;
  }) => {
    if (stitchPickIds == null || !stitchTargetBars) return null;
    const cur = loopBarsNow;
    return (
      <div
        className={
          opts?.inInspector
            ? 'audio-sfx-lab__stitch audio-sfx-lab__stitch--inspector'
            : 'audio-sfx-lab__stitch'
        }
        ref={opts?.panelRef}
      >
        <p className="audio-sfx-lab__stitch-title">
          Пришить +{stitchAddDelta} такт ({cur}→{stitchTargetBars}): отметь дорожки для копии в новый
          хвост, затем подтверди «Склеить».
        </p>
        <ul className="audio-sfx-lab__stitch-list">
          {melodyLayers.map((l) => (
            <li key={l.id}>
              <label>
                <input
                  type="checkbox"
                  checked={stitchPickIds.includes(l.id)}
                  onChange={(e) => {
                    setStitchPickIds((prev) => {
                      const pick = prev ?? [];
                      return e.target.checked
                        ? [...pick, l.id]
                        : pick.filter((id) => id !== l.id);
                    });
                  }}
                />
                <span>{l.name || 'Слой'}</span>
                <em>{l.notes.length} нот</em>
              </label>
            </li>
          ))}
        </ul>
        {melodyLayers.length === 0 ? (
          <p className="audio-sfx-lab__beat-hint" style={{ margin: '0 0 8px' }}>
            Нет мелодий — «Склеить» просто удлинит петлю и бит пустыми тактами.
          </p>
        ) : null}
        <div className="audio-sfx-lab__stitch-actions">
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--primary"
            onClick={() => confirmStitchBars()}
          >
            ✓ Склеить {cur}→{stitchTargetBars}
          </button>
          <button type="button" className="audio-sfx-lab__btn audio-sfx-lab__btn--cancel-loud" onClick={() => cancelStitchBars()}>
            Отмена
          </button>
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
            onClick={() => setStitchPickIds(melodyLayersRef.current.map((l) => l.id))}
          >
            Все
          </button>
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
            onClick={() => setStitchPickIds([])}
          >
            Ничего
          </button>
        </div>
      </div>
    );
  };

  const renderSwapChunksPanel = () => {
    const totalBars = loopBarsNow;
    const chunk = 4;
    const parts = Math.floor(totalBars / chunk);
    if (parts < 2) return null;
    const labelOf = (i: number) => `${i * chunk + 1}–${(i + 1) * chunk}`;
    const doSwap = (a: number, b: number) => {
      if (a === b || a < 0 || b < 0 || a >= parts || b >= parts) return;
      if (melodyLayersRef.current.length === 0) {
        setStatus('Нет слоёв мелодии для обмена');
        return;
      }
      pushArrangeUndo();
      const next = swapMelodyLayerSections(
        melodyLayersRef.current,
        beatParamsRef.current.bpm,
        chunk,
        a,
        b,
      );
      melodyLayersRef.current = next;
      setMelodyLayers(next);
      restartMusicLoop(next, musicPadRef.current, { immediate: true });
      setStatus(`Куски ${labelOf(a)} ↔ ${labelOf(b)}`);
    };
    return (
      <div className="audio-sfx-lab__stitch audio-sfx-lab__stitch--swap">
        <p className="audio-sfx-lab__stitch-title">
          Поменять куски по {chunk} такта (мелодии). Для {totalBars} тактов — {parts} кусков:
        </p>
        <div className="audio-sfx-lab__stitch-swap-pick">
          <label>
            A
            <select
              value={Math.min(swapChunkA, parts - 1)}
              onChange={(e) => setSwapChunkA(Number(e.target.value))}
            >
              {Array.from({ length: parts }, (_, i) => (
                <option key={`sa-${i}`} value={i}>
                  {labelOf(i)}
                </option>
              ))}
            </select>
          </label>
          <span>↔</span>
          <label>
            B
            <select
              value={Math.min(swapChunkB, parts - 1)}
              onChange={(e) => setSwapChunkB(Number(e.target.value))}
            >
              {Array.from({ length: parts }, (_, i) => (
                <option key={`sb-${i}`} value={i}>
                  {labelOf(i)}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="audio-sfx-lab__btn audio-sfx-lab__btn--primary"
            disabled={melodyLayers.length === 0}
            onClick={() =>
              doSwap(Math.min(swapChunkA, parts - 1), Math.min(swapChunkB, parts - 1))
            }
          >
            Обменять
          </button>
        </div>
        <div className="audio-sfx-lab__stitch-actions">
          {Array.from({ length: parts - 1 }, (_, i) => (
            <button
              key={`swap-adj-${i}`}
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
              disabled={melodyLayers.length === 0}
              title={`Соседние: ${labelOf(i)} ↔ ${labelOf(i + 1)}`}
              onClick={() => doSwap(i, i + 1)}
            >
              {labelOf(i)} ↔ {labelOf(i + 1)}
            </button>
          ))}
        </div>
      </div>
    );
  };

  const renderLoopToolbar = () => {
    const totalBars = loopBarsNow;
    const chunk = 4;
    const parts = Math.floor(totalBars / chunk);
    const labelOf = (i: number) => `${i * chunk + 1}–${(i + 1) * chunk}`;
    const doSwap = (a: number, b: number) => {
      if (a === b || a < 0 || b < 0 || a >= parts || b >= parts) return;
      if (melodyLayersRef.current.length === 0) {
        setStatus('Нет слоёв мелодии для обмена');
        return;
      }
      pushArrangeUndo();
      const next = swapMelodyLayerSections(
        melodyLayersRef.current,
        beatParamsRef.current.bpm,
        chunk,
        a,
        b,
      );
      melodyLayersRef.current = next;
      setMelodyLayers(next);
      restartMusicLoop(next, musicPadRef.current, { immediate: true });
      setStatus(`Куски ${labelOf(a)} ↔ ${labelOf(b)}`);
    };

    const toolsBody = (
      <>
        <div className="audio-sfx-lab__loop-toolbar-row">
          <span className="audio-sfx-lab__bars-add-label">Пришить</span>
          {LAB_BARS_ADD_DELTAS.map((d) => {
            const disabled = addLabBars(totalBars, d) == null;
            return (
              <button
                key={`loop-add-${d}`}
                type="button"
                className={
                  stitchPickIds != null && stitchAddDelta === d
                    ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on audio-sfx-lab__btn--bars-add'
                    : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--bars-add'
                }
                disabled={disabled}
                title={
                  disabled
                    ? `Максимум ${LAB_BARS_MAX} тактов`
                    : `Пришить +${d} (${totalBars}→${totalBars + d})`
                }
                onClick={() => requestAddLoopBars(d)}
              >
                +{d}
              </button>
            );
          })}
        </div>
        {stitchPickIds != null && stitchTargetBars ? (
          <div className="audio-sfx-lab__stitch audio-sfx-lab__stitch--inline" ref={stitchPanelRef}>
            <p className="audio-sfx-lab__stitch-title">
              Слои для {totalBars}→{stitchTargetBars} (+{stitchAddDelta}):
            </p>
            <ul className="audio-sfx-lab__stitch-list audio-sfx-lab__stitch-list--inline">
              {melodyLayers.map((l) => (
                <li key={l.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={stitchPickIds.includes(l.id)}
                      onChange={(e) => {
                        setStitchPickIds((prev) => {
                          const pick = prev ?? [];
                          return e.target.checked
                            ? [...pick, l.id]
                            : pick.filter((id) => id !== l.id);
                        });
                      }}
                    />
                    <span>{l.name || 'Слой'}</span>
                  </label>
                </li>
              ))}
            </ul>
            <div className="audio-sfx-lab__stitch-actions">
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--primary"
                onClick={() => {
                  confirmStitchBars();
                  setLoopToolsOpen(false);
                }}
              >
                ✓ Склеить {totalBars}→{stitchTargetBars}
              </button>
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--cancel-loud"
                onClick={() => {
                  cancelStitchBars();
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                onClick={() => setStitchPickIds(melodyLayersRef.current.map((l) => l.id))}
              >
                Все
              </button>
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                onClick={() => setStitchPickIds([])}
              >
                Ничего
              </button>
            </div>
          </div>
        ) : (
          <p className="audio-sfx-lab__loop-toolbar-idle">+N → выбор слоёв → Склеить / Отмена</p>
        )}
        <div className="audio-sfx-lab__loop-toolbar-row audio-sfx-lab__loop-toolbar-row--swap">
          <span className="audio-sfx-lab__bars-add-label">Обмен</span>
          {parts >= 2 ? (
            <>
              <label className="audio-sfx-lab__swap-mini">
                A
                <select
                  value={Math.min(swapChunkA, parts - 1)}
                  onChange={(e) => setSwapChunkA(Number(e.target.value))}
                >
                  {Array.from({ length: parts }, (_, i) => (
                    <option key={`lsa-${i}`} value={i}>
                      {labelOf(i)}
                    </option>
                  ))}
                </select>
              </label>
              <span className="audio-sfx-lab__swap-arrow">↔</span>
              <label className="audio-sfx-lab__swap-mini">
                B
                <select
                  value={Math.min(swapChunkB, parts - 1)}
                  onChange={(e) => setSwapChunkB(Number(e.target.value))}
                >
                  {Array.from({ length: parts }, (_, i) => (
                    <option key={`lsb-${i}`} value={i}>
                      {labelOf(i)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--primary audio-sfx-lab__btn--bars-add"
                disabled={melodyLayers.length === 0}
                onClick={() =>
                  doSwap(Math.min(swapChunkA, parts - 1), Math.min(swapChunkB, parts - 1))
                }
              >
                Обменять
              </button>
              {Array.from({ length: Math.min(parts - 1, 4) }, (_, i) => (
                <button
                  key={`loop-swap-${i}`}
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--bars-add"
                  disabled={melodyLayers.length === 0}
                  title={`${labelOf(i)} ↔ ${labelOf(i + 1)}`}
                  onClick={() => doSwap(i, i + 1)}
                >
                  {labelOf(i)}↔{labelOf(i + 1)}
                </button>
              ))}
            </>
          ) : (
            <span className="audio-sfx-lab__loop-toolbar-idle">нужно ≥8 тактов</span>
          )}
        </div>
        <div className="audio-sfx-lab__loop-toolbar-row audio-sfx-lab__loop-toolbar-row--clip">
          <span className="audio-sfx-lab__bars-add-label" title="Выделение тактов">
            ▤
          </span>
          <label className="audio-sfx-lab__swap-mini" title="С такта">
            <select
              value={Math.min(clipFromBar, totalBars)}
              onChange={(e) => {
                const v = Number(e.target.value);
                setClipFromBar(v);
                if (clipToBar < v) setClipToBar(v);
                /* paste-at не трогаем — только выделение; paste задаётся «→ такт» или после copy (to+1) */
                setClipSelActive(true);
              }}
            >
              {Array.from({ length: totalBars }, (_, i) => (
                <option key={`cf-${i}`} value={i + 1}>
                  {i + 1}
                </option>
              ))}
            </select>
          </label>
          <span className="audio-sfx-lab__swap-arrow">–</span>
          <label className="audio-sfx-lab__swap-mini" title="По такт">
            <select
              value={Math.min(Math.max(clipToBar, clipFromBar), totalBars)}
              onChange={(e) => {
                setClipToBar(Number(e.target.value));
                setClipSelActive(true);
              }}
            >
              {Array.from({ length: totalBars }, (_, i) =>
                i + 1 >= clipFromBar ? (
                  <option key={`ct-${i}`} value={i + 1}>
                    {i + 1}
                  </option>
                ) : null,
              )}
            </select>
          </label>
          <button
            type="button"
            className={[
              'audio-sfx-lab__clip-glyph',
              clipKick ? 'audio-sfx-lab__clip-glyph--on' : '',
              bufferDrums.kick ? 'audio-sfx-lab__clip-glyph--buf' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={bufferDrums.kick ? 'Бочка в ▣ · в буфере' : 'Бочка в выделении'}
            aria-pressed={clipKick}
            onClick={() => setClipKick((v) => !v)}
          >
            K
          </button>
          <button
            type="button"
            className={[
              'audio-sfx-lab__clip-glyph',
              clipSnare ? 'audio-sfx-lab__clip-glyph--on' : '',
              bufferDrums.snare ? 'audio-sfx-lab__clip-glyph--buf' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={bufferDrums.snare ? 'Снейр в ▣ · в буфере' : 'Снейр в выделении'}
            aria-pressed={clipSnare}
            onClick={() => setClipSnare((v) => !v)}
          >
            S
          </button>
          <button
            type="button"
            className={[
              'audio-sfx-lab__clip-glyph',
              clipHats ? 'audio-sfx-lab__clip-glyph--on' : '',
              bufferDrums.hats ? 'audio-sfx-lab__clip-glyph--buf' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            title={bufferDrums.hats ? 'Хеты в ▣ · в буфере' : 'Хеты в выделении'}
            aria-pressed={clipHats}
            onClick={() => setClipHats((v) => !v)}
          >
            H
          </button>
          {melodyLayers.map((l) => {
            const picked = clipLayerIds.includes(l.id);
            const inBuf = bufferLayerIds.includes(l.id);
            return (
              <button
                key={`clip-g-${l.id}`}
                type="button"
                className={[
                  'audio-sfx-lab__clip-glyph',
                  'audio-sfx-lab__clip-glyph--mel',
                  picked ? 'audio-sfx-lab__clip-glyph--on' : '',
                  inBuf ? 'audio-sfx-lab__clip-glyph--buf' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                title={`${picked ? 'В ▣' : 'Вне ▣'}${inBuf ? ' · в буфере' : ''}: ${l.name || 'слой'}`}
                aria-pressed={picked}
                onClick={() => {
                  setClipLayerIds((prev) =>
                    picked ? prev.filter((id) => id !== l.id) : [...prev, l.id],
                  );
                }}
              >
                ♪
              </button>
            );
          })}
        </div>
        <div className="audio-sfx-lab__loop-toolbar-row">
          <span className="audio-sfx-lab__clip-actions" role="group" aria-label="Действия с выделением">
            <button
              type="button"
              className="audio-sfx-lab__clip-icon"
              title="Копировать выделение (Ctrl+C)"
              onClick={() => runClipCopy()}
            >
              📋
            </button>
            <button
              type="button"
              className="audio-sfx-lab__clip-icon"
              title="Вырезать выделение (Ctrl+X)"
              onClick={() => runClipCut()}
            >
              ✂
            </button>
            <label
              className="audio-sfx-lab__swap-mini"
              title="Вставить с такта (синхронизируется с выделением на сетке)"
            >
              →
              <select
                value={Math.min(clipPasteAt, LAB_BARS_MAX)}
                onChange={(e) => setClipPasteAt(Number(e.target.value))}
              >
                {Array.from(
                  {
                    length: Math.min(
                      LAB_BARS_MAX,
                      Math.max(
                        totalBars,
                        clipPasteAt,
                        loopClipRef.current
                          ? barsNeededForPaste(clipPasteAt, loopClipRef.current.barsCount)
                          : totalBars,
                      ),
                    ),
                  },
                  (_, i) => (
                    <option key={`cp-${i}`} value={i + 1}>
                      {i + 1}
                      {i + 1 > totalBars ? '+' : ''}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button
              type="button"
              className="audio-sfx-lab__clip-icon audio-sfx-lab__clip-icon--accent"
              title={`Вставить с такта ${clipPasteAt} (Ctrl+V)`}
              disabled={!loopClipInfo}
              onClick={() => runClipPaste()}
            >
              📥
            </button>
            <button
              type="button"
              className="audio-sfx-lab__clip-icon audio-sfx-lab__clip-icon--danger"
              title={`Удалить содержимое тактов ${Math.min(clipFromBar, clipToBar)}–${Math.max(clipFromBar, clipToBar)} у отмеченных ▣ (Delete)`}
              onClick={() => runClipClear()}
            >
              🗑
            </button>
            <button
              type="button"
              className="audio-sfx-lab__clip-icon audio-sfx-lab__clip-icon--undo"
              title="Отменить (Ctrl+Z)"
              disabled={arrangeUndoCount < 1}
              onClick={() => undoArrangeEdit()}
            >
              ↶ Отмена
            </button>
            <button
              type="button"
              className="audio-sfx-lab__clip-icon"
              title="Снять подсветку (Esc)"
              disabled={!clipSelActive}
              onClick={() => {
                setClipSelActive(false);
                setStatus('Выделение снято');
              }}
            >
              Снять
            </button>
          </span>
          {loopClipInfo ? (
            <span className="audio-sfx-lab__pane-hint" title="Буфер">
              {loopClipInfo}
            </span>
          ) : (
            <span className="audio-sfx-lab__loop-toolbar-idle">ПКМ на сетке · ▣ строки</span>
          )}
        </div>
      </>
    );

    return (
      <>
        <div className="audio-sfx-lab__tracks-rail" ref={loopToolbarRef}>
          <button
            type="button"
            className={
              loopToolsOpen || stitchPickIds != null
                ? 'audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--takty audio-sfx-lab__tracks-rail-btn--on'
                : 'audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--takty'
            }
            title="Такты: пришить, обмен, копия (плавающее окно)"
            onClick={() => {
              setLoopFloatGeom(loadLoopFloatGeom());
              setLoopToolsOpen(true);
            }}
          >
            <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
              ▤
            </span>
            Такты
          </button>
          {LAB_BARS_ADD_DELTAS.slice(0, 3).map((d) => (
            <button
              key={`rail-add-${d}`}
              type="button"
              className={`audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--add${d}`}
              title={`Пришить +${d}`}
              disabled={addLabBars(totalBars, d) == null}
              onClick={() => requestAddLoopBars(d)}
            >
              <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
                ＋
              </span>
              {d}
            </button>
          ))}
          <button
            type="button"
            className="audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--copy"
            title="Копировать выделение (Ctrl+C)"
            onClick={() => runClipCopy()}
          >
            <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
              ⧉
            </span>
          </button>
          <button
            type="button"
            className="audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--paste"
            title={`Вставить с такта ${clipPasteAt} (Ctrl+V)`}
            disabled={!loopClipInfo}
            onClick={() => runClipPaste()}
          >
            <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
              ⇩
            </span>
          </button>
          <button
            type="button"
            className="audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--clear"
            title={`Удалить содержимое ${Math.min(clipFromBar, clipToBar)}–${Math.max(clipFromBar, clipToBar)} у ▣ (Delete)`}
            onClick={() => runClipClear()}
          >
            <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
              🗑
            </span>
          </button>
          <button
            type="button"
            className="audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--undo"
            title="Отменить (Ctrl+Z)"
            disabled={arrangeUndoCount < 1}
            onClick={() => undoArrangeEdit()}
          >
            <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
              ↶
            </span>
            Отмена
          </button>
          <button
            type="button"
            className={
              keyboardFloat
                ? 'audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--keys audio-sfx-lab__tracks-rail-btn--on'
                : 'audio-sfx-lab__tracks-rail-btn audio-sfx-lab__tracks-rail-btn--keys'
            }
            title={
              keyboardFloat
                ? 'Скрыть плавающую клавиатуру'
                : 'Клавиатура с клавишами поверх — не скроллить вниз'
            }
            aria-pressed={keyboardFloat}
            onClick={() => {
              setKeyboardFloat((v) => {
                const next = !v;
                if (next) {
                  setKeyboardOpen(true);
                  setFloatKbGeom(loadFloatKbGeom());
                  setStatus('Клавиатура поверх · тяни за ⠿ · края = размер');
                } else {
                  setStatus('Клавиатура скрыта с «поверх»');
                }
                return next;
              });
            }}
          >
            <span className="audio-sfx-lab__tracks-rail-glyph" aria-hidden>
              ♯
            </span>
            Клавиши
          </button>
          <span className="audio-sfx-lab__tracks-rail-meta">
            {totalBars}т
            {loopClipInfo ? ` · буф. ${loopClipInfo}` : ''}
          </span>
        </div>
        {pasteConflict ? (
          <div
            className="audio-sfx-lab__paste-pop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-paste-conflict-title"
          >
            <div className="audio-sfx-lab__paste-pop-aura" aria-hidden />
            <div className="audio-sfx-lab__paste-pop-card">
              <p className="audio-sfx-lab__paste-pop-eyebrow">вставка в занятое</p>
              <h3 id="lab-paste-conflict-title" className="audio-sfx-lab__paste-pop-title">
                Такты {pasteConflict.pasteAt}–{pasteConflict.endBar}
              </h3>
              <p className="audio-sfx-lab__paste-pop-text">
                Здесь уже есть звук. Заменить поверх, смешать с текущим или отменить?
              </p>
              <div className="audio-sfx-lab__paste-pop-actions">
                <button
                  type="button"
                  className="audio-sfx-lab__paste-pop-btn audio-sfx-lab__paste-pop-btn--replace"
                  onClick={() => applyClipPaste('replace', pasteConflict.pasteAt)}
                >
                  <span className="audio-sfx-lab__paste-pop-btn-glyph" aria-hidden>
                    ⧉
                  </span>
                  Заменить
                </button>
                <button
                  type="button"
                  className="audio-sfx-lab__paste-pop-btn audio-sfx-lab__paste-pop-btn--mix"
                  onClick={() => applyClipPaste('mix', pasteConflict.pasteAt)}
                >
                  <span className="audio-sfx-lab__paste-pop-btn-glyph" aria-hidden>
                    ✦
                  </span>
                  Смешать
                </button>
                <button
                  type="button"
                  className="audio-sfx-lab__paste-pop-btn audio-sfx-lab__paste-pop-btn--cancel"
                  onClick={() => {
                    setPasteConflict(null);
                    setStatus('Вставка отменена');
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {pendingLayerSave ? (
          <div
            className="audio-sfx-lab__paste-pop"
            role="dialog"
            aria-modal="true"
            aria-labelledby="lab-layer-save-title"
          >
            <div className="audio-sfx-lab__paste-pop-aura" aria-hidden />
            <div className="audio-sfx-lab__paste-pop-card">
              <p className="audio-sfx-lab__paste-pop-eyebrow">новая запись</p>
              <h3 id="lab-layer-save-title" className="audio-sfx-lab__paste-pop-title">
                Сохранить слой?
              </h3>
              <p className="audio-sfx-lab__paste-pop-text">
                {pendingLayerSave.notes.length} нот
                {pendingLayerSave.laps > 1 ? ` · ${pendingLayerSave.laps} круг(а) петли` : ''}
              </p>
              <label className="audio-sfx-lab__layer-save-name">
                <span>Имя</span>
                <input
                  type="text"
                  value={pendingLayerSave.name}
                  autoFocus
                  onChange={(e) =>
                    setPendingLayerSave((p) => (p ? { ...p, name: e.target.value } : p))
                  }
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      commitPendingLayerSave();
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      discardPendingLayerSave();
                    }
                  }}
                />
              </label>
              <div className="audio-sfx-lab__paste-pop-actions">
                <button
                  type="button"
                  className="audio-sfx-lab__paste-pop-btn audio-sfx-lab__paste-pop-btn--replace"
                  onClick={commitPendingLayerSave}
                >
                  <span className="audio-sfx-lab__paste-pop-btn-glyph" aria-hidden>
                    ✓
                  </span>
                  Сохранить
                </button>
                <button
                  type="button"
                  className="audio-sfx-lab__paste-pop-btn audio-sfx-lab__paste-pop-btn--cancel"
                  onClick={discardPendingLayerSave}
                >
                  Отмена
                </button>
              </div>
            </div>
          </div>
        ) : null}
        {loopToolsOpen ? (
          <div
            className="audio-sfx-lab__loop-float"
            role="dialog"
            aria-modal="false"
            aria-labelledby="lab-loop-modal-title"
            style={{ left: loopFloatGeom.left, top: loopFloatGeom.top }}
            onPointerMove={(e) => {
              const d = loopFloatDragRef.current;
              if (!d) return;
              const next = {
                left: Math.max(8, Math.min(window.innerWidth - 120, d.orig.left + (e.clientX - d.startX))),
                top: Math.max(8, Math.min(window.innerHeight - 48, d.orig.top + (e.clientY - d.startY))),
              };
              loopFloatGeomRef.current = next;
              setLoopFloatGeom(next);
            }}
            onPointerUp={(e) => {
              if (!loopFloatDragRef.current) return;
              loopFloatDragRef.current = null;
              try {
                (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
              } catch {
                /* ignore */
              }
              try {
                localStorage.setItem(
                  'updown_lab_loop_float_geom_v1',
                  JSON.stringify(loopFloatGeomRef.current),
                );
              } catch {
                /* ignore */
              }
            }}
            onPointerCancel={(e) => {
              loopFloatDragRef.current = null;
              try {
                (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
              } catch {
                /* ignore */
              }
            }}
          >
            <div
              className="audio-sfx-lab__loop-float-head"
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                const t = e.target as HTMLElement;
                if (t.closest('button')) return;
                e.preventDefault();
                loopFloatDragRef.current = {
                  startX: e.clientX,
                  startY: e.clientY,
                  orig: { ...loopFloatGeomRef.current },
                };
                (e.currentTarget.parentElement as HTMLElement | null)?.setPointerCapture?.(
                  e.pointerId,
                );
              }}
            >
              <div className="audio-sfx-lab__loop-float-drag">
                <span className="audio-sfx-lab__loop-float-grip" aria-hidden>
                  ⠿⠿
                </span>
                <div>
                  <p id="lab-loop-modal-title" className="audio-sfx-lab__melody-title">
                    Такты · склейка · копия
                  </p>
                  <span className="audio-sfx-lab__pane-hint">
                    {totalBars}т · тяни за шапку · Esc закрыть
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="audio-sfx-lab__loop-modal-close"
                title="Закрыть"
                onClick={() => setLoopToolsOpen(false)}
              >
                ✕
              </button>
            </div>
            <div className="audio-sfx-lab__loop-modal-body">{toolsBody}</div>
          </div>
        ) : null}
      </>
    );
  };


  return (
    <div
      className={
        keyboardFloat
          ? 'audio-sfx-lab audio-sfx-lab--studio audio-sfx-lab--keyboard-float'
          : 'audio-sfx-lab audio-sfx-lab--studio'
      }
      style={
        {
          ['--studio-rail' as string]: libraryCollapsed
            ? `${LAB_LIBRARY_RAIL_PX}px`
            : `${panelLayout.libraryPx}px`,
          ['--studio-inspect' as string]: focusArrange ? '14px' : `${panelLayout.inspectorPx}px`,
          ['--studio-float-kb-h' as string]: `${
            keyboardFloat && keyboardOpen
              ? Math.max(clampKeyboardPx(panelLayout.keyboardPx), 180)
              : 0
          }px`,
        } as CSSProperties
      }
    >
      <header className="audio-sfx-lab__top audio-sfx-lab__top--compact">
        <div className="audio-sfx-lab__auth-strip" ref={authStripRef} aria-live="polite">
          {authLoading ? (
            <span className="audio-sfx-lab__auth-loading" aria-hidden>
              …
            </span>
          ) : user?.id ? (
            <div className="audio-sfx-lab__auth-user-wrap">
              <button
                type="button"
                className={
                  authMenuOpen
                    ? 'audio-sfx-lab__auth-user audio-sfx-lab__auth-user--open'
                    : 'audio-sfx-lab__auth-user'
                }
                aria-expanded={authMenuOpen}
                aria-haspopup="menu"
                aria-label={`Аккаунт ${user.email ?? playerProfile.displayName}`}
                title="Меню аккаунта"
                onClick={() => setAuthMenuOpen((v) => !v)}
              >
                <span className="audio-sfx-lab__auth-avatar-wrap">
                  <PlayerAvatar
                    name={playerProfile.displayName || user.email || '?'}
                    avatarDataUrl={playerProfile.avatarDataUrl}
                    avatarBgColor={playerProfile.avatarBgColor}
                    sizePx={30}
                    className="audio-sfx-lab__auth-avatar"
                  />
                  <span className="audio-sfx-lab__auth-online-dot" title="Онлайн" aria-hidden />
                </span>
                <span className="audio-sfx-lab__auth-meta">
                  <span className="audio-sfx-lab__auth-online-pill">
                    <span className="audio-sfx-lab__auth-online-glow" aria-hidden />
                    <span className="audio-sfx-lab__auth-online-label">онлайн</span>
                  </span>
                  <LabShimmerEmail email={user.email ?? 'Аккаунт'} />
                </span>
              </button>
              {authMenuOpen ? (
                <div className="audio-sfx-lab__auth-menu" role="menu">
                  <p className="audio-sfx-lab__auth-menu-kicker">Аккаунт · облако лабы</p>
                  {lastLabSync ? (
                    <p className="audio-sfx-lab__auth-sync-last">
                      <span className="audio-sfx-lab__auth-sync-last-label">последний синк</span>
                      <span className="audio-sfx-lab__auth-sync-last-value">
                        {formatLabSyncWhen(lastLabSync.at)} · {lastLabSync.message}
                      </span>
                    </p>
                  ) : null}
                  <button
                    type="button"
                    role="menuitem"
                    className={
                      syncPanelOpen
                        ? 'audio-sfx-lab__auth-menu-item audio-sfx-lab__auth-menu-item--sync audio-sfx-lab__auth-menu-item--open'
                        : 'audio-sfx-lab__auth-menu-item audio-sfx-lab__auth-menu-item--sync'
                    }
                    disabled={syncInspectLoading}
                    aria-expanded={syncPanelOpen}
                    onClick={() => void handleToggleLabSync()}
                  >
                    <span className="audio-sfx-lab__auth-menu-item-glyph" aria-hidden>
                      {syncInspectLoading ? '◌' : syncPanelOpen ? '▴' : '☁'}
                    </span>
                    <span className="audio-sfx-lab__auth-menu-item-text">
                      {syncInspectLoading
                        ? 'Проверка синхронизаций…'
                        : syncPanelOpen
                          ? 'Свернуть отчёт синхронизации'
                          : 'Проверить последние синхронизации'}
                    </span>
                  </button>
                  {syncPanelOpen && syncInspect ? (
                    <div className="audio-sfx-lab__auth-sync-report" role="status">
                      {syncInspect.error ? (
                        <p className="audio-sfx-lab__auth-sync-line audio-sfx-lab__auth-sync-line--err">
                          {syncInspect.error}
                        </p>
                      ) : null}
                      <p className="audio-sfx-lab__auth-sync-line">
                        <span>локально</span>
                        <strong>
                          {syncInspect.localChords} акк. · {syncInspect.localPresets} прес.
                        </strong>
                      </p>
                      <p className="audio-sfx-lab__auth-sync-line">
                        <span>облако · аккорды</span>
                        <strong>
                          {syncInspect.cloudChords}
                          {syncInspect.cloudChordsLatestAt
                            ? ` · ${formatLabSyncWhen(syncInspect.cloudChordsLatestAt)}`
                            : ''}
                        </strong>
                      </p>
                      <p className="audio-sfx-lab__auth-sync-line">
                        <span>облако · пресеты</span>
                        <strong>
                          {syncInspect.cloudPresets}
                          {syncInspect.cloudPresetsLatestAt
                            ? ` · ${formatLabSyncWhen(syncInspect.cloudPresetsLatestAt)}`
                            : ''}
                        </strong>
                      </p>
                    </div>
                  ) : null}
                  <div className="audio-sfx-lab__auth-menu-divider" aria-hidden />
                  <button
                    type="button"
                    role="menuitem"
                    className="audio-sfx-lab__auth-menu-item"
                    onClick={() => void handleLabSwitchAccount()}
                  >
                    <span className="audio-sfx-lab__auth-menu-item-glyph" aria-hidden>
                      ⇄
                    </span>
                    <span className="audio-sfx-lab__auth-menu-item-text">Сменить · другой логин</span>
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    className="audio-sfx-lab__auth-menu-item audio-sfx-lab__auth-menu-item--danger"
                    onClick={() => void handleLabSignOut()}
                  >
                    <span className="audio-sfx-lab__auth-menu-item-glyph" aria-hidden>
                      ⏻
                    </span>
                    <span className="audio-sfx-lab__auth-menu-item-text">Выйти</span>
                  </button>
                </div>
              ) : null}
            </div>
          ) : authConfigured ? (
            <button
              type="button"
              className="audio-sfx-lab__auth-signin audio-sfx-lab__glyph"
              title="Войти для синка с облаком"
              onClick={() => {
                setAuthMode('login');
                setShowAuthModal(true);
              }}
            >
              Войти
            </button>
          ) : null}
        </div>
        <div className="audio-sfx-lab__top-row">
          <button type="button" className="audio-sfx-lab__back audio-sfx-lab__glyph audio-sfx-lab__glyph--back" title="Назад" onClick={onBack}>
            ←
          </button>
          <h1 className="audio-sfx-lab__title">Студия</h1>
          <div className="audio-sfx-lab__mode-tabs" role="group" aria-label="Режим">
            <button
              type="button"
              className={
                labMode === 'sfx'
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--mode audio-sfx-lab__glyph--mode-on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--mode'
              }
              title="SFX"
              onClick={() => {
                stopLabBeat();
                setBeatOn(false);
                setLabMode('sfx');
                setPresetKindTab('sfx');
                if (inspectorTab === 'atmosphere') setInspectorTab('voice');
                setStatus('Режим SFX');
              }}
            >
              SFX
            </button>
            <button
              type="button"
              className={
                labMode === 'music'
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--mode-music audio-sfx-lab__glyph--mode-on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--mode-music'
              }
              title="Музыка"
              onClick={() => {
                stopLabBeat();
                setBeatOn(false);
                setLabMode('music');
                setBakeBeatInFile(false);
                setPresetKindTab('music');
                setBeatParams((p) => {
                  const next = { ...p, bars: p.bars >= 8 ? normalizeLabBars(p.bars) : 8 };
                  beatParamsRef.current = next;
                  return next;
                });
                setStatus('Музыка · дорожки + стан');
              }}
            >
              ♪
            </button>
          </div>
          <div className="audio-sfx-lab__transport-row audio-sfx-lab__transport-row--compact">
            <button
              type="button"
              className={
                oneShotOn
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--play audio-sfx-lab__glyph--on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--play'
              }
              title={oneShotOn ? 'Стоп разового проигрывания' : 'Проиграть один раз (без петли)'}
              aria-label={oneShotOn ? 'Стоп' : 'Проиграть один раз'}
              onClick={playOnce}
            >
              {oneShotOn ? '■' : '▶'}
            </button>
            <button
              type="button"
              className={
                beatOn
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--loop audio-sfx-lab__glyph--on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--loop'
              }
              title={labMode === 'music' ? 'Петля вкл/выкл' : 'Бит-петля вкл/выкл'}
              aria-label={labMode === 'music' ? 'Петля' : 'Бит-петля'}
              onClick={toggleLoop}
            >
              {beatOn ? '■' : '↻'}
            </button>
            <button
              type="button"
              className={
                recording
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--rec audio-sfx-lab__glyph--on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--rec'
              }
              title={recording ? `Стоп записи (${phrase.length})` : 'Запись'}
              aria-label="Запись"
              onClick={() => (recording ? stopRecord() : startRecord())}
            >
              {recording ? '■' : '●'}
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--preview"
              title={labMode === 'music' ? 'Превью мелодий' : 'Превью фразы'}
              disabled={labMode === 'music' ? melodyLayers.every((l) => !l.enabled) : !phrase.length}
              onClick={previewMelodies}
            >
              ♫
            </button>
            {labMode === 'music' ? (
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--new"
                title="Новый трек с нуля"
                aria-label="Новый трек"
                onClick={startNewTrack}
              >
                ＋
              </button>
            ) : null}
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--save"
              title={labMode === 'music' ? 'Сохранить трек' : 'Сохранить в игру'}
              aria-label="Сохранить"
              onClick={() => void (labMode === 'music' ? saveMusicBed() : saveToGame())}
            >
              💾
            </button>
            <button
              type="button"
              className={
                focusArrange
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--focus audio-sfx-lab__glyph--on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--focus'
              }
              title="Focus — скрыть боковые панели"
              onClick={() => setFocusArrange((v) => !v)}
            >
              ⛶
            </button>
            <button
              type="button"
              className={
                keyboardFloat
                  ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--pin audio-sfx-lab__glyph--on'
                  : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--pin'
              }
              title={
                keyboardFloat
                  ? 'Вернуть клавиатуру в панель'
                  : 'Клавиатура справа внизу — не перекрывает дорожки'
              }
              onClick={() => {
                setKeyboardFloat((v) => {
                  const next = !v;
                  if (next) {
                    setKeyboardOpen(true);
                    if (panelLayoutRef.current.keyboardPx < 180) {
                      patchPanelLayout({ keyboardPx: 220 }, true);
                    }
                    setStatus('Клавиатура справа внизу');
                  } else {
                    setStatus('Клавиатура в панели');
                  }
                  return next;
                });
              }}
            >
              📌
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--reset"
              title="Сброс размеров панелей"
              onClick={() => {
                const next = { ...DEFAULT_LAB_PANEL_LAYOUT };
                setPanelLayout(next);
                panelLayoutRef.current = next;
                saveLabPanelLayout(next);
                setStatus('Панели сброшены');
              }}
            >
              ↺
            </button>
            <label className="audio-sfx-lab__bpm-inline" title="BPM">
              <span>BPM</span>
              <input
                type="number"
                min={80}
                max={190}
                value={Math.round(beatParams.bpm)}
                onChange={(e) =>
                  applyBeatParams({ ...beatParamsRef.current, bpm: Number(e.target.value) || 120 })
                }
              />
            </label>
          </div>
          <div className="audio-sfx-lab__top-meta" role="status">
            <span className="audio-sfx-lab__top-meta-context">
              <strong>{labMode === 'music' ? '♪' : 'SFX'}</strong>
              <span className="audio-sfx-lab__top-meta-sep" aria-hidden>
                ·
              </span>
              <span className="audio-sfx-lab__top-meta-slot">
                {labMode === 'music'
                  ? LAB_MUSIC_SLOTS.find((s) => s.id === musicSlot)?.label
                  : activeTask.title}
              </span>
              <span className="audio-sfx-lab__top-meta-sep" aria-hidden>
                ·
              </span>
              <span className="audio-sfx-lab__top-meta-inst">
                {LAB_INSTRUMENTS.find((i) => i.id === voice.instrument)?.label ?? voice.instrument}
              </span>
            </span>
            <span className="audio-sfx-lab__top-status">{status}</span>
            {labMode === 'music' && staffLayerId ? (
              <button
                type="button"
                className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__glyph audio-sfx-lab__top-meta-btn"
                title="Квант 1/16 активного слоя"
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
                1/16
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={
          focusArrange
            ? 'audio-sfx-lab__studio-body audio-sfx-lab__studio-body--focus'
            : 'audio-sfx-lab__studio-body'
        }
        style={
          {
            ['--studio-rail' as string]: libraryCollapsed
              ? `${LAB_LIBRARY_RAIL_PX}px`
              : `${panelLayout.libraryPx}px`,
            ['--studio-inspect' as string]: `${panelLayout.inspectorPx}px`,
            ['--studio-presets-frac' as string]: String(panelLayout.presetsFrac),
            ['--studio-tracks-h' as string]: `${panelLayout.tracksPx}px`,
            ['--studio-keyboard-h' as string]: `${
              keyboardOpen ? Math.max(panelLayout.keyboardPx, 120) : 0
            }px`,
          } as CSSProperties
        }
      >
        <aside
          className={
            libraryCollapsed
              ? 'audio-sfx-lab__studio-library audio-sfx-lab__studio-library--collapsed'
              : 'audio-sfx-lab__studio-library'
          }
        >
          {libraryCollapsed ? (
            <div className="audio-sfx-lab__lib-rail">
              <button
                type="button"
                className="audio-sfx-lab__lib-rail-btn audio-sfx-lab__lib-rail-btn--expand"
                title="Развернуть библиотеку"
                onClick={toggleLibraryCollapsed}
              >
                »
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'all'
                    ? 'audio-sfx-lab__lib-rail-btn audio-sfx-lab__lib-rail-btn--on'
                    : 'audio-sfx-lab__lib-rail-btn'
                }
                title="Все пресеты"
                onClick={() => {
                  setPresetKindTab('all');
                  toggleLibraryCollapsed();
                }}
              >
                ★
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'sfx'
                    ? 'audio-sfx-lab__lib-rail-btn audio-sfx-lab__lib-rail-btn--on'
                    : 'audio-sfx-lab__lib-rail-btn'
                }
                title="SFX пресеты"
                onClick={() => {
                  setPresetKindTab('sfx');
                  toggleLibraryCollapsed();
                }}
              >
                S
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'music'
                    ? 'audio-sfx-lab__lib-rail-btn audio-sfx-lab__lib-rail-btn--on'
                    : 'audio-sfx-lab__lib-rail-btn'
                }
                title="Music пресеты"
                onClick={() => {
                  setPresetKindTab('music');
                  toggleLibraryCollapsed();
                }}
              >
                ♪
              </button>
              <div className="audio-sfx-lab__lib-rail-presets" aria-label="Быстрые пресеты">
                {visiblePresets.slice(0, 10).map((p) => {
                  const kind = p.kind ?? 'sfx';
                  const glyph = (p.name.trim()[0] ?? '?').toUpperCase();
                  return (
                    <button
                      key={p.id}
                      type="button"
                      className={
                        activePresetId === p.id
                          ? 'audio-sfx-lab__lib-rail-preset audio-sfx-lab__lib-rail-preset--on'
                          : 'audio-sfx-lab__lib-rail-preset'
                      }
                      title={p.name}
                      onClick={() => {
                        if (kind === 'music') applyMusicPreset(p);
                        else {
                          setVoice(voiceFromSuggest(p.voice));
                          voiceRef.current = voiceFromSuggest(p.voice);
                          setPhrase(p.phrase ?? []);
                          if (p.chordMidis?.length) setChordMidis(p.chordMidis);
                          setLabMode('sfx');
                          setActivePresetId(p.id);
                          setStatus(`SFX пресет «${p.name}»`);
                        }
                      }}
                    >
                      {glyph}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                className="audio-sfx-lab__lib-rail-btn"
                title={labMode === 'music' ? 'Слоты музыки' : 'Слоты SFX'}
                onClick={() => {
                  setSlotsOpen(true);
                  toggleLibraryCollapsed();
                }}
              >
                ≡
              </button>
            </div>
          ) : (
            <>
          <div className="audio-sfx-lab__lib-section-head audio-sfx-lab__lib-section-head--top">
            <h2 className="audio-sfx-lab__lib-title">Библиотека</h2>
            <button
              type="button"
              className="audio-sfx-lab__lib-collapse-btn"
              title="Свернуть в узкий столбик"
              onClick={toggleLibraryCollapsed}
            >
              «
            </button>
          </div>
          <div
            className="audio-sfx-lab__lib-section audio-sfx-lab__lib-section--presets"
            style={{ flex: `${panelLayout.presetsFrac} 1 0` }}
          >
            <div className="audio-sfx-lab__lib-section-head">
              <h2 className="audio-sfx-lab__lib-title">Пресеты</h2>
              <span className="audio-sfx-lab__lib-count">{visiblePresets.length}</span>
            </div>
            <div className="audio-sfx-lab__lib-tabs" role="tablist" aria-label="Тип пресета">
              <button
                type="button"
                className={
                  presetKindTab === 'all'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__lib-tab audio-sfx-lab__lib-tab--all audio-sfx-lab__lib-tab--on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__lib-tab audio-sfx-lab__lib-tab--all'
                }
                onClick={() => setPresetKindTab('all')}
              >
                Все
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'sfx'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__lib-tab audio-sfx-lab__lib-tab--sfx audio-sfx-lab__lib-tab--on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__lib-tab audio-sfx-lab__lib-tab--sfx'
                }
                onClick={() => setPresetKindTab('sfx')}
              >
                SFX
              </button>
              <button
                type="button"
                className={
                  presetKindTab === 'music'
                    ? 'audio-sfx-lab__btn audio-sfx-lab__lib-tab audio-sfx-lab__lib-tab--music audio-sfx-lab__lib-tab--on'
                    : 'audio-sfx-lab__btn audio-sfx-lab__lib-tab audio-sfx-lab__lib-tab--music'
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
                            setVoice(voiceFromSuggest(p.voice));
                            voiceRef.current = voiceFromSuggest(p.voice);
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
                          ? `audio-sfx-lab__task audio-sfx-lab__task--on audio-sfx-lab__task--slot-${slot.id}`
                          : `audio-sfx-lab__task audio-sfx-lab__task--slot-${slot.id}`
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
            </>
          )}
        </aside>

        {!focusArrange && !libraryCollapsed ? (
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
                    Включи ▶ (один раз) или ↻ (петля), крути бит и атмосферу, запиши мелодию, сохрани.
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
              <div className="audio-sfx-lab__arrange-scroll">
              <div className="audio-sfx-lab__arrange-music audio-sfx-lab__arrange-music--split">
              <div className="audio-sfx-lab__arrange-pane audio-sfx-lab__arrange-pane--tracks">
                    <div className="audio-sfx-lab__pane-head">
                      <p className="audio-sfx-lab__melody-title">Дорожки</p>
                      <span className="audio-sfx-lab__pane-hint">▶ M S ♪ · ▤ Такты в окне</span>
                    </div>
                    <div
                      className="audio-sfx-lab__tracks-viewport"
                      style={{
                        height: Math.max(LAB_PANEL_LIMITS.TRACKS_MIN, panelLayout.tracksPx),
                        minHeight: LAB_PANEL_LIMITS.TRACKS_MIN,
                      }}
                    >
                    <LabTracksTimeline
                      beat={beatParams}
                      layers={melodyLayers}
                      liveNotes={recording || phrase.length > 0 ? phrase : []}
                      recording={recording}
                      activeLayerId={staffLayerId}
                      playingLayerId={playingLayerId}
                      soloLayerId={soloLayerId}
                      selectionActive={clipSelActive}
                      selectionFromBar={clipFromBar}
                      selectionToBar={clipToBar}
                      onSelectionChange={(fromBar, toBar) => {
                        setClipFromBar(fromBar);
                        setClipToBar(toBar);
                        /* Вставка — сразу ПОСЛЕ выделения (1–16 → paste с 17), не в начало */
                        setClipPasteAt(Math.min(LAB_BARS_MAX, toBar + 1));
                        setClipSelActive(true);
                        setStatus(
                          loopClipRef.current
                            ? `Выделение ${fromBar}–${toBar} · вставка → ${Math.min(LAB_BARS_MAX, toBar + 1)}`
                            : `Выделение тактов ${fromBar}–${toBar} · вставка с ${Math.min(LAB_BARS_MAX, toBar + 1)}`,
                        );
                      }}
                      onClearSelection={() => {
                        setClipSelActive(false);
                        setStatus('Выделение снято');
                      }}
                      clipKick={clipKick}
                      clipSnare={clipSnare}
                      clipHats={clipHats}
                      clipLayerIds={clipLayerIds}
                      bufferKick={bufferDrums.kick}
                      bufferSnare={bufferDrums.snare}
                      bufferHats={bufferDrums.hats}
                      bufferLayerIds={bufferLayerIds}
                      onToggleClipDrum={(lane) => {
                        if (lane === 'kick') setClipKick((v) => !v);
                        else if (lane === 'snare') setClipSnare((v) => !v);
                        else setClipHats((v) => !v);
                      }}
                      onToggleClipLayer={(id) => {
                        setClipLayerIds((prev) =>
                          prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
                        );
                      }}
                      onClipLanesAll={() => {
                        setClipKick(true);
                        setClipSnare(true);
                        setClipHats(true);
                        setClipLayerIds(melodyLayersRef.current.map((l) => l.id));
                      }}
                      onClipLanesNone={() => {
                        setClipKick(false);
                        setClipSnare(false);
                        setClipHats(false);
                        setClipLayerIds([]);
                      }}
                      onClipAction={runClipAction}
                      canPaste={Boolean(loopClipInfo)}
                      canUndo={arrangeUndoCount > 0}
                      onSeek={(sec) => {
                        /* Если петля «залипла» (UI on, audio off) — поднять и seek */
                        if (beatOnRef.current && !isLabBeatOn()) {
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
                              setStatus('Петля не поднялась');
                              return;
                            }
                            const at = seekLabBeatLoop(sec);
                            const bpm = beatParamsRef.current.bpm;
                            const beatSec = 60 / Math.min(190, Math.max(80, bpm));
                            const bar = Math.floor(at / (4 * beatSec)) + 1;
                            const beatIn = Math.floor((at % (4 * beatSec)) / beatSec) + 1;
                            setStatus(`Playhead → ${bar}.${beatIn}`);
                          });
                          return;
                        }
                        const at = seekLabBeatLoop(sec);
                        const bpm = beatParamsRef.current.bpm;
                        const beatSec = 60 / Math.min(190, Math.max(80, bpm));
                        const bar = Math.floor(at / (4 * beatSec)) + 1;
                        const beatIn = Math.floor((at % (4 * beatSec)) / beatSec) + 1;
                        setStatus(`Playhead → ${bar}.${beatIn}`);
                      }}
                      onFollowEnable={() => {
                        if (beatOnRef.current && !isLabBeatOn()) {
                          restartMusicLoop(melodyLayersRef.current, musicPadRef.current, {
                            immediate: true,
                          });
                          setStatus('Петля восстановлена · следим');
                        }
                      }}
                      onBpmChange={(bpm) => {
                        applyBeatParams({ ...beatParamsRef.current, bpm }, `${Math.round(bpm)} BPM`, null);
                      }}
                                            onSelectLayer={(id) => {
                        setStaffLayerId(id);
                        const layer = melodyLayersRef.current.find((l) => l.id === id);
                        setLayerDockName(layer?.name ?? 'Слой');
                        setStatus(`Нотный стан: «${layer?.name ?? 'слой'}»`);
                      }}
                      onPlayLayer={(id) => void playMelodyLayer(id)}
                      onToggleMute={(id) => {
                        const next = melodyLayersRef.current.map((l) =>
                          l.id === id ? { ...l, enabled: !l.enabled } : l,
                        );
                        melodyLayersRef.current = next;
                        setMelodyLayers(next);
                        if (soloLayerId === id) setSoloLayerId(null);
                        restartMusicLoop(next);
                        const layer = next.find((l) => l.id === id);
                        setStatus(layer?.enabled ? `«${layer.name}» вкл` : `слой выкл`);
                      }}
                      onSolo={(id) => {
                        const cur = soloLayerId === id ? null : id;
                        setSoloLayerId(cur);
                        const next = melodyLayersRef.current.map((l) => ({
                          ...l,
                          enabled: cur == null ? true : l.id === cur,
                        }));
                        melodyLayersRef.current = next;
                        setMelodyLayers(next);
                        restartMusicLoop(next);
                        setStatus(cur ? `Solo «${next.find((l) => l.id === cur)?.name ?? ''}»` : 'Solo снят');
                      }}
                      onDeleteLayer={(id) => {
                        const doomed = melodyLayersRef.current.find((l) => l.id === id);
                        const next = melodyLayersRef.current.filter((l) => l.id !== id);
                        melodyLayersRef.current = next;
                        setMelodyLayers(next);
                        if (staffLayerId === id) {
                          setStaffLayerId(next[0]?.id ?? null);
                          setLayerDockOpen(false);
                        }
                        if (soloLayerId === id) setSoloLayerId(null);
                        restartMusicLoop(next);
                        setStatus(doomed ? `Удалён «${doomed.name}»` : 'Слой удалён');
                      }}
                      onToggleDrumStep={(lane, globalStep) => togglePatternStep(lane, globalStep % 16, globalStep)}
                      onClearDrumBar={(lane, bar1) => {
                        const prev = beatParamsRef.current;
                        const totalBars = normalizeLabBars(prev.bars);
                        const bar = Math.max(1, Math.min(totalBars, bar1));
                        pushArrangeUndo();
                        const cleared = clearLoopRegion(prev, melodyLayersRef.current, {
                          fromBar: bar,
                          toBar: bar,
                          kick: lane === 'kick',
                          snare: lane === 'snare',
                          hats: lane === 'hats',
                          layerIds: [],
                        });
                        beatParamsRef.current = cleared.beat;
                        setBeatParams(cleared.beat);
                        const label = lane === 'kick' ? 'бочка' : lane === 'snare' ? 'снейр' : 'хеты';
                        setStatus(`Мьют такта ${bar}: ${label}`);
                      }}
                      onToggleDrumMute={(lane) => {
                        const prev = beatParamsRef.current;
                        const cur = prev[lane] ?? 0;
                        const restore = lane === 'kick' ? 0.85 : lane === 'snare' ? 0.7 : 0.55;
                        const nextLevel = cur < 0.05 ? restore : 0;
                        applyBeatParams(
                          { ...prev, [lane]: nextLevel },
                          nextLevel < 0.05
                            ? `mute ${lane === 'kick' ? 'бочки' : lane === 'snare' ? 'снейра' : 'хетов'}`
                            : `вкл ${lane === 'kick' ? 'бочку' : lane === 'snare' ? 'снейр' : 'хеты'}`,
                          null,
                        );
                      }}
                      onClearBeat={() => {
                        applyCustomPattern(
                          emptyBeatPatternForBars(normalizeLabBars(beatParamsRef.current.bars)),
                          'бит очищен',
                          false,
                        );
                        setActivePresetId(null);
                        setInspectorTab('beat');
                      }}
                    />
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
                    {renderLoopToolbar()}
                    {melodyLayers.length === 0 ? (
                      <p className="audio-sfx-lab__beat-hint" style={{ margin: 0 }}>
                        Пусто · ▶ один раз / ↻ петля → ● REC → ■ Стоп = новый слой. Или ＋ Новый трек.
                      </p>
                    ) : (
                      <ul className="audio-sfx-lab__melody-layers audio-sfx-lab__melody-layers--compact">
                        {melodyLayers.map((layer) => (
                          <li key={layer.id} className="audio-sfx-lab__melody-layer audio-sfx-lab__melody-layer--compact">
                            <input
                              className="audio-sfx-lab__melody-name"
                              type="text"
                              value={layer.name}
                              title="Имя слоя"
                              placeholder="Слой"
                              onFocus={() => setStaffLayerId(layer.id)}
                              onChange={(e) => {
                                const name = e.target.value;
                                const next = melodyLayersRef.current.map((l) =>
                                  l.id === layer.id ? { ...l, name } : l,
                                );
                                melodyLayersRef.current = next;
                                setMelodyLayers(next);
                              }}
                              onBlur={() => {
                                const cur = melodyLayersRef.current.find((l) => l.id === layer.id);
                                if (cur && !cur.name.trim()) {
                                  const next = melodyLayersRef.current.map((l) =>
                                    l.id === layer.id ? { ...l, name: 'Слой' } : l,
                                  );
                                  melodyLayersRef.current = next;
                                  setMelodyLayers(next);
                                }
                              }}
                            />
                            <span className="audio-sfx-lab__melody-meta">{layer.notes.length}</span>
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
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--rec audio-sfx-lab__glyph"
                            title="Наиграть поверх (новый слой)"
                            disabled={recording}
                            onClick={() => startRecord()}
                          >
                            ●+
                          </button>
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__glyph"
                            title="Все слои вкл"
                            onClick={() => {
                              setSoloLayerId(null);
                              const next = melodyLayersRef.current.map((l) => ({ ...l, enabled: true }));
                              melodyLayersRef.current = next;
                              setMelodyLayers(next);
                              restartMusicLoop(next);
                              setStatus('Все вкл');
                            }}
                          >
                            ●●
                          </button>
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__glyph"
                            title="Все слои выкл"
                            onClick={() => {
                              setSoloLayerId(null);
                              const next = melodyLayersRef.current.map((l) => ({ ...l, enabled: false }));
                              melodyLayersRef.current = next;
                              setMelodyLayers(next);
                              restartMusicLoop(next);
                              setStatus('Все выкл');
                            }}
                          >
                            ○○
                          </button>
                        </div>
                      </>
                    ) : null}
              </div>

              <div className="audio-sfx-lab__arrange-pane audio-sfx-lab__arrange-pane--staff">
                <div className="audio-sfx-lab__pane-head audio-sfx-lab__pane-head--staff">
                  <p className="audio-sfx-lab__melody-title">Нотный стан</p>
                  {staffLayerId ? (
                    <button
                      type="button"
                      className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on"
                      title="Открыть слой в отдельном окне со Play"
                      onClick={() => {
                        const layer = melodyLayersRef.current.find((l) => l.id === staffLayerId);
                        setLayerDockName(layer?.name ?? 'Слой');
                        setLayerDockOpen(true);
                      }}
                    >
                      ◈ Окно слоя
                    </button>
                  ) : null}
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
                      voice={staffLayer.voice ? cloneLabVoiceParams(staffLayer.voice) : voice}
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
                        restartMusicLoop(melodyLayersRef.current, musicPadRef.current, { immediate: true });
                      }}
                    />
                  );
                })()}
              </div>
            </div>
              </div>

            <div className="audio-sfx-lab__arrange-footer">
            {!keyboardFloat ? (
              <>
                <LabResizeHandle
                  axis="y"
                  invert
                  label="Высота клавиатуры"
                  onDrag={(dy) => {
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
                {renderLabKeyboardDrawer('dock')}
              </>
            ) : (
              <div className="audio-sfx-lab__keyboard-float-stub">
                <button
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on"
                  onClick={() => setKeyboardFloat(false)}
                >
                  📌 Клавиатура поверх · вернуть в панель
                </button>
              </div>
            )}
            </div>
            </div>
          ) : keyboardFloat ? null : (
            renderLabKeyboardDrawer('inline')
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
          <div className="audio-sfx-lab__inspector-tabs" role="tablist" aria-label="Инспектор">
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'voice'}
              className={
                inspectorTab === 'voice'
                  ? 'audio-sfx-lab__inspector-tab audio-sfx-lab__inspector-tab--voice audio-sfx-lab__inspector-tab--on'
                  : 'audio-sfx-lab__inspector-tab audio-sfx-lab__inspector-tab--voice'
              }
              onClick={() => setInspectorTab('voice')}
            >
              <span className="audio-sfx-lab__tab-glyph" aria-hidden>
                🎛
              </span>
              Голос
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={inspectorTab === 'beat'}
              className={
                inspectorTab === 'beat'
                  ? 'audio-sfx-lab__inspector-tab audio-sfx-lab__inspector-tab--beat audio-sfx-lab__inspector-tab--on'
                  : 'audio-sfx-lab__inspector-tab audio-sfx-lab__inspector-tab--beat'
              }
              onClick={() => setInspectorTab('beat')}
            >
              <span className="audio-sfx-lab__tab-glyph" aria-hidden>
                🥁
              </span>
              Бит
            </button>
            {labMode === 'music' ? (
              <button
                type="button"
                role="tab"
                aria-selected={inspectorTab === 'atmosphere'}
                className={
                  inspectorTab === 'atmosphere'
                    ? 'audio-sfx-lab__inspector-tab audio-sfx-lab__inspector-tab--atmo audio-sfx-lab__inspector-tab--on'
                    : 'audio-sfx-lab__inspector-tab audio-sfx-lab__inspector-tab--atmo'
                }
                onClick={() => setInspectorTab('atmosphere')}
              >
                <span className="audio-sfx-lab__tab-glyph" aria-hidden>
                  🌫
                </span>
                Атм
              </button>
            ) : null}
          </div>
          <div className="audio-sfx-lab__inspector-panel">
          {inspectorTab === 'voice' ? (
          <div className="audio-sfx-lab__inspector-section">
          <div className="audio-sfx-lab__inst-grid audio-sfx-lab__inst-grid--row" role="listbox">
            {LAB_INSTRUMENTS.map((inst) => (
              <button
                key={inst.id}
                type="button"
                role="option"
                aria-selected={voice.instrument === inst.id}
                aria-pressed={voice.instrument === inst.id}
                title={
                  voice.instrument === inst.id
                    ? `${inst.label} · выбран`
                    : `Выбрать: ${inst.label}`
                }
                className={
                  voice.instrument === inst.id
                    ? `audio-sfx-lab__inst audio-sfx-lab__inst--on audio-sfx-lab__inst--${inst.id}`
                    : `audio-sfx-lab__inst audio-sfx-lab__inst--${inst.id}`
                }
                onClick={() => patchVoice({ instrument: inst.id })}
              >
                <strong>{inst.label}</strong>
                <span>{inst.hint}</span>
              </button>
            ))}
          </div>
          {labMode === 'music' && melodyLayers.length > 0 ? (
            <button
              type="button"
              className="audio-sfx-lab__btn"
              style={{ marginTop: 8, width: '100%' }}
              title="Как раньше: все дорожки звучат текущим инструментом и крутилками клавиатуры"
              onClick={() => {
                const next = stampVoiceOntoMelodyLayers(melodyLayersRef.current, voiceRef.current);
                melodyLayersRef.current = next;
                setMelodyLayers(next);
                if (beatOnRef.current) {
                  restartMusicLoop(next, musicPadRef.current, { immediate: true });
                }
                setStatus('Тембр клавиатуры наложен на все слои');
              }}
            >
              Тембр клавиатуры → все слои
            </button>
          ) : null}
          <div className="audio-sfx-lab__knob-block" style={{ ['--lab-knob-size' as string]: `${Math.min(panelLayout.knobsPx, Math.max(LAB_PANEL_LIMITS.KNOBS_MIN, Math.floor(panelLayout.inspectorPx * 0.34)))}px` }}>
            <div className="audio-sfx-lab__knob-row">
            <LabKnob
              label="Яркость"
              value={voice.brightness}
              onChange={(brightness) => patchVoice({ brightness })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label={
                voice.instrument === 'ebass'
                  ? 'Упругость'
                  : voice.instrument === 'piano' ||
                      voice.instrument === 'rhodes' ||
                      voice.instrument === 'wurli'
                    ? 'Корпус'
                    : voice.instrument === 'clav' || voice.instrument === 'guitar'
                      ? 'Тело'
                      : 'Глубина'
              }
              value={voice.depth}
              onChange={(depth) => patchVoice({ depth })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label={
                voice.instrument === 'piano'
                  ? 'Молоток'
                  : voice.instrument === 'clav'
                    ? 'Щелчок'
                    : voice.instrument === 'rhodes' || voice.instrument === 'wurli'
                      ? 'Атака'
                      : 'Presence'
              }
              value={voice.presence}
              onChange={(presence) => patchVoice({ presence })}
              format={(n) => `${Math.round(n * 100)}%`}
            />
            <LabKnob
              label="Зал"
              value={voice.space}
              onChange={(space) => patchVoice({ space })}
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
            <LabResizeHandle
              axis="y"
              label="Размер крутилок"
              onDrag={(dy) =>
                patchPanelLayout({
                  knobsPx: clampKnobsPx(panelLayoutRef.current.knobsPx + dy * 0.35),
                })
              }
              onDragEnd={persistPanelLayout}
              onReset={() => resetPanelKey('knobsPx')}
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
          {renderChordLibraryPanel()}
          </div>
          ) : null}

          {inspectorTab === 'beat' ? (
          <div className="audio-sfx-lab__inspector-section">
              <div className="audio-sfx-lab__beat-panel audio-sfx-lab__beat-panel--inspect">

            <details className="audio-sfx-lab__beat-block audio-sfx-lab__beat-block--presets">
              <summary className="audio-sfx-lab__beat-block-summary">
                <span className="audio-sfx-lab__beat-block-title">Пресеты</span>
                <span className="audio-sfx-lab__beat-block-pick">
                  {activePresetId
                    ? LAB_BEAT_PRESETS.find((p) => p.id === activePresetId)?.label ?? activePresetId
                    : 'свой микс'}
                </span>
              </summary>
              <div className="audio-sfx-lab__beat-presets">
              {LAB_BEAT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={
                    activePresetId === preset.id
                      ? `audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--bpreset-${preset.id} audio-sfx-lab__btn--beat-rhythm-on`
                      : `audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--bpreset-${preset.id}`
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
            </details>
            <details className="audio-sfx-lab__beat-block audio-sfx-lab__beat-block--rhythm">
              <summary className="audio-sfx-lab__beat-block-summary">
                <span className="audio-sfx-lab__beat-block-title">Ритм</span>
                <span className="audio-sfx-lab__beat-block-pick">
                  {beatParams.rhythm === 'none'
                    ? 'выкл'
                    : LAB_BEAT_RHYTHMS.find((r) => r.id === beatParams.rhythm)?.label ?? beatParams.rhythm}
                </span>
              </summary>
              <div className="audio-sfx-lab__beat-presets">
              {LAB_BEAT_RHYTHMS.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className={
                    beatParams.rhythm === r.id
                      ? `audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--rhythm-${r.id} audio-sfx-lab__btn--beat-rhythm-on`
                      : `audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--rhythm-${r.id}`
                  }
                  title={r.hint}
                  onClick={() => {
                    const prev = beatParamsRef.current;
                    if (r.id === 'custom') {
                      const bars = normalizeLabBars(prev.bars);
                      const firstOnly =
                        prev.rhythm === 'custom'
                          ? firstBarPattern(resolveCustomBeatPattern(prev.pattern, bars, false))
                          : firstBarPattern(barPatternFromRhythm(prev.rhythm));
                      const pattern = normalizeBeatPatternForBars(firstOnly, bars, { tileOneBar: false });
                      applyBeatParams({ ...prev, rhythm: 'custom', pattern, patternRepeat: false }, 'Свой ритм', null);
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
              {beatParams.rhythm !== 'custom' && beatParams.rhythm !== 'none' ? (
                <p className="audio-sfx-lab__beat-hint audio-sfx-lab__beat-hint--warn">
                  Пресет «{LAB_BEAT_RHYTHMS.find((r) => r.id === beatParams.rhythm)?.label ?? beatParams.rhythm}»
                  — бочка и хеты на всех {normalizeLabBars(beatParams.bars)} тактах автоматически.
                  Для ручной сетки нажми «Свой».
                </p>
              ) : beatParams.rhythm === 'custom' ? (
                <p className="audio-sfx-lab__beat-hint">
                  Свой ритм — звучат только нарисованные клетки (секвенсор = 1-й такт, дорожки = каждый такт).
                </p>
              ) : null}
            </details>
            <details className="audio-sfx-lab__accordion" open={beatParams.rhythm === 'custom'}>
              <summary>Секвенсор сетки</summary>
              <div className="audio-sfx-lab__accordion-body">
            <div className="audio-sfx-lab__seq" aria-label="Секвенсор ритма">
              <div className="audio-sfx-lab__seq-head">
                <span className="audio-sfx-lab__beat-label">Сетка · 1-й такт (16 шагов)</span>
                <div className="audio-sfx-lab__seq-actions">
                  <button
                    type="button"
                    className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                    onClick={() =>
                      applyCustomPattern(
                        emptyBeatPatternForBars(normalizeLabBars(beatParamsRef.current.bars)),
                        'сетка очищена',
                        false,
                      )
                    }
                  >
                    Очистить
                  </button>
                  <button
                    type="button"
                    className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                    onClick={() => {
                      const next = cloneBeatPattern(displayPattern);
                      for (let i = 0; i < LAB_BEAT_STEPS_PER_BAR; i++) next.hats[i] = i % 2 === 0;
                      applyCustomPattern(next, 'хеты: восьмые', true, true);
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
                      applyCustomPattern(next, 'базовый 4/4', true, true);
                    }}
                  >
                    Базовый 4/4
                  </button>
                </div>
              </div>
              <p className="audio-sfx-lab__beat-hint">
                Кликни клетки — без автозапуска. ▶ / ↻ на транспорте. Секвенсор — только 1-й такт;
                на дорожках бита — все {normalizeLabBars(beatParams.bars)} такта по отдельности.
                Слайдеры ниже = громкость слоя (0 = молчит).
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
            <details className="audio-sfx-lab__beat-block audio-sfx-lab__beat-block--bars" open>
              <summary className="audio-sfx-lab__beat-block-summary">
                <span className="audio-sfx-lab__beat-block-title">Такты</span>
                <span className="audio-sfx-lab__beat-block-pick">
                  {loopBarsNow}
                </span>
              </summary>
              <p className="audio-sfx-lab__beat-hint audio-sfx-lab__beat-hint--bars">
                Прибавить к текущей длине (до {LAB_BARS_MAX}) — сначала выбор слоёв, потом «Склеить»:
              </p>
              <div className="audio-sfx-lab__bars-add audio-sfx-lab__bars-add--inspector">
                {LAB_BARS_ADD_DELTAS.map((d) => {
                  const disabled = addLabBars(loopBarsNow, d) == null;
                  return (
                    <button
                      key={`insp-add-${d}`}
                      type="button"
                      className={
                        stitchPickIds != null && stitchAddDelta === d
                          ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on audio-sfx-lab__btn--bars-add'
                          : 'audio-sfx-lab__btn audio-sfx-lab__btn--primary audio-sfx-lab__btn--bars-add'
                      }
                      disabled={disabled}
                      title={
                        disabled
                          ? `Максимум ${LAB_BARS_MAX} тактов`
                          : `Пришить +${d} такт${d === 4 ? 'а' : 'ов'}`
                      }
                      onClick={() => requestAddLoopBars(d)}
                    >
                      +{d} такт{d === 4 ? 'а' : 'ов'}
                    </button>
                  );
                })}
              </div>
              {labMode === 'music' ? renderStitchFlowPanel({ inInspector: true }) : null}
              {labMode === 'music' && loopBarsNow >= 8 ? renderSwapChunksPanel() : null}
              <p className="audio-sfx-lab__beat-hint audio-sfx-lab__beat-hint--bars">
                Или задать длину сразу:
              </p>
              <div className="audio-sfx-lab__beat-presets">
              {LAB_BARS_OPTIONS.map((bars) => (
                <button
                  key={bars}
                  type="button"
                  className={
                    normalizeLabBars(beatParams.bars) === bars
                      ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset audio-sfx-lab__btn--beat-rhythm-on'
                      : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset'
                  }
                  onClick={() => applyBeatParams({ ...beatParamsRef.current, bars }, `${bars} тактов`, null)}
                >
                  {bars}
                </button>
              ))}
              </div>
            </details>
            <p className="audio-sfx-lab__beat-hint">
              Слои: <strong>Бочка / Хеты / Снейр</strong> — громкость. Бас — отдельно от бочки.
              {labMode === 'music'
                ? ' Мелодии: «● Наиграть поверх» = новый слой. Кнопки +4/+8/+16 над дорожками и в «Такты» — удлинить петлю; «Пришить» копирует выбранные слои в новый хвост.'
                : ' Кнопки +4/+8/+16 — удлинить петлю без сброса ритма.'}
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
          ) : null}

          {labMode === 'music' && inspectorTab === 'atmosphere' ? (
          <div className="audio-sfx-lab__inspector-section audio-sfx-lab__inspector-section--atmo">
                  <p className="audio-sfx-lab__atmo-hint">
                    Крутилки сразу в ▶ петле. У каждого слоя — диапазон тактов («С… по…»).
                    <strong> Тёплый → Дыхание</strong> — медленная волна громкости;
                    <strong> Пульс → Гейт</strong> — резка по долям. Колокола: Высота вниз, Мягкость вверх.
                  </p>
                  <SliderRow
                    label="Мастер атмосферы"
                    value={musicPad.pad}
                    min={0}
                    max={1}
                    step={0.01}
                    format={(n) => `${Math.round(n * 100)}%`}
                    onChange={(pad) => applyMusicPad({ ...musicPadRef.current, pad })}
                  />
                  <div className="audio-sfx-lab__atmo-presets" role="group" aria-label="Добавить слой">
                    {LAB_PAD_KINDS.map((k) => (
                      <button
                        key={k.id}
                        type="button"
                        className={`audio-sfx-lab__btn audio-sfx-lab__atmo-add audio-sfx-lab__atmo-add--${k.id}`}
                        title={k.hint}
                        onClick={() => {
                          const next = normalizeMusicPad({
                            ...musicPadRef.current,
                            layers: [
                              ...musicPadRef.current.layers,
                              createAtmosphereLayer(
                                k.id,
                                musicPadRef.current.layers.length + 1,
                                undefined,
                                undefined,
                                undefined,
                                normalizeLabBars(beatParamsRef.current.bars),
                              ),
                            ],
                          });
                          applyMusicPad(next);
                          setStatus(`+ слой «${k.label}» · слушается в петле`);
                        }}
                      >
                        <span className="audio-sfx-lab__atmo-add-glyph" aria-hidden>
                          {k.glyph}
                        </span>
                        <span>+ {k.label}</span>
                      </button>
                    ))}
                  </div>
                  <ul className="audio-sfx-lab__atmo-layers">
                    {musicPad.layers.map((layer, idx) => {
                      const loopBars = normalizeLabBars(beatParams.bars);
                      const startBar = Math.min(Math.max(1, layer.startBar), loopBars);
                      const endBar = Math.min(Math.max(startBar, layer.endBar), loopBars);
                      const rateLabel =
                        layer.kind === 'warm'
                          ? 'Дыхание'
                          : layer.kind === 'pulse'
                            ? 'Гейт по долям'
                            : layer.kind === 'bell'
                              ? 'Плотность ударов'
                              : layer.kind === 'shimmer'
                                ? 'Мерцание'
                                : layer.kind === 'drone'
                                  ? 'Волна'
                                  : layer.kind === 'noise'
                                    ? 'Дыхание шума'
                                    : 'Движение';
                      return (
                      <li key={layer.id} className="audio-sfx-lab__atmo-layer">
                        <div className="audio-sfx-lab__atmo-layer-top">
                          <button
                            type="button"
                            className={
                              layer.enabled
                                ? 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--loop audio-sfx-lab__glyph--on'
                                : 'audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--reset'
                            }
                            title={layer.enabled ? 'Mute слоя' : 'Включить слой'}
                            onClick={() => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, enabled: !l.enabled } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          >
                            {layer.enabled ? '●' : '○'}
                          </button>
                          <select
                            className="audio-sfx-lab__atmo-kind"
                            value={layer.kind}
                            title="Тип атмосферы"
                            onChange={(e) => {
                              const kind = e.target.value as LabPadKind;
                              const fresh = createAtmosphereLayer(
                                kind,
                                idx + 1,
                                undefined,
                                undefined,
                                undefined,
                                normalizeLabBars(beatParamsRef.current.bars),
                              );
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id
                                  ? {
                                      ...fresh,
                                      id: l.id,
                                      name: l.name === LAB_PAD_KINDS.find((k) => k.id === l.kind)?.label
                                        ? fresh.name
                                        : l.name,
                                      enabled: l.enabled,
                                      gain: l.gain,
                                      startBar: l.startBar,
                                      endBar: l.endBar,
                                    }
                                  : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          >
                            {LAB_PAD_KINDS.map((k) => (
                              <option key={k.id} value={k.id}>
                                {k.glyph} {k.label}
                              </option>
                            ))}
                          </select>
                          <input
                            className="audio-sfx-lab__melody-name"
                            type="text"
                            value={layer.name}
                            aria-label={`Имя слоя ${idx + 1}`}
                            onChange={(e) => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, name: e.target.value } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          />
                          <button
                            type="button"
                            className="audio-sfx-lab__btn audio-sfx-lab__glyph audio-sfx-lab__glyph--rec"
                            title="Удалить слой"
                            disabled={musicPad.layers.length <= 1}
                            onClick={() => {
                              const layers = musicPadRef.current.layers.filter((l) => l.id !== layer.id);
                              if (layers.length === 0) return;
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          >
                            ✕
                          </button>
                        </div>
                        <div className="audio-sfx-lab__atmo-span" title="Слой звучит только в этом диапазоне тактов петли">
                          <span className="audio-sfx-lab__atmo-span-label">Такты</span>
                          <label>
                            с
                            <select
                              value={startBar}
                              aria-label={`Слой ${idx + 1}: с такта`}
                              onChange={(e) => {
                                const nextStart = Math.min(
                                  Math.max(1, Number(e.target.value)),
                                  loopBars,
                                );
                                const layers = musicPadRef.current.layers.map((l) =>
                                  l.id === layer.id
                                    ? {
                                        ...l,
                                        startBar: nextStart,
                                        endBar: Math.max(nextStart, Math.min(l.endBar, loopBars)),
                                      }
                                    : l,
                                );
                                applyMusicPad({ ...musicPadRef.current, layers });
                              }}
                            >
                              {Array.from({ length: loopBars }, (_, i) => i + 1).map((b) => (
                                <option key={`as-${layer.id}-${b}`} value={b}>
                                  {b}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label>
                            по
                            <select
                              value={endBar}
                              aria-label={`Слой ${idx + 1}: по такт`}
                              onChange={(e) => {
                                const nextEnd = Math.min(
                                  Math.max(1, Number(e.target.value)),
                                  loopBars,
                                );
                                const layers = musicPadRef.current.layers.map((l) =>
                                  l.id === layer.id
                                    ? {
                                        ...l,
                                        endBar: Math.max(l.startBar, nextEnd),
                                        startBar: Math.min(l.startBar, nextEnd),
                                      }
                                    : l,
                                );
                                applyMusicPad({ ...musicPadRef.current, layers });
                              }}
                            >
                              {Array.from({ length: loopBars }, (_, i) => i + 1).map((b) => (
                                <option key={`ae-${layer.id}-${b}`} value={b}>
                                  {b}
                                </option>
                              ))}
                            </select>
                          </label>
                          {startBar === 1 && endBar >= loopBars ? (
                            <span className="audio-sfx-lab__atmo-span-meta">весь трек</span>
                          ) : (
                            <span className="audio-sfx-lab__atmo-span-meta audio-sfx-lab__atmo-span-meta--partial">
                              {startBar}–{endBar} / {loopBars}
                            </span>
                          )}
                        </div>
                        <div className="audio-sfx-lab__sliders">
                          <SliderRow
                            label="Громкость"
                            value={layer.gain}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(gain) => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, gain } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          />
                          <SliderRow
                            label="Высота"
                            value={layer.pitch}
                            min={-24}
                            max={12}
                            step={1}
                            format={(n) => `${n > 0 ? '+' : ''}${Math.round(n)} st`}
                            onChange={(pitch) => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, pitch } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          />
                          <SliderRow
                            label="Мягкость"
                            value={layer.soft}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(soft) => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, soft } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          />
                          <SliderRow
                            label="Яркость"
                            value={layer.tone}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(tone) => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, tone } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          />
                          <SliderRow
                            label={rateLabel}
                            value={layer.rate}
                            min={0}
                            max={1}
                            step={0.01}
                            format={(n) => `${Math.round(n * 100)}%`}
                            onChange={(rate) => {
                              const layers = musicPadRef.current.layers.map((l) =>
                                l.id === layer.id ? { ...l, rate } : l,
                              );
                              applyMusicPad({ ...musicPadRef.current, layers });
                            }}
                          />
                        </div>
                      </li>
                      );
                    })}
                  </ul>
          </div>
          ) : null}
          </div>
        </aside>
      </div>
      {layerDockOpen && staffLayerId
        ? (() => {
            const dockLayer = melodyLayers.find((l) => l.id === staffLayerId);
            if (!dockLayer) return null;
            return (
              <div
                className="audio-sfx-lab__layer-dock"
                role="dialog"
                aria-modal="false"
                aria-label={`Слой ${layerDockName || dockLayer.name}`}
              >
                <div className="audio-sfx-lab__layer-dock-bar">
                  <span className="audio-sfx-lab__layer-dock-title">
                    ◈ {layerDockName || dockLayer.name}
                  </span>
                  <div className="audio-sfx-lab__layer-dock-actions">
                    <button
                      type="button"
                      className={
                        playingLayerId === dockLayer.id
                          ? 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-on'
                          : 'audio-sfx-lab__btn audio-sfx-lab__btn--beat-rhythm-on'
                      }
                      title="Только этот слой с начала (как ▶ в сетке)"
                      onClick={() => void playMelodyLayer(dockLayer.id)}
                    >
                      {playingLayerId === dockLayer.id ? '■ Стоп слоя' : '▶ Слой сначала'}
                    </button>
                    <button
                      type="button"
                      className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                      onClick={() => {
                        setLayerDockOpen(false);
                        setStatus('Окно слоя закрыто');
                      }}
                    >
                      ✕
                    </button>
                  </div>
                </div>
                <div className="audio-sfx-lab__layer-dock-body">
                  <LabStaffEditor
                    key={`dock-${dockLayer.id}`}
                    title={`Стан: ${dockLayer.name}`}
                    notes={dockLayer.notes}
                    bpm={beatParams.bpm}
                    voice={dockLayer.voice ? cloneLabVoiceParams(dockLayer.voice) : voice}
                    defaultDur={voice.duration}
                    onChange={(notes) => {
                      const next = melodyLayersRef.current.map((l) =>
                        l.id === dockLayer.id ? { ...l, notes } : l,
                      );
                      melodyLayersRef.current = next;
                      setMelodyLayers(next);
                    }}
                    onCommit={() => {
                      restartMusicLoop(melodyLayersRef.current, musicPadRef.current, {
                        immediate: true,
                      });
                    }}
                  />
                </div>
              </div>
            );
          })()
        : null}
      {keyboardFloat ? renderLabKeyboardDrawer('float') : null}
      {showAuthModal ? (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onSwitchMode={setAuthMode}
        />
      ) : null}
    </div>
  );
}

export default AudioSfxLabPage;
