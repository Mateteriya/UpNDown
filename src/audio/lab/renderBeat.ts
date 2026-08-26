import { DEFAULT_LAB_BEAT, LAB_SAMPLE_RATE, type LabBeatParams, type LabBeatRhythmId } from './types';

const SR = LAB_SAMPLE_RATE;
const BARS = 4;

const RHYTHM_KICKS: Record<LabBeatRhythmId, number[]> = {
  '808': [0, 8, 16, 24, 32, 40, 48, 56],
  four: [0, 16, 32, 48],
  half: [0, 32],
  dub: [0, 24, 32, 48, 56],
  sync: [0, 6, 16, 22, 32, 38, 48, 54],
  amen: [0, 6, 10, 16, 22, 26, 32, 40, 48, 56],
  trap: [0, 10, 16, 22, 32, 42, 48],
  kick1: [0],
};

const RHYTHM_SNARES: Record<LabBeatRhythmId, number[]> = {
  '808': [4, 20, 36, 52],
  four: [8, 24, 40, 56],
  half: [16, 48],
  dub: [12, 44],
  sync: [4, 12, 20, 28, 44, 52, 60],
  amen: [4, 12, 20, 28, 30, 44, 52, 60],
  trap: [8, 24, 40, 56],
  kick1: [],
};

