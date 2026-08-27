import {
  DEFAULT_LAB_BEAT,
  LAB_SAMPLE_RATE,
  emptyBeatPattern,
  normalizeBeatPattern,
  serializeBeatPattern,
  type LabBeatBarPattern,
  type LabBeatParams,
  type LabBeatRhythmId,
} from './types';

const SR = LAB_SAMPLE_RATE;

const RHYTHM_KICKS: Record<Exclude<LabBeatRhythmId, 'custom'>, number[]> = {
  none: [],
  '808': [0, 8, 16, 24, 32, 40, 48, 56],
  four: [0, 16, 32, 48],
  half: [0, 32],
  /** One-drop: кик на 3-ю долю. */
  dub: [8, 24, 40, 56],
  /** Industrial syncopation — плотные смещения. */
  sync: [0, 6, 10, 16, 22, 26, 32, 38, 42, 48, 54, 58],
  amen: [0, 6, 10, 16, 22, 26, 32, 40, 48, 56],
  trap: [0, 7, 10, 16, 19, 26, 32, 35, 42, 48, 51, 58],
  kick1: [0],
};

const RHYTHM_SNARES: Record<Exclude<LabBeatRhythmId, 'custom'>, number[]> = {
  none: [],
  '808': [8, 24, 40, 56],
  four: [8, 24, 40, 56],
  half: [16, 48],
  dub: [4, 12, 20, 28, 36, 44, 52, 60],
  /** Sync: смещённые клэпы / римшоты. */
  sync: [4, 10, 20, 28, 36, 42, 52, 60],
  amen: [4, 12, 20, 28, 30, 44, 52, 60],
  trap: [8, 24, 40, 56],
  kick1: [],
};

const RHYTHM_RHYTHM_HASH: Record<LabBeatRhythmId, number> = {
  custom: 99,
  none: 0,
  '808': 11,
  four: 22,
  half: 33,
  dub: 44,
  sync: 55,
  amen: 66,
  trap: 77,
  kick1: 88,
};

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_BARS = 4;

function tileSteps(pattern: number[], bars: number): number[] {
  if (bars <= BASE_BARS) return pattern;
  const baseSteps = BASE_BARS * 16;
  const reps = Math.max(1, Math.floor(bars / BASE_BARS));
  const out: number[] = [];
  for (let r = 0; r < reps; r++) {
    for (const s of pattern) out.push(s + r * baseSteps);
  }
  return out;
}

function beatSeed(p: {
  bass: number;
  kick: number;
  hats: number;
  snare: number;
  industrial: number;
  crackle: number;
  bpm: number;
  depth: number;
  rhythm: LabBeatRhythmId;
  bars: number;
  pattern?: LabBeatBarPattern;
}): number {
  const q = (n: number) => Math.round(n * 1000);
  let h =
    (q(p.bass) * 73856093) ^
    (q(p.kick) * 19349663) ^
    (q(p.hats) * 83492791) ^
    (q(p.snare) * 56473829) ^
    (q(p.industrial) * 371293) ^
    (q(p.crackle) * 97283461) ^
    (q(p.depth) * 433494437) ^
    q(p.bpm) ^
    (p.bars * 101) ^
    RHYTHM_RHYTHM_HASH[p.rhythm];
  if (p.rhythm === 'custom') {
    const s = serializeBeatPattern(p.pattern);
    for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i);
  }
  return h;
}

function at(out: Float64Array, t0: number, dur: number, fn: (t: number) => number): void {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(out.length, Math.floor((t0 + dur) * SR));
  for (let i = i0; i < i1; i++) {
    const t = i / SR - t0;
    out[i]! += fn(t);
  }
}

function addKick(out: Float64Array, t0: number, amp: number, deep: number, crackle: number): void {
  at(out, t0, 0.24, (t) => {
    const f = lerp(148, 96, deep) * Math.exp(-t * lerp(22, 18, deep)) + lerp(42, 28, deep);
    const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * lerp(12, 9, deep));
    const click =
      Math.sin(2 * Math.PI * lerp(2100, 1200, deep) * t) *
      Math.exp(-t * 90) *
      lerp(0.18, 0.02, deep) *
      crackle;
    return (body * lerp(0.95, 1.15, deep) + click) * amp;
  });
}

