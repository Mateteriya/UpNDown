/** Лаба SFX: пресеты и параметры голоса. */

export type LabInstrumentId =
  | 'bell'
  | 'epiano'
  | 'piano'
  | 'rhodes'
  | 'wurli'
  | 'clav'
  | 'guitar'
  | 'bass'
  | 'ebass';

export const LAB_INSTRUMENTS: { id: LabInstrumentId; label: string; hint: string }[] = [
  { id: 'bell', label: 'Колокольчики', hint: 'Мягкий tubular / glass' },
  { id: 'epiano', label: 'Hang / космос', hint: 'Мягкая камера, биение, без жести' },
  { id: 'piano', label: 'Рояль', hint: 'Инерция струн, молоток, корпус' },
  { id: 'rhodes', label: 'Rhodes', hint: 'Эл. пианино · tines' },
  { id: 'wurli', label: 'Wurlitzer', hint: 'Reed EP · тёплый овердрайв' },
  { id: 'clav', label: 'Clavinet', hint: 'Яркий щипок · фанк' },
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
  /** Молоток / присутствие атаки (0…1). */
  presence: number;
  /** Пространство / короткий зал (0…1). */
  space: number;
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
  presence: 0.48,
  space: 0.22,
};

export const LAB_INSTRUMENT_IDS: readonly LabInstrumentId[] = LAB_INSTRUMENTS.map((i) => i.id);

export function isLabInstrumentId(id: unknown): id is LabInstrumentId {
  return typeof id === 'string' && (LAB_INSTRUMENT_IDS as readonly string[]).includes(id);
}

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
  /**
   * Снимок тембра на момент записи слоя.
   * Без него микс «плывёт» при смене крутилок/инструмента клавиатуры.
   */
  voice?: LabVoiceParams;
};

/** Проставить dur по паузам / дефолту (для нотного стана). */
export function stampPhraseDurations(notes: LabPhraseNote[], defaultDur: number): LabPhraseNote[] {
  const sorted = [...notes].sort((a, b) => a.at - b.at || a.midi - b.midi);
  const d0 = Math.max(0.05, defaultDur);
  return sorted.map((n, i) => {
    if (n.dur != null && n.dur > 0.02) return { ...n, dur: n.dur };
    /* Аккорд на одном at: длительность от следующей *другой* атаки */
    let j = i + 1;
    while (j < sorted.length && Math.abs(sorted[j]!.at - n.at) < 1e-4) j++;
    const next = sorted[j];
    const gap = next ? Math.max(0.05, next.at - n.at) : d0;
    return { ...n, dur: Math.min(d0, gap * 0.92) };
  });
}

/** Вставить аккорд (несколько midi на один at) в фразу; at квантуется в 1/16. */
export function insertChordNotesAt(
  notes: LabPhraseNote[],
  midis: number[],
  atSec: number,
  bpm: number,
  defaultDur: number,
): LabPhraseNote[] {
  const uniq = [...new Set(midis.map((m) => Math.round(m)))]
    .sort((a, b) => a - b)
    .slice(0, LAB_CHORD_MAX);
  if (uniq.length === 0) return notes;
  const step = 60 / Math.min(190, Math.max(80, bpm)) / 4;
  const snapped = Math.max(0, Math.round(atSec / step) * step);
  const added: LabPhraseNote[] = uniq.map((midi) => ({ midi, at: snapped }));
  return stampPhraseDurations([...notes, ...added], defaultDur);
}

