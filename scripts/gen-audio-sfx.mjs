/**
 * Генерация коротких SFX: FM-колокольчики (DX/IDM) + электро-пианино (Rhodes-ish).
 * Запуск: node scripts/gen-audio-sfx.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'audio', 'sfx');
const SR = 44100;

function clamp(x, a, b) {
  return Math.min(b, Math.max(a, x));
}

function writeWav(path, samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = clamp(samples[i], -1, 1);
    buf.writeInt16LE((v * 32767) | 0, 44 + i * 2);
  }
  writeFileSync(path, buf);
}

function env(t, attack, decay, sustain, release, dur) {
  if (t < 0) return 0;
  if (t < attack) return t / attack;
  if (t < attack + decay) {
    const u = (t - attack) / decay;
    return 1 - u * (1 - sustain);
  }
  if (t < dur - release) return sustain;
  if (t < dur) return sustain * (1 - (t - (dur - release)) / release);
  return 0;
}

/** FM-колокольчик (алг. 5 / DX-ish). */
function fmBell(freq, dur, amp = 0.55, brightness = 1) {
  const n = Math.floor(SR * dur);
  const out = new Float64Array(n);
  const modRatio = 3.5;
  const iIdx = 6.5 * brightness;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = env(t, 0.002, 0.18, 0.12, 0.55, dur) * amp;
    const modEnv = env(t, 0.001, 0.35, 0.05, 0.4, dur);
    const mod = Math.sin(2 * Math.PI * freq * modRatio * t) * iIdx * modEnv * freq;
    const car = Math.sin(2 * Math.PI * freq * t + (2 * Math.PI * mod) / SR);
    const harm = 0.18 * Math.sin(2 * Math.PI * freq * 2.01 * t) * env(t, 0.002, 0.12, 0.05, 0.35, dur);
    out[i] = (car + harm) * a;
  }
  return out;
}

/** Электро-пианино (простой FM Rhodes). */
function ePiano(freq, dur, amp = 0.5) {
  const n = Math.floor(SR * dur);
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = env(t, 0.004, 0.22, 0.28, 0.7, dur) * amp;
    const m = Math.sin(2 * Math.PI * freq * t) * (2.2 * env(t, 0.002, 0.4, 0.1, 0.5, dur));
    const c = Math.sin(2 * Math.PI * freq * t + m);
    const tine = 0.12 * Math.sin(2 * Math.PI * freq * 14 * t) * Math.exp(-t * 9);
    out[i] = (c + tine) * a;
  }
  return out;
}

function softNoise(dur, amp, centerHz) {
  const n = Math.floor(SR * dur);
  const out = new Float64Array(n);
  let lp = 0;
  const cos = 2 * Math.cos((2 * Math.PI * centerHz) / SR);
  let s1 = 0;
  let s2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = env(t, 0.002, 0.03, 0.2, 0.08, dur) * amp;
    const white = Math.random() * 2 - 1;
    /* простой bandpass resonator */
    const y = white + cos * s1 - s2;
    s2 = s1;
    s1 = y * 0.15;
    lp = lp * 0.7 + y * 0.3;
    out[i] = lp * a * 0.08;
  }
  return out;
}

function mix(...parts) {
  let len = 0;
  for (const p of parts) len = Math.max(len, p.length);
  const out = new Float64Array(len);
  for (const p of parts) {
    for (let i = 0; i < p.length; i++) out[i] += p[i];
  }
  let peak = 1e-9;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const g = 0.92 / peak;
  for (let i = 0; i < len; i++) out[i] *= g;
  return out;
}

function concatWithGap(a, b, gapSec) {
  const gap = Math.floor(SR * gapSec);
  const out = new Float64Array(a.length + gap + b.length);
  out.set(a, 0);
  out.set(b, a.length + gap);
  return out;
}

function chord(freqs, maker, dur, amp) {
  return mix(...freqs.map((f, i) => maker(f, dur, amp * (1 - i * 0.08))));
}

mkdirSync(OUT, { recursive: true });