function add808Kick(out: Float64Array, t0: number, amp: number, depth: number, grit: number): void {
  at(out, t0, lerp(0.45, 0.62, depth), (t) => {
    const startF = lerp(165, 110, depth);
    const endF = lerp(52, 26, depth);
    const f = endF + (startF - endF) * Math.exp(-t * lerp(9, 5.5, depth));
    const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * lerp(5.2, 3.1, depth));
    const sub = Math.sin(2 * Math.PI * endF * 0.5 * t) * Math.exp(-t * lerp(2.4, 1.1, depth)) * lerp(0.35, 0.62, depth);
    const thump = Math.tanh(body * lerp(1.05, 1.35 + grit * 0.35, depth)) * Math.exp(-t * lerp(4.8, 3.2, depth));
    return (thump * lerp(0.75, 0.95, depth) + sub) * amp;
  });
}

function addSnare(out: Float64Array, t0: number, amp: number, noiseAmt: number, rnd: () => number): void {
  if (amp <= 0.001) return;
  at(out, t0, 0.16, (t) => {
    const tone = Math.sin(2 * Math.PI * 198 * t) * Math.exp(-t * 18);
    const n = (rnd() * 2 - 1) * Math.exp(-t * 22) * noiseAmt;
    return (tone * 0.42 * lerp(0.35, 1, noiseAmt) + n * 0.7) * 0.55 * amp;
  });
}

function addHat(out: Float64Array, t0: number, open: boolean, amp: number, crackle: number, rnd: () => number): void {
  if (amp <= 0.001) return;
  const dur = open ? 0.12 : 0.045;
  at(out, t0, dur, (t) => {
    const n = (rnd() * 2 - 1) * Math.exp(-t * (open ? 12 : 70));
    const metal =
      Math.sin(2 * Math.PI * 7800 * t) * Math.exp(-t * 55) * 0.35 +
      Math.sin(2 * Math.PI * 11200 * t) * Math.exp(-t * 80) * 0.18;
    const body = n * 0.55 + metal * (0.55 + crackle * 0.35);
    return body * (open ? 0.42 : 0.38) * amp;
  });
}

/** Сетка хетов по ритму — отдельный слой, не вырезается киками/снейрами. */
function buildHatSteps(rhythm: Exclude<LabBeatRhythmId, 'custom'>, totalSteps: number): number[] {
  const out: number[] = [];
  for (let s = 0; s < totalSteps; s++) {
    const b = s % 16;
    let hit = false;
    switch (rhythm) {
      case 'none':
        hit = false;
        break;
      case 'kick1':
        hit = b % 2 === 0;
        break;
      case 'trap':
        hit = true;
        break;
      case 'dub':
        hit = b % 4 === 2;
        break;
      case 'sync':
        /* industrial: плотные группы 16-х + syncopation */
        hit = b < 4 || (b >= 8 && b < 12) || b === 5 || b === 13 || b === 14;
        break;
      case 'amen':
        hit = b % 2 === 0 || b === 5 || b === 13;
        break;
      case 'half':
        hit = b === 4 || b === 6 || b === 12 || b === 14;
        break;
      case '808':
      case 'four':
      default:
        hit = b % 2 === 0;
        break;
    }
    if (hit) out.push(s);
  }
  return out;
}

function stepsToBarFlags(steps: number[]): boolean[] {
  const bar = Array.from({ length: 16 }, () => false);
  for (const s of steps) {
    if (s >= 0) bar[s % 16] = true;
  }
  return bar;
}

function tileBarFlags(bar: boolean[], bars: number): number[] {
  const out: number[] = [];
  const total = bars * 16;
  for (let s = 0; s < total; s++) {
    if (bar[s % 16]) out.push(s);
  }
  return out;
}

/** Шаблон ритма → сетка 1 такта (для UI и режима «Свой»). */
export function barPatternFromRhythm(rhythm: LabBeatRhythmId): LabBeatBarPattern {
  if (rhythm === 'custom') return emptyBeatPattern();
  const kicks = RHYTHM_KICKS[rhythm] ?? [];
  const snares = RHYTHM_SNARES[rhythm] ?? [];
  const hats = buildHatSteps(rhythm, 16);
  return {
    kick: stepsToBarFlags(kicks),
    snare: stepsToBarFlags(snares),
    hats: stepsToBarFlags(hats),
  };
}

/** Активная сетка для отображения / правки. */
export function resolveDisplayPattern(params: LabBeatParams): LabBeatBarPattern {
  if (params.rhythm === 'custom') return normalizeBeatPattern(params.pattern);
  return barPatternFromRhythm(params.rhythm);
}

function addRim(out: Float64Array, t0: number, amp: number, crackle: number): void {
  if (amp <= 0.001) return;
  at(out, t0, 0.05, (t) => Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 48) * 0.16 * amp * crackle);
}