export function createMelodyLayer(
  notes: LabPhraseNote[],
  ordinal: number,
  defaultDur = 0.45,
  name?: string,
  voice?: LabVoiceParams,
): LabMelodyLayer {
  const trimmed = name?.trim();
  /* Сохраняем dur с записи (Hold/педаль). Без dur — длина по паузам до следующей атаки. */
  return {
    id: `mel_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    name: trimmed && trimmed.length > 0 ? trimmed : `Слой ${ordinal}`,
    notes: stampPhraseDurations(
      notes.map((n) => ({
        midi: n.midi,
        at: n.at,
        ...(n.dur != null && n.dur > 0.02 ? { dur: n.dur } : {}),
      })),
      defaultDur,
    ),
    enabled: true,
    gain: 1,
    ...(voice ? { voice: normalizeLabVoiceParams(voice) } : {}),
  };
}

/**
 * Проставить снимок тембра слоям без voice (старые черновики) — один раз, чтобы микс не плыл.
 */
export function ensureMelodyLayerVoices(
  layers: LabMelodyLayer[],
  fallback: LabVoiceParams,
): { layers: LabMelodyLayer[]; stamped: boolean } {
  const fb = normalizeLabVoiceParams(fallback);
  let stamped = false;
  const next = layers.map((l) => {
    if (l.voice) {
      return {
        ...l,
        notes: l.notes.map((n) => ({ ...n })),
        voice: normalizeLabVoiceParams(l.voice),
      };
    }
    stamped = true;
    return {
      ...l,
      notes: l.notes.map((n) => ({ ...n })),
      voice: normalizeLabVoiceParams(fb),
    };
  });
  return { layers: next, stamped };
}

/** Наложить текущий тембр клавиатуры на все слои (вернуть «склеенный» микс как раньше). */
export function stampVoiceOntoMelodyLayers(
  layers: LabMelodyLayer[],
  voice: LabVoiceParams,
): LabMelodyLayer[] {
  const v = normalizeLabVoiceParams(voice);
  return layers.map((l) => ({
    ...l,
    notes: l.notes.map((n) => ({ ...n })),
    voice: normalizeLabVoiceParams(v),
  }));
}

/** Длительность секции (bars тактов) в секундах. */
export function labSectionDurationSec(bpm: number, bars: number): number {
  const beat = 60 / Math.min(190, Math.max(80, bpm));
  const b = normalizeLabBars(bars);
  return Math.max(1, b) * 4 * beat;
}

/**
 * Скопировать ноты первой половины [0, offset) во вторую [offset, 2·offset).
 * Уже скопированные (есть пары +offset) не дублируем.
 */
export function extendMelodyLayersIntoNextSection(
  layers: LabMelodyLayer[],
  layerIds: string[],
  offsetSec: number,
): LabMelodyLayer[] {
  if (!(offsetSec > 0.05) || layerIds.length === 0) return layers;
  const want = new Set(layerIds);
  const eps = 0.03;
  return layers.map((l) => {
    if (!want.has(l.id) || l.notes.length === 0) return l;
    const head = l.notes.filter((n) => n.at < offsetSec - 0.001);
    if (head.length === 0) return l;
    const alreadyPaired = head.every((n) =>
      l.notes.some(
        (m) => m.midi === n.midi && Math.abs(m.at - (n.at + offsetSec)) < eps,
      ),
    );
    if (alreadyPaired) return l;
    const shifted = head.map((n) => ({
      midi: n.midi,
      at: n.at + offsetSec,
      dur: n.dur,
    }));
    return { ...l, notes: [...l.notes, ...shifted] };
  });
}

/**
 * Поменять местами два куска по sectionBars тактов (0-based индексы кусков).
 * Пример: sectionBars=4, a=0, b=1 → такты 1–4 ↔ 5–8.
 */
export function swapMelodyLayerSections(
  layers: LabMelodyLayer[],
  bpm: number,
  sectionBars: number,
  indexA: number,
  indexB: number,
): LabMelodyLayer[] {
  if (indexA === indexB || indexA < 0 || indexB < 0) return layers;
  const sec = labSectionDurationSec(bpm, sectionBars);
  if (!(sec > 0.05)) return layers;
  return layers.map((l) => ({
    ...l,
    notes: l.notes.map((n) => {
      const section = Math.floor(n.at / sec + 1e-9);
      let at = n.at;
      if (section === indexA) at = n.at - indexA * sec + indexB * sec;
      else if (section === indexB) at = n.at - indexB * sec + indexA * sec;
      return at === n.at ? n : { ...n, at };
    }),
  }));
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

/** Убрать точные дубли (одно midi + то же время) — после склейки кругов / дабл-триггера. */
export function dedupePhraseNotes(notes: LabPhraseNote[], eps = 0.02): LabPhraseNote[] {
  const out: LabPhraseNote[] = [];
  for (const n of notes) {
    const i = out.findIndex((o) => o.midi === n.midi && Math.abs(o.at - n.at) < eps);
    if (i < 0) {
      out.push({ ...n });
      continue;
    }
    const prev = out[i]!;
    const dur = Math.max(prev.dur ?? 0, n.dur ?? 0);
    out[i] = {
      ...prev,
      dur: dur > 0.02 ? dur : prev.dur ?? n.dur,
    };
  }
  return out;
}

/**
 * Уложить запись в длину петли.
 * Если играли несколько кругов — берём последний круг (modulo иначе склеивает дубли → «двойная» мелодия).
 */
export function wrapPhraseNotesToLoop(notes: LabPhraseNote[], loopSec: number): LabPhraseNote[] {
  if (!(loopSec > 0.05) || notes.length === 0) return notes;

  const maxAt = notes.reduce((m, n) => Math.max(m, n.at), 0);
  let windowStart = 0;
  if (maxAt > loopSec * 1.02) {
    windowStart = Math.floor(maxAt / loopSec + 1e-9) * loopSec;
    let inLast = notes.filter((n) => n.at >= windowStart - 1e-6 && n.at < windowStart + loopSec);
    /* Стоп сразу после границы круга — почти пустой хвост → предыдущий полный круг */
    if (inLast.length < 2 && windowStart >= loopSec) {
      windowStart -= loopSec;
      inLast = notes.filter((n) => n.at >= windowStart - 1e-6 && n.at < windowStart + loopSec);
    }
    const sliced = inLast.map((n) => ({
      ...n,
      at: Math.max(0, n.at - windowStart),
      dur: n.dur != null ? Math.min(n.dur, loopSec) : n.dur,
    }));
    return dedupePhraseNotes(sliced);
  }

  return fitMelodyNotesToLoop(notes, loopSec);
}

/**
 * Ноты в [0, loopSec) — как рисует сетка (`at % loop`).
 * Без этого ноты с at за петлёй видны в UI, но placeMelodyInLoop их обрезает → тишина.
 */
export function fitMelodyNotesToLoop(notes: LabPhraseNote[], loopSec: number): LabPhraseNote[] {
  if (!(loopSec > 0.05) || notes.length === 0) return notes;
  const fitted = notes.map((n) => {
    let at = n.at % loopSec;
    if (at < 0) at += loopSec;
    if (!Number.isFinite(at)) at = 0;
    const dur =
      n.dur != null && n.dur > 0 ? Math.min(Math.max(0.04, n.dur), loopSec) : n.dur;
    return { ...n, at, dur };
  });
  return dedupePhraseNotes(fitted);
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
export const LAB_CHORD_PRESETS_STORAGE_KEY = 'updown_audio_lab_chord_presets_v1';
export const LAB_SAMPLE_RATE = 44100;

/** Сохранённый аккорд для библиотеки (2–8 midi). */
export type LabChordPreset = {
  id: string;
  name: string;
  midis: number[];
  updatedAt: number;
};

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

/** Один такт: 16 шестнадцатых. В custom может быть bars×16 — без повтора. */
export type LabBeatBarPattern = {
  kick: boolean[];
  snare: boolean[];
  hats: boolean[];
};

export type LabBeatLaneId = keyof LabBeatBarPattern;

export function beatPatternStepCount(bars: number): number {
  return normalizeLabBars(bars) * LAB_BEAT_STEPS_PER_BAR;
}

export function emptyBeatPattern(): LabBeatBarPattern {
  const z = () => Array.from({ length: LAB_BEAT_STEPS_PER_BAR }, () => false);
  return { kick: z(), snare: z(), hats: z() };
}

export function emptyBeatPatternForBars(bars: number): LabBeatBarPattern {
  const total = beatPatternStepCount(bars);
  const z = () => Array.from({ length: total }, () => false);
  return { kick: z(), snare: z(), hats: z() };
}

export function cloneBeatPattern(p: LabBeatBarPattern): LabBeatBarPattern {
  return {
    kick: [...p.kick],
    snare: [...p.snare],
    hats: [...p.hats],
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

/** Сетка на всю длину петли. */
export type NormalizeBeatPatternOptions = {
  /** Повторить один такт (16 шагов) на всю петлю — для пресетов. Для «Свой» — false. */
  tileOneBar?: boolean;
};

export function normalizeBeatPatternForBars(
  p: LabBeatBarPattern | null | undefined,
  bars: number,
  options?: NormalizeBeatPatternOptions,
): LabBeatBarPattern {
  const tileOneBar = options?.tileOneBar ?? true;
  const total = beatPatternStepCount(bars);
  const base = emptyBeatPatternForBars(bars);
  if (!p) return base;
  for (const lane of ['kick', 'snare', 'hats'] as const) {
    const src = p[lane];
    if (!Array.isArray(src) || src.length === 0) continue;
    if (src.length >= total) {
      for (let i = 0; i < total; i++) base[lane][i] = Boolean(src[i]);
    } else if (src.length > LAB_BEAT_STEPS_PER_BAR) {
      for (let i = 0; i < src.length && i < total; i++) base[lane][i] = Boolean(src[i]);
    } else if (tileOneBar) {
      for (let i = 0; i < total; i++) base[lane][i] = Boolean(src[i % src.length]);
    } else {
      for (let i = 0; i < src.length; i++) base[lane][i] = Boolean(src[i]);
    }
  }
  return base;
}

/** Сетка custom на длину петли.
 *  patternRepeat=true — тайлить короткий паттерн; иначе — как записано (без «схлопывания» копий 1-го такта).
 *  Раньше collapseLegacyLaneTile убивал намеренный paste бар1→2..N, когда все такты совпадали. */
export function resolveCustomBeatPattern(
  p: LabBeatBarPattern | null | undefined,
  bars: number,
  patternRepeat?: boolean,
): LabBeatBarPattern {
  return normalizeBeatPatternForBars(p, bars, { tileOneBar: patternRepeat === true });
}

/** Первый такт сетки (для секвенсора в инспекторе). */
export function firstBarPattern(p: LabBeatBarPattern): LabBeatBarPattern {
  return {
    kick: p.kick.slice(0, LAB_BEAT_STEPS_PER_BAR),
    snare: p.snare.slice(0, LAB_BEAT_STEPS_PER_BAR),
    hats: p.hats.slice(0, LAB_BEAT_STEPS_PER_BAR),
  };
}

/** Записать 16 шагов в такт barIndex (0-based) полной петли. */
export function writeBarIntoPattern(
  full: LabBeatBarPattern,
  barIndex: number,
  bar: LabBeatBarPattern,
): LabBeatBarPattern {
  const next = cloneBeatPattern(full);
  const offset = barIndex * LAB_BEAT_STEPS_PER_BAR;
  for (const lane of ['kick', 'snare', 'hats'] as const) {
    for (let i = 0; i < LAB_BEAT_STEPS_PER_BAR; i++) {
      const idx = offset + i;
      if (idx < next[lane].length) next[lane][idx] = Boolean(bar[lane][i]);
    }
  }
  return next;
}

export function serializeBeatPattern(
  p?: LabBeatBarPattern | null,
  bars?: number,
  options?: NormalizeBeatPatternOptions,
): string {
  const n = bars != null ? normalizeBeatPatternForBars(p, bars, options) : p ?? emptyBeatPattern();
  const enc = (lane: boolean[]) => lane.map((x) => (x ? '1' : '0')).join('');
  return `${enc(n.kick)}.${enc(n.snare)}.${enc(n.hats)}`;
}

export function patternsEqual(
  a?: LabBeatBarPattern | null,
  b?: LabBeatBarPattern | null,
  bars = 4,
  tileOneBar = true,
): boolean {
  const opts = { tileOneBar };
  return serializeBeatPattern(a, bars, opts) === serializeBeatPattern(b, bars, opts);
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

/** Длина петли в тактах: 4…64, кратно 4. */
export type LabBars = number;

export const LAB_BARS_MIN = 4;
export const LAB_BARS_MAX = 64;
export const LAB_BARS_STEP = 4;
/** Шаги «прибавить такты» в UI. */
export const LAB_BARS_ADD_DELTAS = [4, 8, 16] as const;
export type LabBarsAddDelta = (typeof LAB_BARS_ADD_DELTAS)[number];

/** Быстрый выбор абсолютной длины (не единственный способ). */
export const LAB_BARS_OPTIONS: number[] = [4, 8, 16, 32, 64];

export function normalizeLabBars(bars: number | undefined | null): number {
  const n = Math.round(Number(bars) || LAB_BARS_MIN);
  const stepped = Math.round(n / LAB_BARS_STEP) * LAB_BARS_STEP;
  return Math.min(LAB_BARS_MAX, Math.max(LAB_BARS_MIN, stepped));
}

/** Прибавить такты к текущей длине. null = выше потолка. */
export function addLabBars(current: number, delta: number): number | null {
  const cur = normalizeLabBars(current);
  const d = Math.max(LAB_BARS_STEP, Math.round(delta / LAB_BARS_STEP) * LAB_BARS_STEP);
  const next = cur + d;
  if (next > LAB_BARS_MAX) return null;
  return next;
}

/** Следующая длина после «Пришить» с удвоением (legacy). */
export function nextStitchBars(bars: number): number | null {
  const b = normalizeLabBars(bars);
  return addLabBars(b, b);
}

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
  /** При rhythm custom: true = сетка повторяется на все такты (кнопки «4/4», «8ths»). */
  patternRepeat?: boolean;
  /** Громкость бита (0…2). 1 = норма. */
  volume: number;
  /** Длина петли в тактах (4…64, кратно 4). */
  bars: LabBars;
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

/** Тип атмосферного слоя (синт-процедурный). */
export type LabPadKind = 'warm' | 'shimmer' | 'drone' | 'noise' | 'bell' | 'pulse';

export const LAB_PAD_KINDS: { id: LabPadKind; label: string; hint: string; glyph: string }[] = [
  { id: 'warm', label: 'Тёплый', hint: 'Аккордовый pad — крути «Дыхание» (не ритм)', glyph: '🌡' },
  { id: 'shimmer', label: 'Мерцание', hint: 'Высокие обертоны, воздух', glyph: '✨' },
  { id: 'drone', label: 'Дрон', hint: 'Стабильный бас-тон', glyph: '〰' },
  { id: 'noise', label: 'Шум', hint: 'Мягкий эир / wind bed', glyph: '🌬' },
  { id: 'bell', label: 'Колокола', hint: 'Мягкие далёкие колокола — крути Высоту и Мягкость', glyph: '🔔' },
  { id: 'pulse', label: 'Пульс', hint: 'Ритм-гейт по долям — не путать с дыханием «Тёплого»', glyph: '💓' },
];

export type LabAtmosphereLayer = {
  id: string;
  name: string;
  kind: LabPadKind;
  gain: number;
  enabled: boolean;
  /** Яркость / открытость фильтра 0…1. */
  tone: number;
  /** Сдвиг высоты в полутонах (−24…+12). Ниже = глубже. */
  pitch: number;
  /** Мягкость 0…1: атака, LPF, меньше резких обертонов. */
  soft: number;
  /**
   * Характер движения 0…1:
   * warm = дыхание пада; pulse = жёсткость гейта; bell = плотность ударов.
   */
  rate: number;
  /** С какого такта звучит слой (1-based). */
  startBar: number;
  /** По какой такт включительно (1-based). */
  endBar: number;
};

/** Атмосфера поверх бита (режим «Музыка»). */
export type LabMusicPadParams = {
  /** Мастер громкость атмосферы (0…1). */
  pad: number;
  /** Глобальная яркость (legacy / новые слои без tone). */
  tone: number;
  /** Громкость мелодии/фразы в миксе (0…1). */
  melody: number;
  /** Несколько атмосферных слоёв — суммируются. */
  layers: LabAtmosphereLayer[];
};

function defaultLayerControls(
  kind: LabPadKind,
): Pick<LabAtmosphereLayer, 'gain' | 'tone' | 'pitch' | 'soft' | 'rate' | 'startBar' | 'endBar'> {
  const span = { startBar: 1, endBar: 64 };
  switch (kind) {
    case 'bell':
      return { gain: 0.55, tone: 0.28, pitch: -7, soft: 0.72, rate: 0.35, ...span };
    case 'shimmer':
      return { gain: 0.5, tone: 0.55, pitch: -5, soft: 0.55, rate: 0.5, ...span };
    case 'drone':
      return { gain: 0.65, tone: 0.35, pitch: -12, soft: 0.6, rate: 0.4, ...span };
    case 'noise':
      return { gain: 0.45, tone: 0.4, pitch: 0, soft: 0.65, rate: 0.5, ...span };
    case 'pulse':
      return { gain: 0.62, tone: 0.38, pitch: -2, soft: 0.35, rate: 0.7, ...span };
    case 'warm':
    default:
      return { gain: 0.65, tone: 0.45, pitch: 0, soft: 0.5, rate: 0.45, ...span };
  }
}

export function normalizeAtmosphereLayer(
  partial: Partial<LabAtmosphereLayer> & Pick<LabAtmosphereLayer, 'kind'>,
  ordinal = 1,
): LabAtmosphereLayer {
  const defaults = defaultLayerControls(partial.kind);
  const meta = LAB_PAD_KINDS.find((k) => k.id === partial.kind);
  const startBar = Math.max(1, Math.round(partial.startBar ?? defaults.startBar));
  const endBar = Math.max(startBar, Math.round(partial.endBar ?? defaults.endBar));
  return {
    id: partial.id || `pad_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: partial.name?.trim() || meta?.label || `Атм ${ordinal}`,
    kind: partial.kind,
    enabled: partial.enabled !== false,
    gain: Math.min(1, Math.max(0, partial.gain ?? defaults.gain)),
    tone: Math.min(1, Math.max(0, partial.tone ?? defaults.tone)),
    pitch: Math.min(12, Math.max(-24, partial.pitch ?? defaults.pitch)),
    soft: Math.min(1, Math.max(0, partial.soft ?? defaults.soft)),
    rate: Math.min(1, Math.max(0, partial.rate ?? defaults.rate)),
    startBar,
    endBar,
  };
}