const RHYTHM_RHYTHM_HASH: Record<LabBeatRhythmId, number> = {
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

function beatSeed(p: LabBeatParams): number {
  const q = (n: number) => Math.round(n * 1000);
  return (
    (q(p.bass) * 73856093) ^
    (q(p.percussion) * 19349663) ^
    (q(p.industrial) * 83492791) ^
    (q(p.crackle) * 56473829) ^
    (q(p.depth) * 97283461) ^
    q(p.bpm) ^
    RHYTHM_RHYTHM_HASH[p.rhythm]
  );
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
  const dur = open ? 0.14 : 0.038;
  at(out, t0, dur, (t) => {
    const n = (rnd() * 2 - 1) * Math.exp(-t * (open ? 14 : 55));
    const metal = Math.sin(2 * Math.PI * 7400 * t) * Math.exp(-t * 40) * 0.12 * crackle;
    return (n * 0.32 + metal) * (open ? 0.22 : 0.16) * amp;
  });
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

/** Срезает верх, когда «Хруст» на нуле — чистый низ. */
function applyHighCut(out: Float64Array, crackle: number): void {
  if (crackle > 0.4) return;
  const mix = 1 - crackle / 0.4;
  let lp = out[0] ?? 0;
  const coef = lerp(0.1, 0.28, mix);
  for (let i = 0; i < out.length; i++) {
    lp += coef * (out[i]! - lp);
    out[i]! = out[i]! * (1 - mix * 0.5) + lp * (mix * 0.5);
  }
}

export function renderBeatSamples(params: LabBeatParams): Float32Array {
  const p = {
    bass: clamp(params.bass, 0, 1),
    percussion: clamp(params.percussion, 0, 1),
    industrial: clamp(params.industrial, 0, 1),
    crackle: clamp(params.crackle, 0, 1),
    bpm: clamp(params.bpm, 80, 190),
    depth: clamp(params.depth, 0, 1),
    rhythm: params.rhythm,
  };
  const beat = 60 / p.bpm;
  const stepDur = beat / 4;
  const steps = BARS * 16;
  const dur = BARS * 4 * beat;
  const n = Math.floor(SR * dur);
  const out = new Float64Array(n);
  const rnd = mulberry32(beatSeed(p));

  const perc = p.percussion;
  const bass = p.bass;
  const grit = p.industrial;
  const crackle = p.crackle;
  const depth = p.depth;
  const rhythm = p.rhythm;
  const noHats = rhythm === '808' || rhythm === 'kick1';
  const use808Kick = rhythm === '808' || rhythm === 'trap' || depth > 0.55;
  const kickBlend = rhythm === '808' || rhythm === 'trap' ? 1 : clamp((depth - 0.35) / 0.65, 0, 1);

  const kickAmp = lerp(0.55, 1.05, bass) * lerp(0.72, 1.05, depth);
  const snareAmp = perc > 0.04 ? Math.max(0.42, perc * 1.05) * lerp(0.95, 0.6, crackle) : 0;
  const hatAmp = noHats ? 0 : perc > 0.04 ? Math.max(0.28, perc * 0.85) * lerp(0.95, 0.35, crackle) : 0;
  const ghostAmp = noHats ? 0 : perc * 0.45 * crackle;
  const rimAmp = noHats ? 0 : perc * 0.35 * crackle;
  const snareNoise = lerp(0.35, 1, crackle);

  const kicks = RHYTHM_KICKS[rhythm];
  const snarePattern = RHYTHM_SNARES[rhythm];
  const snares = perc > 0.08 ? snarePattern : [];
  const ghosts =
    !noHats && perc > 0.5 ? [7, 14, 23, 27, 46, 61] : !noHats && perc > 0.25 ? [14, 46] : [];
  const rims = !noHats && perc > 0.45 ? [2, 18, 34, 50] : [];
  const opens = !noHats && perc > 0.4 ? [14, 30, 46, 58] : !noHats && perc > 0.15 ? [30] : [];

  for (const s of kicks) {
    const t = stepTime(s, stepDur, rhythm);
    if (use808Kick) {
      add808Kick(out, t, kickAmp * lerp(0.55, 1, kickBlend), depth, grit);
      if (kickBlend < 1) addKick(out, t, kickAmp * (1 - kickBlend) * 0.65, bass, crackle);
    } else {
      addKick(out, t, kickAmp, bass, crackle);
    }
  }

  for (const s of snares) addSnare(out, stepTime(s, stepDur, rhythm), snareAmp, snareNoise, rnd);
  for (const s of ghosts) addSnare(out, stepTime(s, stepDur, rhythm), ghostAmp, snareNoise, rnd);
  for (const s of rims) addRim(out, stepTime(s, stepDur, rhythm), rimAmp, crackle);
  for (const s of opens) addHat(out, stepTime(s, stepDur, rhythm), true, hatAmp * 1.4, crackle, rnd);

  if (hatAmp > 0.02) {
    for (let s = 0; s < steps; s++) {
      if (s % 2 === 0 && !snares.includes(s) && !kicks.includes(s)) {
        addHat(out, stepTime(s, stepDur, rhythm), false, hatAmp, crackle, rnd);
      }
      if (perc > 0.35 && s % 4 === 1 && s < 48) addHat(out, stepTime(s, stepDur, rhythm), false, hatAmp * 0.85, crackle, rnd);
    }
  }

  if (crackle > 0.2 && rhythm !== '808' && rhythm !== 'kick1') {
    addGlitch(out, stepTime(32, stepDur, rhythm), stepDur, crackle * grit * lerp(0.35, 0.85, crackle), rnd);
  }

  const padFreq = lerp(55, lerp(38, 28, depth), bass);
  const padAmp = lerp(0.06, 0.22, bass) * lerp(1, 1.2, grit);
  const padSteps =
    rhythm === 'kick1'
      ? [0]
      : rhythm === '808' || rhythm === 'half' || rhythm === 'trap'
        ? [0, 16, 32, 48]
        : bass > 0.5
          ? [0, 8, 16, 24, 40, 48, 56]
          : [0, 16, 32, 48];
  const padDur = stepDur * lerp(2.8, 4.8, depth);

  for (const s of padSteps) {
    const t = stepTime(s, stepDur, rhythm);
    const freq = s >= 48 ? padFreq * 0.72 : padFreq;
    addSoftBassPad(out, t, padDur, freq, padAmp, grit);
    if (crackle > 0.28) {
      addHarshReese(out, t, padDur * 0.85, freq, padAmp * lerp(0, 0.55, (crackle - 0.28) / 0.72), crackle);
    }
  }

  if (bass > 0.2) {
    const subFreq = lerp(41, lerp(32, 22, depth), bass);
    const subSteps = rhythm === 'kick1' ? [0] : rhythm === '808' || rhythm === 'trap' ? kicks : [0, 16, 32, 48];
    for (const s of subSteps) {
      addSubDrone(out, stepTime(s, stepDur, rhythm), stepDur * lerp(3.2, 5.2, depth), subFreq, lerp(0.08, 0.24, bass) * lerp(1, 1.35, depth));
    }
  }

  if (crackle > 0.25) {
    const metalSteps = crackle > 0.55 ? [6, 22, 38, 54] : [22, 54];
    for (const s of metalSteps) addMetalHit(out, stepTime(s, stepDur, rhythm), lerp(0.08, 0.2, crackle));
  }

  if (crackle > 0.45) {
    addMachinePulse(out, stepTime(8, stepDur, rhythm), stepDur * 6, lerp(0.04, 0.12, crackle));
    addMachinePulse(out, stepTime(40, stepDur, rhythm), stepDur * 6, lerp(0.04, 0.12, crackle));
  }

  if (perc > 0.6 && crackle > 0.35 && !noHats) {
    at(out, stepTime(18, stepDur, rhythm), 0.22, (t) => Math.sin(2 * Math.PI * 784 * t + Math.sin(2 * Math.PI * 784 * 3.2 * t) * Math.exp(-t * 8) * 2.4) * Math.exp(-t * 7) * 0.08 * perc * crackle);
    at(out, stepTime(42, stepDur, rhythm), 0.22, (t) => Math.sin(2 * Math.PI * 622 * t + Math.sin(2 * Math.PI * 622 * 3.2 * t) * Math.exp(-t * 8) * 2.4) * Math.exp(-t * 7) * 0.08 * perc * crackle);
  }

  if (crackle > 0.08) {
    for (let i = 0; i < n; i++) {
      if (rnd() < lerp(0.0002, 0.0016, crackle)) out[i]! += (rnd() * 2 - 1) * lerp(0.006, 0.022, crackle);
    }
  }

  applyHighCut(out, crackle);
  applyLowShelf(out, depth);

  let peak = 1e-6;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  const norm = 0.92 / peak;
  for (let i = 0; i < n; i++) out[i]! *= norm;

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
  const vol = clamp(params.volume ?? 1, 0, 2);
  const base =
    lerp(0.55, 0.95, clamp(params.bass, 0, 1)) *
    lerp(1, 1.15, clamp(params.depth, 0, 1)) *
    lerp(1, 1.25, clamp(params.percussion, 0, 1));
  return base * vol;
}

export function beatPlaybackGain(params: LabBeatParams): number {
  const vol = clamp(params.volume ?? 1, 0, 2);
  const bass = clamp(params.bass, 0, 1);
  const depth = clamp(params.depth, 0, 1);
  const perc = clamp(params.percussion, 0, 1);
  return (0.78 + bass * 0.2 + depth * 0.14 + perc * 0.08) * vol;
}

function mergeBeatParams(params: LabBeatParams): LabBeatParams {
  return { ...DEFAULT_LAB_BEAT, ...params };
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
