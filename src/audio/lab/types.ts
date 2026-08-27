/** Лаба SFX: пресеты и параметры голоса. */

export type LabInstrumentId = 'bell' | 'epiano' | 'piano' | 'guitar' | 'bass' | 'ebass';

export const LAB_INSTRUMENTS: { id: LabInstrumentId; label: string; hint: string }[] = [
  { id: 'bell', label: 'Колокольчики', hint: 'Мягкий tubular / glass' },
  { id: 'epiano', label: 'Hang / космос', hint: 'Мягкая камера, биение, без жести' },
  { id: 'piano', label: 'Пианино', hint: 'Аддитив + молоток' },
  { id: 'guitar', label: 'Гитара', hint: 'Тёплый щипок (нейлон)' },
  { id: 'bass', label: 'Бас', hint: 'Глубокий body + punch' },
  { id: 'ebass', label: 'Эл. бас', hint: 'Мягкий уютный суб; depth = упругость' },
];

export type LabVoiceParams = {
  instrument: LabInstrumentId;
  /** Яркость / тембр (0…1). */
  brightness: number;
  /** Глубина модуляции / тела (0…1). */
  depth: number;
  /** Длительность ноты, сек. */
  duration: number;
  /** Атака, сек. */
  attack: number;
  /** Релиз, сек. */
  release: number;
  /** Громкость (0…1). */
  volume: number;
  /** Расстройка, центы. */
  detuneCents: number;
  /** Сдвиг октавы клавиатуры (−2…+2). */
  octave: number;
  /** Фильтр верха: 0 = глухо, 1 = открыто. */
  filter: number;
};

export const DEFAULT_LAB_VOICE: LabVoiceParams = {
  instrument: 'bell',
  brightness: 0.72,
  depth: 0.55,
  duration: 0.55,
  attack: 0.008,
  release: 0.35,
  volume: 0.72,
  detuneCents: 0,
  octave: 0,
  filter: 1,
};

/** Сколько нот можно зажать в аккорде. */
export const LAB_CHORD_MAX = 8;

export type LabPhraseNote = {
  midi: number;
  /** Секунды от старта фразы. */
  at: number;
  /** Длительность ноты, сек. Если нет — берётся voice.duration. */
  dur?: number;
};

/** Слой мелодии в режиме «Музыка» — несколько записей поверх бита. */
export type LabMelodyLayer = {
  id: string;
  name: string;
  notes: LabPhraseNote[];
  /** В миксе / mute. */
  enabled: boolean;
  /** Громкость слоя 0…1. */
  gain: number;
};

/** Проставить dur по паузам / дефолту (для нотного стана). */
export function stampPhraseDurations(notes: LabPhraseNote[], defaultDur: number): LabPhraseNote[] {
  const sorted = [...notes].sort((a, b) => a.at - b.at || a.midi - b.midi);
  const d0 = Math.max(0.05, defaultDur);
  return sorted.map((n, i) => {
    if (n.dur != null && n.dur > 0.02) return { ...n, dur: n.dur };
    const next = sorted[i + 1];
    const gap = next ? Math.max(0.05, next.at - n.at) : d0;
    return { ...n, dur: Math.min(d0, gap * 0.92) };
  });
}

