import {
  LAB_SAMPLE_RATE,
  normalizeLabBars,
  type LabAtmosphereLayer,
  type LabMusicPadParams,
  type LabPadKind,
  normalizeAtmosphereLayer,
  normalizeMusicPad,
} from './types';
import { applyLoopSeamCrossfade, computeLoopFadeSamples } from './renderBeat';

function loopTimeSec(i: number, loopDurSec: number): number {
  if (loopDurSec <= 0) return i / LAB_SAMPLE_RATE;
  return (i / LAB_SAMPLE_RATE) % loopDurSec;
}

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

function softClip(x: number): number {
  return Math.tanh(x * 1.35);
}

function lpfInPlace(buf: Float32Array, coef: number): void {
  let lp = buf[0] ?? 0;
  for (let i = 0; i < buf.length; i++) {
    lp += coef * (buf[i]! - lp);
    buf[i] = lp;
  }
}

function hpfInPlace(buf: Float32Array, coef: number): void {
  let prevX = buf[0] ?? 0;
  let prevY = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i]!;
    const y = coef * (prevY + x - prevX);
    buf[i] = y;
    prevX = x;
    prevY = y;
  }
}

type LayerVoice = {
  tone: number;
  soft: number;
  rate: number;
  rootMidi: number;
  gain: number;
};

function voiceFromLayer(layer: LabAtmosphereLayer, baseRoot: number): LayerVoice {
  const l = normalizeAtmosphereLayer(layer);
  return {
    tone: clamp(l.tone, 0, 1),
    soft: clamp(l.soft, 0, 1),
    rate: clamp(l.rate, 0, 1),
    rootMidi: baseRoot + l.pitch,
    gain: clamp(l.gain, 0, 1),
  };
}

function toneSafe(v: LayerVoice): number {
  return v.tone * (1 - v.soft * 0.55);
}

/** Тёплый pad: rate = глубина/скорость «дыхания» аккорда (не ритм-гейт). */
function renderWarm(n: number, bpm: number, v: LayerVoice, loopDurSec: number): Float32Array {
  const out = new Float32Array(n);
  const beat = 60 / clamp(bpm, 80, 190);
  const barDur = beat * 4;
  const root = midiToHz(v.rootMidi);
  const chordA = [root, root * Math.pow(2, 3 / 12), root * Math.pow(2, 7 / 12), root * 2];
  const chordB = [
    root * Math.pow(2, 5 / 12),
    root * Math.pow(2, 8 / 12),
    root * Math.pow(2, 12 / 12),
    root * Math.pow(2, 17 / 12),
  ];
  const detunes = [1, 1.0032, 0.9968];
  const harm = (1 - v.soft * 0.75) * v.tone;
  const breathHz = 0.03 + v.rate * 0.11;
  const breathAmt = 0.08 + v.rate * 0.42;
  for (let i = 0; i < n; i++) {
    const t = loopTimeSec(i, loopDurSec);
    const bar = Math.floor(t / barDur);
    const chord = bar % 4 < 2 ? chordA : chordB;
    let s = 0;
    for (let k = 0; k < chord.length; k++) {
      const f0 = chord[k]!;
      const w = k === 0 ? 0.42 : k === 1 ? 0.34 : k === 2 ? 0.26 : 0.18;
      for (const d of detunes) {
        const f = f0 * d;
        s += Math.sin(2 * Math.PI * f * t) * w;
        s += Math.sin(2 * Math.PI * f * 2 * t) * 0.16 * harm;
        s += Math.sin(2 * Math.PI * f * 3 * t) * 0.07 * harm * harm;
      }
    }
    const breath = 1 - breathAmt + breathAmt * (0.5 + 0.5 * Math.sin(2 * Math.PI * breathHz * t));
    const swell = 0.92 + 0.08 * Math.sin(2 * Math.PI * (0.5 / barDur) * t);
    out[i] = softClip(s * breath * swell * v.gain * 0.22);
  }
  lpfInPlace(out, 0.008 + (1 - v.soft) * 0.04 + toneSafe(v) * 0.12);
  return out;
}

function renderShimmer(n: number, v: LayerVoice, loopDurSec: number): Float32Array {
  const out = new Float32Array(n);
  const base = midiToHz(v.rootMidi + 12 - Math.round(v.soft * 7));
  const harmN = Math.max(2, Math.round(8 - v.soft * 5));
  for (let i = 0; i < n; i++) {
    const t = loopTimeSec(i, loopDurSec);
    let s = 0;
    for (let h = 1; h <= harmN; h++) {
      const f = base * h * (1 + 0.0015 * Math.sin(2 * Math.PI * (0.2 + h * 0.07) * t));
      s += Math.sin(2 * Math.PI * f * t) * (0.18 / (h + 0.4)) * (0.25 + toneSafe(v) * 0.55);
    }
    const twinkle =
      0.5 +
      0.3 * Math.sin(2 * Math.PI * (0.5 + v.rate * 1.2) * t) +
      0.15 * Math.sin(2 * Math.PI * (1.6 + v.tone) * t);
    out[i] = softClip(s * twinkle * v.gain * 0.45);
  }
  hpfInPlace(out, 0.88 + v.soft * 0.08);
  lpfInPlace(out, 0.05 + (1 - v.soft) * 0.15 + toneSafe(v) * 0.2);
  return out;
}