export function createAtmosphereLayer(
  kind: LabPadKind,
  ordinal: number,
  gain?: number,
  tone?: number,
  name?: string,
  /** Длина петли в тактах — новый слой по умолчанию на весь трек. */
  loopBars?: number,
): LabAtmosphereLayer {
  const defaults = defaultLayerControls(kind);
  const bars = loopBars != null ? normalizeLabBars(loopBars) : defaults.endBar;
  return normalizeAtmosphereLayer(
    {
      kind,
      name,
      gain: gain ?? defaults.gain,
      tone: tone ?? defaults.tone,
      pitch: defaults.pitch,
      soft: defaults.soft,
      rate: defaults.rate,
      startBar: 1,
      endBar: bars,
    },
    ordinal,
  );
}

/** Миграция старых пресетов без layers / новых полей. */
export function normalizeMusicPad(partial?: Partial<LabMusicPadParams> | null): LabMusicPadParams {
  const pad = partial?.pad ?? 0.55;
  const tone = partial?.tone ?? 0.4;
  const melody = partial?.melody ?? 0.7;
  let layers = partial?.layers;
  if (!Array.isArray(layers) || layers.length === 0) {
    layers = [createAtmosphereLayer('warm', 1, Math.max(0.35, pad), tone, 'Тёплый')];
  } else {
    layers = layers.map((l, i) =>
      normalizeAtmosphereLayer(
        {
          ...l,
          kind: l.kind ?? 'warm',
          tone: l.tone ?? tone,
        },
        i + 1,
      ),
    );
  }
  return { pad, tone, melody, layers };
}