export function createMelodyLayer(notes: LabPhraseNote[], ordinal: number, defaultDur = 0.45): LabMelodyLayer {
  return {
    id: `mel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: `Мелодия ${ordinal}`,
    notes: stampPhraseDurations(
      notes.map((n) => ({ midi: n.midi, at: n.at, dur: n.dur })),
      defaultDur,
    ),
    enabled: true,
    gain: 1,
  };
}

/** Квантизация атаки/длительности к сетке (division=4 → шестнадцатые). */
export function quantizePhraseNotes(
  notes: LabPhraseNote[],
  bpm: number,
  division = 4,
): LabPhraseNote[] {
  const beat = 60 / Math.min(190, Math.max(80, bpm));
  const step = beat / Math.max(1, division);
  return notes.map((n) => {
    const at = Math.max(0, Math.round(n.at / step) * step);
    const durRaw = n.dur;
    const dur =
      durRaw != null && durRaw > 0
        ? Math.max(step, Math.round(durRaw / step) * step)
        : durRaw;
    return { ...n, at, dur };
  });
}

/** Свернуть время нот в длину петли (после записи под зацикленный бит). */
export function wrapPhraseNotesToLoop(notes: LabPhraseNote[], loopSec: number): LabPhraseNote[] {
  if (!(loopSec > 0.05)) return notes;
  return notes.map((n) => {
    let at = n.at % loopSec;
    if (at < 0) at += loopSec;
    const dur = Math.min(n.dur ?? 0.2, loopSec);
    return { ...n, at, dur };
  });
}

export const LAB_SLOT_HINTS = [
  'card_play',
  'trick_won',
  'bid_place',
  'your_turn_soft',
  'your_turn_nudge_short',
  'your_turn_nudge_long',
  'deal_results_fly',
  'exact_south',
  'deal_complete',
  'ui_tap',
  'custom',
] as const;

export const LAB_PRESETS_STORAGE_KEY = 'updown_audio_sfx_lab_presets_v1';
export const LAB_SAMPLE_RATE = 44100;

/** Паттерн ударов (4 такта × 16 шагов) или свой секвенсор. */
export type LabBeatRhythmId =
  | 'custom'
  | 'four'
  | 'half'
  | 'amen'
  | '808'
  | 'dub'
  | 'sync'
  | 'trap'
  | 'kick1'
  | 'none';

export const LAB_BEAT_STEPS_PER_BAR = 16;

/** Один такт: 16 шестнадцатых. Повторяется на все такты петли. */
export type LabBeatBarPattern = {
  kick: boolean[];
  snare: boolean[];
  hats: boolean[];
};

export type LabBeatLaneId = keyof LabBeatBarPattern;

export function emptyBeatPattern(): LabBeatBarPattern {
  const z = () => Array.from({ length: LAB_BEAT_STEPS_PER_BAR }, () => false);
  return { kick: z(), snare: z(), hats: z() };
}

export function cloneBeatPattern(p: LabBeatBarPattern): LabBeatBarPattern {
  return {
    kick: p.kick.slice(0, LAB_BEAT_STEPS_PER_BAR),
    snare: p.snare.slice(0, LAB_BEAT_STEPS_PER_BAR),
    hats: p.hats.slice(0, LAB_BEAT_STEPS_PER_BAR),
  };
}

export function normalizeBeatPattern(p?: LabBeatBarPattern | null): LabBeatBarPattern {
  const base = emptyBeatPattern();
  if (!p) return base;
  for (const lane of ['kick', 'snare', 'hats'] as const) {
    const src = p[lane];
    if (!Array.isArray(src)) continue;
    for (let i = 0; i < LAB_BEAT_STEPS_PER_BAR; i++) base[lane][i] = Boolean(src[i]);
  }
  return base;
}

export function serializeBeatPattern(p?: LabBeatBarPattern | null): string {
  const n = normalizeBeatPattern(p);
  const enc = (lane: boolean[]) => lane.map((x) => (x ? '1' : '0')).join('');
  return `${enc(n.kick)}.${enc(n.snare)}.${enc(n.hats)}`;
}

export function patternsEqual(a?: LabBeatBarPattern | null, b?: LabBeatBarPattern | null): boolean {
  return serializeBeatPattern(a) === serializeBeatPattern(b);
}

export const LAB_BEAT_RHYTHMS: { id: LabBeatRhythmId; label: string; hint: string }[] = [
  { id: 'custom', label: 'Свой', hint: 'Рисуй сетку ниже — полностью свой ритм' },
  { id: 'none', label: 'Выкл', hint: 'Без ударной сетки — только бас/атмосфера' },
  { id: '808', label: '808', hint: 'Глубокий 808-кик (шаблон; правь сеткой → Свой)' },
  { id: 'kick1', label: 'Kick×1', hint: 'Один кик на такт — чистый суб' },
  { id: 'trap', label: 'Trap', hint: '808-синкопы + clap на 3' },
  { id: 'four', label: '4/4', hint: 'Кик на каждую долю' },
  { id: 'half', label: 'Half', hint: 'Half-time: 1 и 3' },
  { id: 'dub', label: 'Dub', hint: 'One-drop: кик на 3, snare на 2 и 4' },
  { id: 'sync', label: 'Sync', hint: 'Industrial: синкопы киков + плотные хеты' },
  { id: 'amen', label: 'Amen', hint: 'Классический брейк' },
];

/** Параметры бита в лабе (процедурная петля, не один WAV). */
export type LabBeatParams = {
  /** Суб / пад-низ (0…1). Не включает бочку. */
  bass: number;
  /** Бочка / kick (0…1). 0 = нет бочки. */
  kick: number;
  /** Закрытые хеты (0…1). 0 = нет хетов. */
  hats: number;
  /** Снейр / clap (0…1). 0 = нет снейра. */
  snare: number;
  /** Насыщение / Drive (0…1). */
  industrial: number;
  /** Грязь: металл / шум (0 = чисто). */
  crackle: number;
  /** Темп, BPM. */
  bpm: number;
  /** Характер 808: короткий клик ↔ длинный суб (0…1). */
  depth: number;
  /** Сетка ударов (когда бить; громкость слоёв — kick/hats/snare). */
  rhythm: LabBeatRhythmId;
  /**
   * Свой такт (16 шагов). Используется при rhythm === 'custom'.
   * При выборе шаблона (Sync/808…) тоже заполняется — чтобы можно было править.
   */
  pattern?: LabBeatBarPattern;
  /** Громкость бита (0…2). 1 = норма. */
  volume: number;
  /** Длина петли в тактах (4 / 8 / 16). */
  bars: 4 | 8 | 16;
};

export const DEFAULT_LAB_BEAT: LabBeatParams = {
  bass: 0.85,
  kick: 0.9,
  hats: 0,
  snare: 0,
  industrial: 0.2,
  crackle: 0,
  bpm: 128,
  depth: 0.85,
  rhythm: '808',
  pattern: emptyBeatPattern(),
  volume: 1.1,
  bars: 4,
};

export const LAB_BEAT_PRESETS: { id: string; label: string; params: LabBeatParams }[] = [
  {
    id: '808sub',
    label: '808 Sub',
    params: { bass: 1, kick: 1, hats: 0, snare: 0, industrial: 0.25, crackle: 0, bpm: 124, depth: 1, rhythm: '808', volume: 1, bars: 4 },
  },
  {
    id: 'clean',
    label: 'Clean',
    params: { bass: 0.9, kick: 0.75, hats: 0, snare: 0, industrial: 0.15, crackle: 0, bpm: 120, depth: 0.95, rhythm: 'kick1', volume: 1.1, bars: 4 },
  },
  {
    id: 'kickhat',
    label: 'Kick+Hat',
    params: { bass: 0.7, kick: 0.9, hats: 0.55, snare: 0, industrial: 0.2, crackle: 0, bpm: 128, depth: 0.7, rhythm: 'four', volume: 1, bars: 4 },
  },
  {
    id: 'trap',
    label: 'Trap',
    params: { bass: 0.85, kick: 0.95, hats: 0.45, snare: 0.55, industrial: 0.3, crackle: 0, bpm: 140, depth: 0.88, rhythm: 'trap', volume: 1, bars: 4 },
  },
  {
    id: 'dub',
    label: 'Dub',
    params: { bass: 0.9, kick: 0.85, hats: 0.2, snare: 0.4, industrial: 0.25, crackle: 0, bpm: 132, depth: 0.8, rhythm: 'dub', volume: 1, bars: 4 },
  },
  {
    id: 'industrial',
    label: 'Industrial',
    params: { bass: 0.8, kick: 0.85, hats: 0.5, snare: 0.4, industrial: 0.65, crackle: 0.45, bpm: 148, depth: 0.7, rhythm: 'sync', volume: 1, bars: 4 },
  },
  {
    id: 'idm',
    label: 'IDM break',
    params: { bass: 0.35, kick: 0.7, hats: 0.7, snare: 0.85, industrial: 0.35, crackle: 0.2, bpm: 168, depth: 0.35, rhythm: 'amen', volume: 1, bars: 4 },
  },
];

/** Слоты фоновой музыки (меню / стол). */
export const LAB_MUSIC_SLOTS = [
  { id: 'menu_bed', label: 'Меню', hint: 'Петля главного меню' },
  { id: 'table_bed', label: 'Стол', hint: 'Петля за игровым столом' },
] as const;

export type LabMusicSlotId = (typeof LAB_MUSIC_SLOTS)[number]['id'];

/** Атмосфера поверх бита (режим «Музыка»). */
export type LabMusicPadParams = {
  /** Уровень пада / дрона (0…1). */
  pad: number;
  /** Яркость пада (0…1). */
  tone: number;
  /** Громкость мелодии/фразы в миксе (0…1). */
  melody: number;
};

export const DEFAULT_LAB_MUSIC_PAD: LabMusicPadParams = {
  pad: 0.55,
  tone: 0.4,
  melody: 0.7,
};

/** Снимок UI-сессии музыкальной студии (продолжить с того же места). */
export type LabMusicSessionSnapshot = {
  staffLayerId?: string | null;
  labMode?: 'sfx' | 'music';
  beatOn?: boolean;
  bakeBeat?: boolean;
  focusArrange?: boolean;
  keyboardOpen?: boolean;
};

export type LabPreset = {
  id: string;
  name: string;
  updatedAt: number;
  voice: LabVoiceParams;
  phrase: LabPhraseNote[];
  /** Подсказка слота игры (имя файла). */
  slotHint?: string;
  chordMidis?: number[];
  lastMidi?: number;
  /** sfx по умолчанию (старые пресеты без kind). */
  kind?: 'sfx' | 'music';
  musicSlot?: LabMusicSlotId;
  beat?: LabBeatParams;
  pad?: LabMusicPadParams;
  layers?: LabMelodyLayer[];
  session?: LabMusicSessionSnapshot;
};

export const LAB_SESSION_DRAFT_KEY = 'updown_audio_lab_session_draft_v1';