/** Мягкий суб-пад — без дребезга. */
function addSoftBassPad(out: Float64Array, t0: number, dur: number, freq: number, amp: number, grit: number): void {
  at(out, t0, dur, (t) => {
    const a = Math.min(1, t / 0.035) * Math.exp(-t * lerp(1.6, 1.1, grit));
    const s1 = Math.sin(2 * Math.PI * freq * t);
    const s2 = Math.sin(2 * Math.PI * freq * 1.004 * t + 0.15);
    const s3 = Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.25;
    const mix = s1 * 0.55 + s2 * 0.3 + s3;
    return Math.tanh(mix * lerp(1, 1.45, grit)) * a * amp;
  });
}

/** Жёсткий reese — только при высоком «Хруст». */
function addHarshReese(out: Float64Array, t0: number, dur: number, freq: number, amp: number, harsh: number): void {
  at(out, t0, dur, (t) => {
    const a = Math.min(1, t / 0.02) * Math.exp(-t * lerp(2.2, 1.4, harsh));
    const s1 = Math.sign(Math.sin(2 * Math.PI * freq * t));
    const s2 = Math.sign(Math.sin(2 * Math.PI * (freq * lerp(1.013, 1.07, harsh)) * t + 0.4));
    const raw = s1 * 0.55 + s2 * 0.45;
    const crush = Math.tanh(raw * lerp(1, 2.8, harsh));
    const lp = crush * (0.45 + 0.55 * Math.exp(-t * lerp(6, 3.5, harsh)));
    return lp * a * amp;
  });
}

function addSubDrone(out: Float64Array, t0: number, dur: number, freq: number, amp: number): void {
  at(out, t0, dur, (t) => {
    const env = Math.min(1, t / 0.05) * Math.exp(-t * 0.85);
    const s =
      Math.sin(2 * Math.PI * freq * t) * 0.65 +
      Math.sin(2 * Math.PI * freq * 0.5 * t) * 0.35 +
      Math.sin(2 * Math.PI * freq * 0.25 * t) * 0.15;
    return s * env * amp;
  });
}

function addMetalHit(out: Float64Array, t0: number, amp: number): void {
  at(out, t0, 0.09, (t) => {
    const ring = Math.sin(2 * Math.PI * lerp(620, 940, t * 40) * t) * Math.exp(-t * 28);
    const grit = Math.tanh(Math.sin(2 * Math.PI * 41 * t * 7) * 2.2) * Math.exp(-t * 18);
    return (ring * 0.55 + grit * 0.45) * amp;
  });
}

function addGlitch(out: Float64Array, t0: number, step: number, amp: number, rnd: () => number): void {
  const bursts = Math.floor(lerp(3, 8, amp));
  for (let k = 0; k < bursts; k++) {
    addSnare(out, t0 + k * (step / 3), amp * (0.55 - k * 0.06), 1, rnd);
  }
}

function addMachinePulse(out: Float64Array, t0: number, dur: number, amp: number): void {
  at(out, t0, dur, (t) => {
    const env = 0.35 + 0.65 * Math.max(0, Math.sin(2 * Math.PI * 2.5 * t));
    const buzz = Math.tanh(Math.sin(2 * Math.PI * 58 * t) * 3) * env;
    return buzz * Math.exp(-t * 0.35) * amp;
  });
}

function stepTime(step: number, stepDur: number, rhythm: LabBeatRhythmId): number {
  const swing =
    rhythm === 'amen' || rhythm === 'sync'
      ? 0.16
      : rhythm === 'trap'
        ? 0.06
        : rhythm === '808'
          ? 0.04
          : rhythm === 'custom'
            ? 0.06
            : 0.08;
  return step * stepDur + (step % 2 === 1 ? stepDur * swing : 0);
}

function applyLowShelf(out: Float64Array, depth: number): void {
  if (depth < 0.45) return;
  const amount = lerp(0, 0.22, (depth - 0.45) / 0.55);
  let lp = 0;
  const coef = lerp(0.08, 0.04, depth);
  for (let i = 0; i < out.length; i++) {
    lp += coef * (out[i]! - lp);
    out[i]! = out[i]! * (1 - amount) + lp * (1 + amount * 2.2);
  }
}