function renderDrone(n: number, v: LayerVoice, loopDurSec: number): Float32Array {
  const out = new Float32Array(n);
  const f = midiToHz(v.rootMidi - 12);
  for (let i = 0; i < n; i++) {
    const t = loopTimeSec(i, loopDurSec);
    const wobble = 1 + 0.012 * Math.sin(2 * Math.PI * 0.06 * t);
    const beat = Math.sin(2 * Math.PI * (0.15 + v.rate * 0.55) * t);
    const s =
      Math.sin(2 * Math.PI * f * wobble * t) * 0.55 +
      Math.sin(2 * Math.PI * f * 0.5 * t) * 0.28 +
      Math.sin(2 * Math.PI * f * 2 * t) * 0.14 * toneSafe(v) +
      Math.sin(2 * Math.PI * f * 3 * t) * 0.05 * toneSafe(v) * toneSafe(v);
    out[i] = softClip(s * (0.75 + 0.25 * beat * v.rate) * v.gain * 0.48);
  }
  lpfInPlace(out, 0.02 + v.soft * 0.04 + toneSafe(v) * 0.08);
  return out;
}

function renderNoise(n: number, v: LayerVoice, loopDurSec: number): Float32Array {
  const out = new Float32Array(n);
  let seed = 991;
  let pink = 0;
  for (let i = 0; i < n; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const white = seed / 0x7fffffff - 1;
    pink = pink * 0.97 + white * 0.03;
    const t = loopTimeSec(i, loopDurSec);
    const breath = 0.4 + 0.6 * Math.pow(0.5 + 0.5 * Math.sin(2 * Math.PI * (0.04 + v.rate * 0.15) * t), 1.4);
    out[i] = pink * breath * v.gain * (0.22 + toneSafe(v) * 0.35);
  }
  lpfInPlace(out, 0.01 + v.soft * 0.04 + toneSafe(v) * 0.05);
  hpfInPlace(out, 0.99 - (1 - v.soft) * 0.04);
  return out;
}

function renderBell(n: number, bpm: number, v: LayerVoice, loopDurSec: number): Float32Array {
  const out = new Float32Array(n);
  const beat = 60 / clamp(bpm, 80, 190);
  const hitEvery = beat * (4.5 - v.rate * 3.2);
  const f0 = midiToHz(v.rootMidi - 5);
  const allPartials = [1, 2.0, 2.76, 3.9, 5.4];
  const partialCount = Math.max(2, Math.round(5 - v.soft * 3));
  const partials = allPartials.slice(0, partialCount);
  const attack = 8 + v.soft * 28;
  const bodyDecay = 0.28 + v.soft * 0.55;

  for (let i = 0; i < n; i++) {
    const t = loopTimeSec(i, loopDurSec);
    const phase = t % hitEvery;
    let s = 0;
    for (let p = 0; p < partials.length; p++) {
      const f = f0 * partials[p]! * (1 + (p % 2 === 0 ? 0.0008 : -0.0008));
      const decay = bodyDecay + p * (0.12 + (1 - v.soft) * 0.18);
      const env = Math.exp(-phase * decay) * (1 - Math.exp(-phase * attack));
      const amp = (0.38 - p * 0.05) * (p === 0 ? 1 : 0.35 + toneSafe(v) * 0.65);
      s += Math.sin(2 * Math.PI * f * t) * env * amp;
    }
    if (v.rate > 0.45) {
      const phase2 = (t + hitEvery * 0.5) % hitEvery;
      const env2 = Math.exp(-phase2 * (0.9 + v.soft)) * (1 - Math.exp(-phase2 * (12 + v.soft * 20)));
      s += Math.sin(2 * Math.PI * f0 * 1.25 * t) * env2 * 0.08 * toneSafe(v) * (v.rate - 0.45);
    }
    out[i] = softClip(s * v.gain * (0.42 + (1 - v.soft) * 0.18));
  }
  lpfInPlace(out, 0.018 + v.soft * 0.07 + (1 - toneSafe(v)) * 0.04);
  return out;
}

/**
 * Пульс: ритмичный гейт по долям — сильно отличается от тёплого дыхания.
 * rate = насколько жёстко режет между долями (0 = мягкий пульс, 1 = почти тишина между).
 */
