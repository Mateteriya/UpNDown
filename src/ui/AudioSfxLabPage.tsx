/**
 * Лаборатория SFX: чеклист звуков игры → клавиатура → сохранить в партию.
 * Маршрут: /audio-sfx-lab (sessionStorage updown-devMode=1).
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { installGameSample } from '../audio';
import type { SoundId } from '../audio/types';
import {
  downloadWav,
  encodeWavMono,
  LAB_CHORD_MAX,
  LAB_INSTRUMENTS,
  DEFAULT_LAB_BEAT,
  LAB_BEAT_PRESETS,
  LAB_BEAT_RHYTHMS,
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
  mixBeatIntoSamples,
  resumeLabAudio,
  saveLabSlot,
  startLabBeat,
  stopAllLabNotes,
  stopLabBeat,
  setLabBeatParams,
  upsertLabPreset,
  writeSlotToDevServer,
  type LabBeatParams,
  type LabPhraseNote,
  type LabVoiceParams,
} from '../audio/lab';
import {
  GAME_SOUND_TASKS,
  loadLabDoneMap,
  setLabDone,
  voiceFromSuggest,
  type GameSoundTask,
} from '../audio/lab/gameSoundTasks';
import '../styles/audio-sfx-lab.css';

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
        if (recordT0.current == null) recordT0.current = performance.now();
        const at = (performance.now() - recordT0.current) / 1000;
        setPhrase((p) => [...p, { midi, at }]);
      }
      void playLabNote(midi, v);
      lastPlayedMidiRef.current = midi;
      setStatus(`${activeTask.title}: ${midiLabel(midi)} · ${Math.round(midiToHz(midi, v.detuneCents))} Hz`);
    },
    [activeTask.title, liveVoice],
  );

  const playCurrentChord = useCallback(async (midis: number[], recordHit: boolean) => {
    if (midis.length === 0) return;
    const v = liveVoice();
    voiceRef.current = v;
    await resumeLabAudio();
    if (recordHit && recordingRef.current) {
      if (recordT0.current == null) recordT0.current = performance.now();
      const at = (performance.now() - recordT0.current) / 1000;
      setPhrase((p) => [...p, ...midis.map((midi) => ({ midi, at }))]);
    }
    lastPlayedMidiRef.current = midis[0]!;
    const names = midis.map(midiLabel).join(' + ');
    setStatus(`Аккорд ${midis.length}/${LAB_CHORD_MAX}: ${names}`);
    await playLabChord(midis, v);
  }, [liveVoice]);

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
    setPhrase([]);
    recordT0.current = null;
    setRecording(true);
    setStatus(`Запись для «${activeTask.title}»…`);
  };

  const stopRecord = () => {
    setRecording(false);
    setStatus(phrase.length ? `Записано ${phrase.length} нот для «${activeTask.title}»` : 'Запись пуста');
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
      voice: v,
      phrase: phraseToStore,
      slotHint: id,
      chordMidis: hasChord ? [...chordMidis] : [],
      lastMidi: lastPlayedMidiRef.current,
    });
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

  const applyBeatParams = useCallback((next: LabBeatParams, presetLabel?: string) => {
    setBeatParams(next);
    beatParamsRef.current = next;
    if (beatOnRef.current) {
      void setLabBeatParams(next).then(() => {
        setStatus(presetLabel ? `Бит: ${presetLabel}` : 'Бит обновлён — крути слайдеры');
      });
    } else if (presetLabel) {
      setStatus(`Пресет «${presetLabel}» — включи «Бит», чтобы послушать`);
    }
  }, []);

  return (
    <div className="audio-sfx-lab">
      <header className="audio-sfx-lab__top">
        <button type="button" className="audio-sfx-lab__back" onClick={onBack}>
          ← В приложение
        </button>
        <div className="audio-sfx-lab__titles">
          <h1 className="audio-sfx-lab__title">Лаб: звуки игры</h1>
          <p className="audio-sfx-lab__sub">
            Слева слот → справа крутилки и клавиши → «Сохранить в игру». Готово: {doneCount}/
            {GAME_SOUND_TASKS.length}
          </p>
        </div>
        <p className="audio-sfx-lab__status" role="status">
          {status}
        </p>
      </header>

      <div className="audio-sfx-lab__grid audio-sfx-lab__grid--tasks">
        <section className="audio-sfx-lab__panel audio-sfx-lab__panel--tasks">
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
        </section>

        <section className="audio-sfx-lab__panel audio-sfx-lab__panel--editor">
          <div className="audio-sfx-lab__active-card">
            <div>
              <p className="audio-sfx-lab__active-kicker">Сейчас делаем</p>
              <h2 className="audio-sfx-lab__active-title">
                {activeTask.order}. {activeTask.title}
              </h2>
              <p className="audio-sfx-lab__hint" style={{ margin: '4px 0 0' }}>
                {activeTask.when}
              </p>
              <p className="audio-sfx-lab__active-tip">{activeTask.tip}</p>
              <p className="audio-sfx-lab__hint">
                Файл в игре: <code>{activeTask.id}.wav</code>
                {activeTask.shape === 'phrase' ? ' · фраза или аккорд' : ' · нота, аккорд или удар'}
              </p>
            </div>
            <div className="audio-sfx-lab__active-actions">
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
            </div>
          </div>

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

          <h2>Инструмент</h2>
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

          <h2>Настройки звука</h2>
          <p className="audio-sfx-lab__hint" style={{ marginTop: 0 }}>
            Крутилки действуют сразу на клавиши и на запись. После смены фильтра нажми ноту или «▶ Фраза»
            ещё раз — услышишь новый тембр.
          </p>
          <div className="audio-sfx-lab__sliders audio-sfx-lab__sliders--full">
            <SliderRow
              label="Яркость"
              value={voice.brightness}
              min={0}
              max={1}
              step={0.01}
              onChange={(brightness) => patchVoice({ brightness })}
            />
            <SliderRow
              label="Глубина"
              value={voice.depth}
              min={0}
              max={1}
              step={0.01}
              onChange={(depth) => patchVoice({ depth })}
            />
            <SliderRow
              label="Длительность"
              value={voice.duration}
              min={0.06}
              max={2.8}
              step={0.01}
              format={(n) => `${n.toFixed(2)} с`}
              onChange={(duration) => patchVoice({ duration })}
            />
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
              max={2.2}
              step={0.01}
              format={(n) => `${n.toFixed(2)} с`}
              onChange={(release) => patchVoice({ release })}
            />
            <SliderRow
              label="Громкость"
              value={voice.volume}
              min={0.05}
              max={1}
              step={0.01}
              onChange={(volume) => patchVoice({ volume })}
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
              label="Фильтр (верх)"
              value={voice.filter}
              min={0}
              max={1}
              step={0.01}
              format={(n) => (n >= 0.99 ? 'открыт' : n <= 0.02 ? 'глухо' : `${Math.round(n * 100)}%`)}
              onChange={(filter) => patchVoice({ filter })}
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
              title="Процедурный бит под клавиши. Если включён — попадёт в сохранённый WAV"
              onClick={() => {
                const next = !beatOn;
                setBeatOn(next);
                if (next) {
                  setBakeBeatInFile(true);
                  void startLabBeat(beatParamsRef.current).then((ok) => {
                    if (!ok) {
                      setBeatOn(false);
                      setStatus('Бит не запустился');
                    } else {
                      setStatus('Бит включён — «Бит в WAV» включит его в сохранение');
                    }
                  });
                } else {
                  stopLabBeat();
                  setStatus('Бит выключен (галочка «Бит в WAV» всё ещё может сохранить его в файл)');
                }
              }}
            >
              {beatOn ? '● Бит вкл' : 'Бит'}
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

          <div className="audio-sfx-lab__beat-panel">
            <div className="audio-sfx-lab__beat-presets">
              <span className="audio-sfx-lab__beat-label">Пресет:</span>
              {LAB_BEAT_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className="audio-sfx-lab__btn audio-sfx-lab__btn--beat-preset"
                  onClick={() => applyBeatParams({ ...preset.params }, preset.label)}
                >
                  {preset.label}
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
                  onClick={() => applyBeatParams({ ...beatParamsRef.current, rhythm: r.id }, r.label)}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="audio-sfx-lab__beat-hint">
              «Громкость бита» — в лайве и в WAV. «Хруст» = металл/шум (0 = чисто). Галочка ниже — бит в сохранение.
            </p>
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
            <div className="audio-sfx-lab__beat-sliders">
              <SliderRow
                label="Громкость бита"
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
                label="Глубина"
                value={beatParams.depth}
                min={0}
                max={1}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(depth) => applyBeatParams({ ...beatParamsRef.current, depth })}
              />
              <SliderRow
                label="Перкуссия"
                value={beatParams.percussion}
                min={0}
                max={1}
                step={0.01}
                format={(n) => `${Math.round(n * 100)}%`}
                onChange={(percussion) => applyBeatParams({ ...beatParamsRef.current, percussion })}
              />
              <SliderRow
                label="Хруст"
                value={beatParams.crackle}
                min={0}
                max={1}
                step={0.01}
                format={(n) => (n < 0.02 ? 'выкл' : `${Math.round(n * 100)}%`)}
                onChange={(crackle) => applyBeatParams({ ...beatParamsRef.current, crackle })}
              />
              <SliderRow
                label="Пunch"
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
                ● Запись фразы
              </button>
            ) : (
              <button type="button" className="audio-sfx-lab__btn audio-sfx-lab__btn--rec-on" onClick={stopRecord}>
                ■ Стоп ({phrase.length})
              </button>
            )}
            <button
              type="button"
              className="audio-sfx-lab__btn"
              onClick={() => {
                const v = liveVoice();
                voiceRef.current = v;
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
              disabled={!phrase.length}
            >
              ▶ Фраза
            </button>
            <button
              type="button"
              className="audio-sfx-lab__btn"
              onClick={() => {
                setPhrase([]);
                recordT0.current = null;
              }}
              disabled={!phrase.length}
            >
              Очистить
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

          <div className="audio-sfx-lab__hint audio-sfx-lab__hint--path">
            После скачивания: файл из Downloads положи в{' '}
            <code>public\audio\sfx\{activeTask.id}.wav</code> (замени старый) → в{' '}
            <code>src\audio\bus.ts</code> увеличь <code>SAMPLE_VER</code> → жёсткий F5 в игре.
          </div>
        </section>
      </div>
    </div>
  );
}

export default AudioSfxLabPage;