export function renderBeatSamples(params: LabBeatParams): Float32Array {
  const bars = (params.bars === 8 || params.bars === 16 ? params.bars : 4) as 4 | 8 | 16;
  const p = {
    bass: clamp(params.bass, 0, 1),
    kick: clamp(params.kick ?? 0, 0, 1),
    hats: clamp(params.hats ?? 0, 0, 1),
    snare: clamp(params.snare ?? 0, 0, 1),
    industrial: clamp(params.industrial, 0, 1),
    crackle: clamp(params.crackle, 0, 1),
    bpm: clamp(params.bpm, 80, 190),
    depth: clamp(params.depth, 0, 1),
    rhythm: params.rhythm,
    bars,
    pattern: params.pattern,
  };
  const beat = 60 / p.bpm;
  const stepDur = beat / 4;
  const steps = bars * 16;
  const dur = bars * 4 * beat;
  const n = Math.floor(SR * dur);
  const out = new Float64Array(n);
  const rnd = mulberry32(beatSeed(p));

  const bass = p.bass;
  const kickLvl = p.kick;
  const hatLvl = p.hats;
  const snareLvl = p.snare;
  const grit = p.industrial;
  const crackle = p.crackle;
  const depth = p.depth;
  const rhythm = p.rhythm;

  const use808Kick =
    rhythm === '808' || rhythm === 'trap' || rhythm === 'dub' || rhythm === 'custom' || depth > 0.45;
  const kickBlend =
    rhythm === '808' || rhythm === 'trap' || rhythm === 'dub'
      ? 1
      : rhythm === 'custom'
        ? clamp((depth - 0.15) / 0.75, 0, 1)
        : clamp((depth - 0.25) / 0.75, 0, 1);

  const kickAmp = kickLvl * 1.15;
  const snareAmp = snareLvl * (rhythm === 'dub' ? 0.55 : rhythm === 'trap' ? 0.75 : rhythm === 'sync' ? 0.8 : 0.7);
  const hatAmp = hatLvl * (rhythm === 'trap' ? 0.62 : rhythm === 'dub' ? 0.5 : rhythm === 'sync' ? 0.72 : 0.58);
  const snareNoise = lerp(0.25, 1, crackle);

  let kicks: number[] = [];
  let snares: number[] = [];
  let hatSteps: number[] = [];

  if (rhythm === 'custom') {
    const pat = normalizeBeatPattern(params.pattern);
    kicks = kickLvl > 0.01 ? tileBarFlags(pat.kick, bars) : [];
    snares = snareLvl > 0.01 ? tileBarFlags(pat.snare, bars) : [];
    hatSteps = hatAmp > 0.01 ? tileBarFlags(pat.hats, bars) : [];
  } else {
    kicks = kickLvl > 0.01 ? tileSteps(RHYTHM_KICKS[rhythm], bars) : [];
    snares = snareLvl > 0.01 ? tileSteps(RHYTHM_SNARES[rhythm], bars) : [];
    hatSteps = hatAmp > 0.01 ? buildHatSteps(rhythm, steps) : [];
  }

  for (const s of kicks) {
    const t = stepTime(s, stepDur, rhythm);
    if (use808Kick) {
      add808Kick(out, t, kickAmp * lerp(0.7, 1, kickBlend), depth, grit);
      if (kickBlend < 1) addKick(out, t, kickAmp * (1 - kickBlend) * 0.55, depth, crackle);
    } else {
      addKick(out, t, kickAmp, depth, crackle);
    }
  }

  for (const s of snares) addSnare(out, stepTime(s, stepDur, rhythm), snareAmp, snareNoise, rnd);

  if (hatAmp > 0.01) {
    for (const s of hatSteps) {
      const open = rhythm === 'sync' ? s % 16 === 14 : rhythm === 'amen' && s % 16 === 14;
      addHat(out, stepTime(s, stepDur, rhythm), open, hatAmp * (open ? 0.85 : 1), crackle, rnd);
    }
  }

  if (crackle > 0.15 && rhythm !== '808' && rhythm !== 'kick1' && rhythm !== 'none' && rhythm !== 'dub') {
    for (const g of tileSteps([32], bars)) {
      addGlitch(out, stepTime(g, stepDur, rhythm), stepDur, crackle * lerp(0.35, 0.8, grit), rnd);
    }
  }

  const padFreq = lerp(58, lerp(40, 26, depth), bass);
  const padAmp = bass * lerp(0.12, 0.34, depth);
  const padSteps = tileSteps(
    rhythm === 'none'
      ? [0, 16, 32, 48]
      : rhythm === 'kick1'
        ? [0]
        : rhythm === 'dub'
          ? [8, 24, 40, 56]
          : rhythm === '808' || rhythm === 'half' || rhythm === 'trap'
            ? [0, 16, 32, 48]
            : bass > 0.45
              ? [0, 8, 16, 24, 40, 48, 56]
              : [0, 16, 32, 48],
    bars,
  );
  const padDur = stepDur * lerp(2.4, 5.2, depth);

  if (bass > 0.02) {
    for (const s of padSteps) {
      const t = stepTime(s, stepDur, rhythm);
      const freq = (s % 64) >= 48 ? padFreq * 0.75 : padFreq;
      addSoftBassPad(out, t, padDur, freq, padAmp, grit);
      if (crackle > 0.25) {
        addHarshReese(out, t, padDur * 0.8, freq, padAmp * lerp(0, 0.55, (crackle - 0.25) / 0.75), crackle);
      }
    }

    const subFreq = lerp(48, lerp(34, 22, depth), bass);
    const subSteps = tileSteps(
      rhythm === 'none' || rhythm === 'kick1'
        ? rhythm === 'none'
          ? [0, 16, 32, 48]
          : [0]
        : rhythm === 'dub'
          ? [8, 24, 40, 56]
          : rhythm === '808' || rhythm === 'trap'
            ? RHYTHM_KICKS[rhythm]
            : [0, 16, 32, 48],
      bars,
    );
    for (const s of subSteps) {
      addSubDrone(
        out,
        stepTime(s, stepDur, rhythm),
        stepDur * lerp(2.8, 5.5, depth),
        subFreq,
        bass * lerp(0.12, 0.36, depth),
      );
    }
  }

  if (crackle > 0.2) {
    const metalSteps = tileSteps(crackle > 0.55 ? [6, 22, 38, 54] : [22, 54], bars);
    for (const s of metalSteps) addMetalHit(out, stepTime(s, stepDur, rhythm), crackle * 0.22);
  }

  if (crackle > 0.45) {
    for (const s of tileSteps([8, 40], bars)) {
      addMachinePulse(out, stepTime(s, stepDur, rhythm), stepDur * 6, crackle * 0.12);
    }
  }

  if (grit > 0.02) {
    const drive = 1 + grit * 2.4;
    for (let i = 0; i < n; i++) out[i]! = Math.tanh(out[i]! * drive) / Math.tanh(drive);
  }

  if (crackle > 0.05) {
    for (let i = 0; i < n; i++) {
      if (rnd() < crackle * 0.0018) out[i]! += (rnd() * 2 - 1) * crackle * 0.03;
    }
  }

  /* Low-shelf только если хеты почти выкл — иначе верх тонет. */
  if (hatLvl < 0.08) applyLowShelf(out, depth);
  else if (depth > 0.55) applyLowShelf(out, depth * 0.55);

  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0.82) {
    const g = 0.82 / peak;
    for (let i = 0; i < n; i++) out[i]! *= g;
  }

  const fade = Math.min(512, Math.floor(SR * 0.008));
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i]! = out[i]! * a + out[n - fade + i]! * (1 - a);
  }
  for (let i = 0; i < fade; i++) out[n - fade + i]! *= i / fade;

  const pcm = new Float32Array(n);
  for (let i = 0; i < n; i++) pcm[i] = out[i]!;
  return pcm;
}