function renderPulse(n: number, bpm: number, v: LayerVoice, loopDurSec: number): Float32Array {
  const out = new Float32Array(n);
  const beat = 60 / clamp(bpm, 80, 190);
  const root = midiToHz(v.rootMidi);
  const third = root * Math.pow(2, 4 / 12);
  const fifth = root * Math.pow(2, 7 / 12);
  const sharpness = 1.8 + v.rate * 4.5;
  const floor = 0.02 + (1 - v.rate) * 0.22;
  const harm = toneSafe(v) * (1 - v.soft * 0.5);
  for (let i = 0; i < n; i++) {
    const t = loopTimeSec(i, loopDurSec);
    const phase = (t / beat) % 1;
    const beatIdx = Math.floor(t / beat) % 4;
    /* сильные доли 1 и 3, слабые 2 и 4 */
    const accent = beatIdx === 0 || beatIdx === 2 ? 1 : 0.55;
    const gateShape = Math.pow(Math.max(0, Math.sin(Math.PI * Math.min(1, phase / 0.2))), sharpness);
    const gate = floor + (1 - floor) * gateShape * accent;
    const s =
      Math.sin(2 * Math.PI * root * t) * 0.55 +
      Math.sin(2 * Math.PI * third * t) * 0.28 +
      Math.sin(2 * Math.PI * fifth * t) * 0.22 +
      Math.sin(2 * Math.PI * root * 2 * t) * 0.12 * harm;
    out[i] = softClip(s * gate * v.gain * 0.52);
  }
  lpfInPlace(out, 0.04 + v.soft * 0.08 + (1 - toneSafe(v)) * 0.05);
  return out;
}

function renderLayerKind(
  kind: LabPadKind,
  n: number,
  bpm: number,
  v: LayerVoice,
  loopDurSec: number,
): Float32Array {
  switch (kind) {
    case 'shimmer':
      return renderShimmer(n, v, loopDurSec);
    case 'drone':
      return renderDrone(n, v, loopDurSec);
    case 'noise':
      return renderNoise(n, v, loopDurSec);
    case 'bell':
      return renderBell(n, bpm, v, loopDurSec);
    case 'pulse':
      return renderPulse(n, bpm, v, loopDurSec);
    case 'warm':
    default:
      return renderWarm(n, bpm, v, loopDurSec);
  }
}

/** Маска «только такты start…end» с короткими фейдами на границах. */
function applyBarSpanMask(
  buf: Float32Array,
  bpm: number,
  totalBars: number,
  startBar: number,
  endBar: number,
): void {
  const beat = 60 / clamp(bpm, 80, 190);
  const barDur = beat * 4;
  const start = clamp(startBar, 1, totalBars);
  const end = clamp(endBar, start, totalBars);
  if (start <= 1 && end >= totalBars) return;

  const t0 = (start - 1) * barDur;
  const t1 = end * barDur;
  const fade = Math.min(0.08, barDur * 0.12);
  for (let i = 0; i < buf.length; i++) {
    const t = i / LAB_SAMPLE_RATE;
    let g = 0;
    if (t >= t0 && t < t1) {
      g = 1;
      if (t < t0 + fade) g = (t - t0) / fade;
      else if (t > t1 - fade) g = (t1 - t) / fade;
    }
    buf[i]! *= clamp(g, 0, 1);
  }
}

/** Свести все включённые слои атмосферы в один буфер. */
export function renderAtmosphereMix(
  n: number,
  bpm: number,
  pad: LabMusicPadParams,
  rootMidi: number,
  loopBars?: number,
  /** true = слой внутри music bed; стык делает финальный mix. */
  embedInBed = false,
): Float32Array {
  const p = normalizeMusicPad(pad);
  const master = clamp(p.pad, 0, 1);
  if (master < 0.01) return new Float32Array(n);

  const beat = 60 / clamp(bpm, 80, 190);
  const barDur = beat * 4;
  const totalBars =
    loopBars != null
      ? normalizeLabBars(loopBars)
      : Math.max(1, Math.round(n / (LAB_SAMPLE_RATE * barDur)));

  const loopDurSec = n / LAB_SAMPLE_RATE;
  const stepDur = beat / 4;

  const out = new Float32Array(n);
  const active = p.layers.filter((l) => l.enabled && l.gain >= 0.02);
  if (active.length === 0) return out;

  const norm = active.length <= 1 ? 1 : 1 / Math.sqrt(active.length);
  for (const layer of active) {
    const v = voiceFromLayer(layer, rootMidi);
    v.gain *= norm;
    const slice = renderLayerKind(layer.kind, n, bpm, v, loopDurSec);
    applyBarSpanMask(slice, bpm, totalBars, layer.startBar, layer.endBar);
    for (let i = 0; i < n; i++) out[i]! += slice[i]!;
  }

  for (let i = 0; i < n; i++) out[i]! = softClip(out[i]! * master);

  if (!embedInBed) {
    applyLoopSeamCrossfade(out, computeLoopFadeSamples(n, stepDur, stepDur * 4));
  }

  return out;
}

export type { LabAtmosphereLayer };