export const DEFAULT_LAB_MUSIC_PAD: LabMusicPadParams = normalizeMusicPad({});

/** Снимок UI-сессии музыкальной студии (продолжить с того же места). */
export type LabMusicSessionSnapshot = {
  staffLayerId?: string | null;
  labMode?: 'sfx' | 'music';
  beatOn?: boolean;
  bakeBeat?: boolean;
  focusArrange?: boolean;
  keyboardOpen?: boolean;
  keyboardFloat?: boolean;
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

/** Глубокая копия слоёв — иначе пресеты делят ссылки с live-состоянием. */
export function cloneLabMelodyLayers(layers: LabMelodyLayer[] | null | undefined): LabMelodyLayer[] {
  if (!layers?.length) return [];
  return layers.map((l) => ({
    ...l,
    notes: l.notes.map((n) => ({ ...n })),
    voice: l.voice ? normalizeLabVoiceParams(l.voice) : undefined,
  }));
}

export function cloneLabBeatParams(beat: LabBeatParams): LabBeatParams {
  const bars = normalizeLabBars(beat.bars);
  return {
    ...beat,
    bars,
    pattern: beat.pattern
      ? cloneBeatPattern(
          normalizeBeatPatternForBars(beat.pattern, bars, {
            tileOneBar: beat.rhythm !== 'custom' || beat.patternRepeat === true,
          }),
        )
      : undefined,
  };
}

export function cloneLabVoiceParams(voice: LabVoiceParams): LabVoiceParams {
  return normalizeLabVoiceParams(voice);
}

/** Нормализация голоса (старые пресеты без presence/space / новых инструментов). */
export function normalizeLabVoiceParams(partial?: Partial<LabVoiceParams> | null): LabVoiceParams {
  const s = partial ?? {};
  return {
    instrument: isLabInstrumentId(s.instrument) ? s.instrument : DEFAULT_LAB_VOICE.instrument,
    brightness: Number.isFinite(s.brightness) ? (s.brightness as number) : DEFAULT_LAB_VOICE.brightness,
    depth: Number.isFinite(s.depth) ? (s.depth as number) : DEFAULT_LAB_VOICE.depth,
    duration: Number.isFinite(s.duration) ? (s.duration as number) : DEFAULT_LAB_VOICE.duration,
    attack: Number.isFinite(s.attack) ? (s.attack as number) : DEFAULT_LAB_VOICE.attack,
    release: Number.isFinite(s.release) ? (s.release as number) : DEFAULT_LAB_VOICE.release,
    volume: Number.isFinite(s.volume) ? (s.volume as number) : DEFAULT_LAB_VOICE.volume,
    detuneCents: Number.isFinite(s.detuneCents) ? (s.detuneCents as number) : DEFAULT_LAB_VOICE.detuneCents,
    octave: Number.isFinite(s.octave) ? (s.octave as number) : DEFAULT_LAB_VOICE.octave,
    filter: Number.isFinite(s.filter) ? (s.filter as number) : DEFAULT_LAB_VOICE.filter,
    presence: Number.isFinite(s.presence) ? (s.presence as number) : DEFAULT_LAB_VOICE.presence,
    space: Number.isFinite(s.space) ? (s.space as number) : DEFAULT_LAB_VOICE.space,
  };
}

export function cloneLabMusicPad(pad: LabMusicPadParams): LabMusicPadParams {
  return normalizeMusicPad({
    ...pad,
    layers: pad.layers?.map((a) => ({ ...a })),
  });
}

function labBarsSpanSec(bpm: number, bars: number): number {
  const beat = 60 / Math.min(190, Math.max(80, bpm));
  return Math.max(0, bars) * 4 * beat;
}

/** Буфер копирования тактов / дорожек (неизменяемый снимок). */
export type LabLoopClip = {
  barsCount: number;
  bpm: number;
  /** Только явно скопированные дорожки ударных. */
  drums?: Partial<LabBeatBarPattern>;
  /** Только явно скопированные слои (по id). Пустые notes — слой был в маске, но в диапазоне тишина. */
  layers?: { id: string; name: string; notes: LabPhraseNote[]; voice?: LabVoiceParams }[];
  /** Откуда сняли (для UI-подписи). */
  meta?: { fromBar: number; toBar: number };
};

export type LabLoopClipSelect = {
  /** 1-based inclusive */
  fromBar: number;
  /** 1-based inclusive */
  toBar: number;
  kick?: boolean;
  snare?: boolean;
  hats?: boolean;
  /** Явный список id. Пустой = мелодии не трогаем. Никогда не значит «все молча». */
  layerIds?: string[];
};

export function cloneLoopClip(clip: LabLoopClip): LabLoopClip {
  return {
    barsCount: clip.barsCount,
    bpm: clip.bpm,
    drums: clip.drums
      ? {
          kick: clip.drums.kick ? [...clip.drums.kick] : undefined,
          snare: clip.drums.snare ? [...clip.drums.snare] : undefined,
          hats: clip.drums.hats ? [...clip.drums.hats] : undefined,
        }
      : undefined,
    layers: clip.layers?.map((l) => ({
      id: l.id,
      name: l.name,
      notes: l.notes.map((n) => ({ ...n })),
      ...(l.voice ? { voice: normalizeLabVoiceParams(l.voice) } : {}),
    })),
    meta: clip.meta ? { ...clip.meta } : undefined,
  };
}

/** Короткая подпись буфера: «1–16 · KSH · 3♪/42». */
export function summarizeLoopClip(clip: LabLoopClip): string {
  const drumBits = (['kick', 'snare', 'hats'] as const)
    .filter((lane) => clip.drums?.[lane])
    .map((lane) => {
      const has = clip.drums?.[lane]?.some(Boolean);
      const letter = lane === 'kick' ? 'K' : lane === 'snare' ? 'S' : 'H';
      return has ? letter : letter.toLowerCase();
    });
  const layerN = clip.layers?.length ?? 0;
  const noteCount = clip.layers?.reduce((n, l) => n + l.notes.length, 0) ?? 0;
  const range =
    clip.meta != null ? `${clip.meta.fromBar}–${clip.meta.toBar}` : `${clip.barsCount}т`;
  const bits = [
    drumBits.length ? drumBits.join('') : null,
    layerN > 0 ? `${layerN}♪/${noteCount}` : null,
  ].filter(Boolean);
  return bits.length ? `${range} · ${bits.join(' · ')}` : range;
}

export function extractLoopClip(
  beat: LabBeatParams,
  layers: LabMelodyLayer[],
  select: LabLoopClipSelect,
  /** Сетка как на таймлайне (пресеты ритма). Без неё custom/пустой pattern даёт пустые дорожки. */
  displayPattern?: LabBeatBarPattern | null,
): LabLoopClip | null {
  const totalBars = normalizeLabBars(beat.bars);
  const from = Math.max(1, Math.min(totalBars, Math.round(select.fromBar)));
  const to = Math.max(from, Math.min(totalBars, Math.round(select.toBar)));
  const barsCount = to - from + 1;
  const bpm = beat.bpm;
  const startSec = labBarsSpanSec(bpm, from - 1);
  const endSec = labBarsSpanSec(bpm, to);
  const startStep = (from - 1) * LAB_BEAT_STEPS_PER_BAR;
  const stepCount = barsCount * LAB_BEAT_STEPS_PER_BAR;

  let drums: Partial<LabBeatBarPattern> | undefined;
  if (select.kick || select.snare || select.hats) {
    const pattern = displayPattern
      ? normalizeBeatPatternForBars(displayPattern, totalBars, { tileOneBar: false })
      : beat.rhythm === 'custom'
        ? normalizeBeatPatternForBars(beat.pattern, totalBars, {
            tileOneBar: beat.patternRepeat === true,
          })
        : normalizeBeatPatternForBars(beat.pattern ?? emptyBeatPattern(), totalBars, {
            tileOneBar: true,
          });
    drums = {};
    for (const lane of ['kick', 'snare', 'hats'] as const) {
      if (!select[lane]) continue;
      drums[lane] = Array.from({ length: stepCount }, (_, i) =>
        Boolean(pattern[lane][startStep + i]),
      );
    }
  }

  const ids = select.layerIds ?? [];
  const clipLayers =
    ids.length === 0
      ? undefined
      : layers
          .filter((l) => ids.includes(l.id))
          .map((l) => ({
            id: l.id,
            name: l.name,
            notes: l.notes
              .filter((n) => n.at >= startSec - 1e-6 && n.at < endSec - 1e-6)
              .map((n) => ({
                ...n,
                at: Math.max(0, n.at - startSec),
              })),
            ...(l.voice ? { voice: normalizeLabVoiceParams(l.voice) } : {}),
          }));

  if (!drums && (!clipLayers || clipLayers.length === 0)) return null;
  return {
    barsCount,
    bpm,
    drums,
    layers: clipLayers,
    meta: { fromBar: from, toBar: to },
  };
}

/** Сколько тактов нужно, чтобы вставить clipBars начиная с pasteAtBar (1-based). */
export function barsNeededForPaste(pasteAtBar: number, clipBars: number): number {
  const at = Math.max(1, Math.round(pasteAtBar));
  const len = Math.max(1, Math.round(clipBars));
  const need = at + len - 1;
  return Math.min(LAB_BARS_MAX, Math.max(LAB_BARS_MIN, Math.ceil(need / LAB_BARS_STEP) * LAB_BARS_STEP));
}

/**
 * Вставить клип начиная с pasteAtBar (1-based).
 * Если не хватает длины петли — удлиняет (кратно 4, до LAB_BARS_MAX).
 * mode: replace — перезаписать шаги/ноты в диапазоне; mix — OR ударов + добавить ноты.
 * Не «сдвигает» вставку влево: если не влезает — обрезает (truncated).
 */
export type LabPasteMode = 'replace' | 'mix';

export type LabPasteResult = {
  beat: LabBeatParams;
  layers: LabMelodyLayer[];
  /** Фактический старт (1-based). */
  actualAt: number;
  endBar: number;
  extendedTo?: number;
  /** usableBars < clip.barsCount */
  truncated: boolean;
  matchedLayerIds: string[];
  createdLayerIds: string[];
};

export function pasteLoopClip(
  beat: LabBeatParams,
  layers: LabMelodyLayer[],
  clip: LabLoopClip,
  pasteAtBar: number,
  mode: LabPasteMode = 'replace',
): LabPasteResult {
  const requestedAt = Math.max(1, Math.min(LAB_BARS_MAX, Math.round(pasteAtBar)));
  const needBars = barsNeededForPaste(requestedAt, clip.barsCount);

  let nextBeat = cloneLabBeatParams(beat);
  let totalBars = normalizeLabBars(nextBeat.bars);
  let extendedTo: number | undefined;
  if (needBars > totalBars) {
    totalBars = needBars;
    extendedTo = totalBars;
    /* Без tileOneBar: иначе «не копировать снейр» всё равно рисует снейр из такта 1. */
    nextBeat = {
      ...nextBeat,
      bars: totalBars,
      pattern: normalizeBeatPatternForBars(nextBeat.pattern, totalBars, { tileOneBar: false }),
    };
  }

  /* Всегда вставляем с запрошенного такта (в пределах петли), без тихого сдвига влево. */
  const at = Math.min(requestedAt, totalBars);
  const endBar = Math.min(totalBars, at + clip.barsCount - 1);
  const usableBars = endBar - at + 1;
  if (usableBars < 1) {
    return {
      beat: nextBeat,
      layers,
      actualAt: at,
      endBar: at,
      extendedTo,
      truncated: true,
      matchedLayerIds: [],
      createdLayerIds: [],
    };
  }
  const truncated = usableBars < clip.barsCount;

  const bpm = nextBeat.bpm;
  const destStartSec = labBarsSpanSec(bpm, at - 1);
  const destEndSec = labBarsSpanSec(bpm, endBar);
  const destStartStep = (at - 1) * LAB_BEAT_STEPS_PER_BAR;
  const usableSteps = usableBars * LAB_BEAT_STEPS_PER_BAR;
  /* Ноты в клипе — в секундах clip.bpm; барабаны — по шагам тактов. */
  const clipBpm = Math.min(190, Math.max(80, clip.bpm || bpm));
  const destBpm = Math.min(190, Math.max(80, bpm));
  const clipToDestSec = clipBpm / destBpm;
  const clipWindowSec = labBarsSpanSec(clipBpm, usableBars);

  if (clip.drums) {
    const pattern = normalizeBeatPatternForBars(nextBeat.pattern, totalBars, {
      tileOneBar: false,
    });
    let kickHits = false;
    let snareHits = false;
    let hatsHits = false;
    for (const lane of ['kick', 'snare', 'hats'] as const) {
      const src = clip.drums[lane];
      if (!src) continue;
      for (let i = 0; i < usableSteps; i++) {
        const bit = Boolean(src[i]);
        if (bit) {
          if (lane === 'kick') kickHits = true;
          else if (lane === 'snare') snareHits = true;
          else hatsHits = true;
        }
        const idx = destStartStep + i;
        if (mode === 'mix') {
          pattern[lane][idx] = Boolean(pattern[lane][idx]) || bit;
        } else {
          pattern[lane][idx] = bit;
        }
      }
    }
    nextBeat = {
      ...nextBeat,
      bars: totalBars,
      rhythm: 'custom',
      patternRepeat: false,
      pattern,
      kick: kickHits && (nextBeat.kick ?? 0) < 0.05 ? 0.85 : nextBeat.kick,
      snare: snareHits && (nextBeat.snare ?? 0) < 0.05 ? 0.7 : nextBeat.snare,
      hats: hatsHits && (nextBeat.hats ?? 0) < 0.05 ? 0.55 : nextBeat.hats,
    };
  }

  const matchedLayerIds: string[] = [];
  const createdLayerIds: string[] = [];
  let nextLayers = cloneLabMelodyLayers(layers);
  if (clip.layers?.length) {
    for (const clipLayer of clip.layers) {
      const notesIn = clipLayer.notes
        .filter((n) => n.at < clipWindowSec - 1e-6)
        .map((n) => ({
          midi: n.midi,
          at: n.at * clipToDestSec + destStartSec,
          dur: n.dur != null && n.dur > 0 ? n.dur * clipToDestSec : n.dur,
        }));

      const idx = nextLayers.findIndex((l) => l.id === clipLayer.id);

      if (idx >= 0) {
        matchedLayerIds.push(clipLayer.id);
        const prev = nextLayers[idx]!;
        const kept =
          mode === 'mix'
            ? prev.notes
            : prev.notes.filter((n) => n.at < destStartSec - 1e-6 || n.at >= destEndSec - 1e-6);
        nextLayers[idx] = {
          ...prev,
          notes: stampPhraseDurations([...kept, ...notesIn], 0.45),
          ...(clipLayer.voice && !prev.voice
            ? { voice: normalizeLabVoiceParams(clipLayer.voice) }
            : {}),
        };
      } else if (notesIn.length > 0) {
        const created = createMelodyLayer(
          notesIn.map((n) => ({ midi: n.midi, at: n.at, dur: n.dur })),
          nextLayers.length + 1,
          0.45,
          clipLayer.name ? `${clipLayer.name} · копия` : 'Копия',
          clipLayer.voice,
        );
        createdLayerIds.push(created.id);
        nextLayers.push(created);
      }
    }
  }

  return {
    beat: nextBeat,
    layers: nextLayers,
    actualAt: at,
    endBar,
    extendedTo,
    truncated,
    matchedLayerIds,
    createdLayerIds,
  };
}

/** Есть ли уже удары/ноты в зоне, куда paste реально пишет (те же lanes/ids). */
export function loopPasteTargetHasContent(
  beat: LabBeatParams,
  layers: LabMelodyLayer[],
  clip: LabLoopClip,
  pasteAtBar: number,
  displayPattern?: LabBeatBarPattern | null,
): boolean {
  const requestedAt = Math.max(1, Math.min(LAB_BARS_MAX, Math.round(pasteAtBar)));
  const totalBars = normalizeLabBars(beat.bars);
  const at = Math.min(requestedAt, Math.max(1, totalBars));
  const to = Math.min(totalBars, at + clip.barsCount - 1);
  if (to < at) return false;

  if (clip.drums && (clip.drums.kick || clip.drums.snare || clip.drums.hats)) {
    const pattern = displayPattern
      ? normalizeBeatPatternForBars(displayPattern, totalBars, { tileOneBar: false })
      : beat.rhythm === 'custom'
        ? normalizeBeatPatternForBars(beat.pattern, totalBars, {
            tileOneBar: beat.patternRepeat === true,
          })
        : normalizeBeatPatternForBars(beat.pattern ?? emptyBeatPattern(), totalBars, {
            tileOneBar: true,
          });
    const startStep = (at - 1) * LAB_BEAT_STEPS_PER_BAR;
    const stepCount = (to - at + 1) * LAB_BEAT_STEPS_PER_BAR;
    for (const lane of ['kick', 'snare', 'hats'] as const) {
      if (!clip.drums[lane]) continue;
      for (let i = 0; i < stepCount; i++) {
        if (pattern[lane][startStep + i]) return true;
      }
    }
  }

  if (clip.layers?.length) {
    const bpm = beat.bpm;
    const destStartSec = labBarsSpanSec(bpm, at - 1);
    const destEndSec = labBarsSpanSec(bpm, to);
    const ids = new Set(clip.layers.map((l) => l.id));
    for (const l of layers) {
      if (!ids.has(l.id)) continue;
      if (l.notes.some((n) => n.at >= destStartSec - 1e-6 && n.at < destEndSec - 1e-6)) {
        return true;
      }
    }
  }

  return false;
}

/** Очистить диапазон тактов (ударные и/или мелодии) — тот же маск, что и extract. */
export function clearLoopRegion(
  beat: LabBeatParams,
  layers: LabMelodyLayer[],
  select: LabLoopClipSelect,
): { beat: LabBeatParams; layers: LabMelodyLayer[] } {
  const totalBars = normalizeLabBars(beat.bars);
  const from = Math.max(1, Math.min(totalBars, Math.round(select.fromBar)));
  const to = Math.max(from, Math.min(totalBars, Math.round(select.toBar)));
  const bpm = beat.bpm;
  const startSec = labBarsSpanSec(bpm, from - 1);
  const endSec = labBarsSpanSec(bpm, to);
  const startStep = (from - 1) * LAB_BEAT_STEPS_PER_BAR;
  const stepCount = (to - from + 1) * LAB_BEAT_STEPS_PER_BAR;

  let nextBeat = cloneLabBeatParams(beat);
  if (select.kick || select.snare || select.hats) {
    const pattern = normalizeBeatPatternForBars(nextBeat.pattern, totalBars, { tileOneBar: false });
    for (const lane of ['kick', 'snare', 'hats'] as const) {
      if (!select[lane]) continue;
      for (let i = 0; i < stepCount; i++) pattern[lane][startStep + i] = false;
    }
    nextBeat = {
      ...nextBeat,
      rhythm: 'custom',
      patternRepeat: false,
      pattern,
    };
  }

  const ids = new Set(select.layerIds ?? []);
  const nextLayers = cloneLabMelodyLayers(layers).map((l) => {
    if (!ids.has(l.id)) return l;
    return {
      ...l,
      notes: l.notes.filter((n) => n.at < startSec - 1e-6 || n.at >= endSec - 1e-6),
    };
  });

  return { beat: nextBeat, layers: nextLayers };
}
