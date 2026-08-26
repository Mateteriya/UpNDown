/** Лаба SFX: пресеты и параметры голоса. */

export type LabInstrumentId = 'bell' | 'epiano' | 'piano' | 'guitar' | 'bass';

export const LAB_INSTRUMENTS: { id: LabInstrumentId; label: string; hint: string }[] = [
  { id: 'bell', label: 'Колокольчики', hint: 'Мягкий tubular / glass' },
  { id: 'epiano', label: 'Hang / космос', hint: 'Мягкая камера, биение, без жести' },
  { id: 'piano', label: 'Пианино', hint: 'Аддитив + молоток' },
  { id: 'guitar', label: 'Гитара', hint: 'Тёплый щипок (нейлон)' },
  { id: 'bass', label: 'Бас', hint: 'Глубокий body + punch' },
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
};

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

/** Паттерн ударов (4 такта × 16 шагов). */
export type LabBeatRhythmId = 'four' | 'half' | 'amen' | '808' | 'dub' | 'sync' | 'trap' | 'kick1';

export const LAB_BEAT_RHYTHMS: { id: LabBeatRhythmId; label: string; hint: string }[] = [
  { id: '808', label: '808', hint: 'Глубокий 808-кик, без хатов' },
  { id: 'kick1', label: 'Kick×1', hint: 'Один кик на всю петлю — чистый суб' },
  { id: 'trap', label: 'Trap', hint: 'Half-time trap: 808 + clap на 3' },
  { id: 'four', label: '4/4', hint: 'Кик на каждую долю' },
  { id: 'half', label: 'Half', hint: 'Half-time: 1 и 3' },
  { id: 'dub', label: 'Dub', hint: 'Редкий dub-ритм' },
  { id: 'sync', label: 'Sync', hint: 'Синкопы / industrial-сетка' },
  { id: 'amen', label: 'Amen', hint: 'Классический брейк' },
];

/** Параметры бита в лабе (процедурная петля, не один WAV). */
export type LabBeatParams = {
  /** Суб / reese / громкость низа (0…1). */
  bass: number;
  /** Хаты, снейры, римы (0…1). На 808 / Kick×1 хаты выключены. */
  percussion: number;
  /** Насыщение низа / punch (0…1), без яркого хруста. */
  industrial: number;
  /** Дребезг / металл / глитч / шум (0 = чисто). */
  crackle: number;
  /** Темп, BPM. */
  bpm: number;
  /** Низкая часть / 808-характер (0…1). */
  depth: number;
  /** Сетка ударов. */
  rhythm: LabBeatRhythmId;
  /** Громкость бита (0…2). 1 = норма. */
  volume: number;
};

export const DEFAULT_LAB_BEAT: LabBeatParams = {
  bass: 0.92,
  percussion: 0.08,
  industrial: 0.35,
  crackle: 0,
  bpm: 128,
  depth: 0.92,
  rhythm: '808',
  volume: 1.2,
};

export const LAB_BEAT_PRESETS: { id: string; label: string; params: LabBeatParams }[] = [
  {
    id: '808sub',
    label: '808 Sub',
    params: { bass: 1, percussion: 0, industrial: 0.35, crackle: 0, bpm: 124, depth: 1, rhythm: '808', volume: 1 },
  },
  {
    id: 'clean',
    label: 'Clean',
    params: { bass: 0.88, percussion: 0, industrial: 0.25, crackle: 0, bpm: 120, depth: 0.95, rhythm: 'kick1', volume: 1.1 },
  },
  {
    id: 'trap',
    label: 'Trap',
    params: { bass: 0.9, percussion: 0.35, industrial: 0.4, crackle: 0, bpm: 140, depth: 0.88, rhythm: 'trap', volume: 1 },
  },
  {
    id: 'industrial',
    label: 'Industrial',
    params: { bass: 0.88, percussion: 0.22, industrial: 0.65, crackle: 0.55, bpm: 148, depth: 0.72, rhythm: 'sync', volume: 1 },
  },
  {
    id: 'idm',
    label: 'IDM break',
    params: { bass: 0.4, percussion: 0.9, industrial: 0.35, crackle: 0.25, bpm: 168, depth: 0.35, rhythm: 'amen', volume: 1 },
  },
  {
    id: 'sub',
    label: 'Sub',
    params: { bass: 0.95, percussion: 0.12, industrial: 0.3, crackle: 0, bpm: 132, depth: 0.88, rhythm: 'half', volume: 1.15 },
  },
];