const files = {
  /*
   * Карта на стол: «глубокий» удар, но со слышимой серединой (телефоны режут <120 Hz).
   * Короткий soft-thud: 180/270/360 + лёгкий клик.
   */
  card_play: (() => {
    const dur = 0.13;
    const n = Math.floor(SR * dur);
    const out = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      const a = env(t, 0.002, 0.028, 0.2, 0.07, dur) * 0.95;
      const body = Math.sin(2 * Math.PI * 180 * t);
      const mid = 0.7 * Math.sin(2 * Math.PI * 270 * t);
      const hi = 0.35 * Math.sin(2 * Math.PI * 360 * t);
      const click = 0.22 * Math.sin(2 * Math.PI * 720 * t) * Math.exp(-t * 70);
      out[i] = (0.55 * body + mid + hi + click) * a;
    }
    return out;
  })(),

  trick_won: chord([523.25, 659.25], (f, d, a) => fmBell(f, d, a, 0.9), 0.55, 0.42),

  bid_place: chord([392, 493.88], (f, d, a) => ePiano(f, d, a), 0.45, 0.4),

  exact_south: mix(
    fmBell(523.25, 0.7, 0.38, 1),
    fmBell(659.25, 0.75, 0.32, 0.95),
    fmBell(783.99, 0.85, 0.28, 0.9),
  ),
  exact_other: mix(fmBell(523.25, 0.5, 0.22, 0.85), fmBell(659.25, 0.55, 0.16, 0.8)),

  over_south: mix(ePiano(349.23, 0.55, 0.38), ePiano(293.66, 0.65, 0.3)),
  over_other: ePiano(311.13, 0.45, 0.22),

  under_south: mix(ePiano(196, 0.7, 0.32), ePiano(164.81, 0.8, 0.26)),
  under_other: ePiano(185, 0.55, 0.18),

  illegal: mix(softNoise(0.12, 1.2, 380), ePiano(130.81, 0.28, 0.28)),

  /* Ход: мелодичная мини-фраза (ми–соль#–си) */
  your_turn_soft: mix(
    fmBell(659.25, 0.38, 0.34, 0.9),
    fmBell(830.61, 0.42, 0.28, 0.95),
    fmBell(987.77, 0.5, 0.22, 0.85),
  ),

  your_turn_nudge_short: mix(
    fmBell(739.99, 0.36, 0.32, 1),
    fmBell(932.33, 0.4, 0.26, 0.95),
    fmBell(1108.73, 0.44, 0.18, 0.85),
  ),

  your_turn_nudge_long: (() => {
    const notes = [587.33, 739.99, 880, 1046.5, 880, 739.99, 659.25];
    let acc = new Float64Array(0);
    for (const f of notes) {
      const bell = fmBell(f, 0.55, 0.26, 0.95);
      acc = concatWithGap(acc, bell, 0.06);
    }
    return acc;
  })(),

  deal_complete: mix(ePiano(392, 0.55, 0.34), ePiano(493.88, 0.6, 0.28)),
  deal_complete_south: mix(ePiano(440, 0.55, 0.36), ePiano(554.37, 0.6, 0.3), fmBell(659.25, 0.7, 0.22, 0.8)),

  /* Улёт в Σ — «аэропорт»: до–соль–ми–до вниз (короче под collapse ~0.75s) */
  deal_results_fly: (() => {
    const notes = [523.25, 392.0, 329.63, 261.63]; /* C5 G4 E4 C4 */
    let acc = new Float64Array(0);
    for (const f of notes) {
      acc = concatWithGap(acc, fmBell(f, 0.32, 0.22, 0.9), 0.05);
    }
    return acc;
  })(),

  ui_tap: fmBell(987.77, 0.22, 0.32, 0.75),

  game_win: mix(
    fmBell(523.25, 0.55, 0.3, 1),
    fmBell(659.25, 0.6, 0.28, 0.95),
    fmBell(783.99, 0.7, 0.26, 0.9),
    fmBell(1046.5, 0.85, 0.24, 0.85),
  ),
  game_lose: mix(ePiano(392, 0.55, 0.32), ePiano(311.13, 0.7, 0.28), ePiano(246.94, 0.9, 0.24)),
};

for (const [name, samples] of Object.entries(files)) {
  const path = join(OUT, `${name}.wav`);
  writeWav(path, samples);
  console.log('wrote', path, `(${(samples.length / SR).toFixed(2)}s)`);
}

console.log('OK →', OUT);