export function beatMixGain(params: LabBeatParams): number {
  return 0.42 * clamp(params.volume ?? 1, 0, 2);
}

export function beatPlaybackGain(params: LabBeatParams): number {
  /* Ниже — запас под полифонию/клавиши; мастер-лимитер добивает пики */
  return 0.48 * clamp(params.volume ?? 1, 0, 2);
}

function mergeBeatParams(params: LabBeatParams): LabBeatParams {
  const merged = { ...DEFAULT_LAB_BEAT, ...params };
  /* Миграция старого поля percussion → hats/snare, если kick ещё не задан явно в старых сессиях */
  const legacy = params as LabBeatParams & { percussion?: number };
  if (typeof legacy.percussion === 'number' && params.kick === undefined) {
    merged.kick = merged.kick ?? 0.85;
    merged.hats = legacy.percussion * 0.5;
    merged.snare = legacy.percussion * 0.35;
  }
  return merged;
}

function softLimitSample(x: number): number {
  return Math.tanh(x * 1.08) * 0.96;
}

/**
 * Подмешать бит в мелодию (синхронно, без AudioContext).
 * Длина = max(мелодия, петля бита) — в файл попадает полный цикл бита.
 */
export function mixBeatIntoSamples(melody: Float32Array, params: LabBeatParams): Float32Array {
  const p = mergeBeatParams(params);
  const beat = renderBeatSamples(p);
  if (beat.length === 0) return melody;
  if (melody.length === 0) return beat.slice(0);

  const mix = beatMixGain(p);
  const melodyGain = 0.88;
  const n = Math.max(melody.length, beat.length);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const m = i < melody.length ? melody[i]! * melodyGain : 0;
    out[i] = softLimitSample(m + beat[i % beat.length]! * mix);
  }
  return out;
}
