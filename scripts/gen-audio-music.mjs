/**
 * Брейкбит / IDM-петля для канала «Музыка».
 * Запуск: node scripts/gen-audio-music.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'public', 'audio', 'music');
const SR = 44100;
const BPM = 168;
const BEAT = 60 / BPM;
const BARS = 4;
const STEPS = BARS * 16;
const STEP = BEAT / 4;
const DUR = BARS * 4 * BEAT;
const N = Math.floor(SR * DUR);

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

function at(out, t0, dur, fn) {
  const i0 = Math.max(0, Math.floor(t0 * SR));
  const i1 = Math.min(out.length, Math.floor((t0 + dur) * SR));
  for (let i = i0; i < i1; i++) {
    const t = i / SR - t0;
    out[i] += fn(t);
  }
}

function noise() {
  return Math.random() * 2 - 1;
}

/** Лёгкий свинг у нечётных 16-х. */
function stepTime(step) {
  const swing = 0.16;
  return step * STEP + (step % 2 === 1 ? STEP * swing : 0);
}

function addKick(out, t0) {
  at(out, t0, 0.22, (t) => {
    const f = 128 * Math.exp(-t * 26) + 36;
    const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 14);
    const click = Math.sin(2 * Math.PI * 2100 * t) * Math.exp(-t * 90) * 0.18;
    return (body * 0.95 + click) * 0.72;
  });
}

function addSnare(out, t0, amp = 1) {
  at(out, t0, 0.16, (t) => {
    const tone = Math.sin(2 * Math.PI * 198 * t) * Math.exp(-t * 18);
    const n = noise() * Math.exp(-t * 22);
    return (tone * 0.42 + n * 0.7) * 0.55 * amp;
  });
}

function addGhost(out, t0) {
  addSnare(out, t0, 0.28);
}

function addHat(out, t0, open = false) {
  const dur = open ? 0.14 : 0.038;
  at(out, t0, dur, (t) => {
    const n = noise() * Math.exp(-t * (open ? 14 : 55));
    const metal = Math.sin(2 * Math.PI * 7400 * t) * Math.exp(-t * 40) * 0.12;
    return (n * 0.32 + metal) * (open ? 0.22 : 0.16);
  });
}

function addRim(out, t0) {
  at(out, t0, 0.05, (t) => {
    return Math.sin(2 * Math.PI * 880 * t) * Math.exp(-t * 48) * 0.16;
  });
}

function addReese(out, t0, dur, freq) {
  at(out, t0, dur, (t) => {
    const a = Math.min(1, t / 0.02) * Math.exp(-t * 2.2);
    const s1 = Math.sign(Math.sin(2 * Math.PI * freq * t));
    const s2 = Math.sign(Math.sin(2 * Math.PI * (freq * 1.013) * t + 0.4));
    const lp = (s1 * 0.55 + s2 * 0.45) * (0.45 + 0.55 * Math.exp(-t * 6));
    return lp * a * 0.14;
  });
}

function addBlip(out, t0, freq) {
  at(out, t0, 0.22, (t) => {
    const mod = Math.sin(2 * Math.PI * freq * 3.2 * t) * Math.exp(-t * 8) * 2.4;
    const car = Math.sin(2 * Math.PI * freq * t + mod);
    return car * Math.exp(-t * 7) * 0.08;
  });
}

function addGlitch(out, t0) {
  for (let k = 0; k < 6; k++) {
    addSnare(out, t0 + k * (STEP / 3), 0.55 - k * 0.06);
  }
}

const out = new Float64Array(N);

/* Amen-ish 4 такта + IDM-сбой в 3-м и half-time в 4-м */
const kicks = [0, 6, 10, 16, 22, 26, 32, 40, 48, 56];
const snares = [4, 12, 20, 28, 30, 44, 52, 60];
const ghosts = [7, 14, 23, 27, 46, 61];
const rims = [2, 18, 34, 50];
const opens = [14, 30, 46, 58];

for (const s of kicks) addKick(out, stepTime(s));
for (const s of snares) addSnare(out, stepTime(s));
for (const s of ghosts) addGhost(out, stepTime(s));
for (const s of rims) addRim(out, stepTime(s));
for (const s of opens) addHat(out, stepTime(s), true);

for (let s = 0; s < STEPS; s++) {
  if (s % 2 === 0 && !snares.includes(s) && !kicks.includes(s)) addHat(out, stepTime(s), false);
  if (s % 4 === 1 && s < 48) addHat(out, stepTime(s), false);
}

addGlitch(out, stepTime(32));

for (const s of [0, 8, 16, 24, 40, 48, 56]) {
  addReese(out, stepTime(s), STEP * 3.2, s >= 48 ? 41.2 : 55);
}

addBlip(out, stepTime(18), 784);
addBlip(out, stepTime(42), 622);
addBlip(out, stepTime(58), 932);

/* Редкие щелчки «ленты» */
for (let i = 0; i < N; i++) {
  if (Math.random() < 0.0009) out[i] += (Math.random() * 2 - 1) * 0.012;
}

let peak = 1e-6;
for (let i = 0; i < N; i++) peak = Math.max(peak, Math.abs(out[i]));
const norm = 0.78 / peak;
for (let i = 0; i < N; i++) out[i] *= norm;

/* Бесшовная петля: короткий кроссфейд хвоста в начало */
const fade = Math.min(512, Math.floor(SR * 0.008));
for (let i = 0; i < fade; i++) {
  const a = i / fade;
  out[i] = out[i] * a + out[N - fade + i] * (1 - a);
}
for (let i = 0; i < fade; i++) out[N - fade + i] *= i / fade;

mkdirSync(OUT_DIR, { recursive: true });
writeWav(join(OUT_DIR, 'table_bed.wav'), out);
writeFileSync(
  join(OUT_DIR, 'README.md'),
  '# Music v1\n\n`table_bed.wav` — процедурная брейкбит/IDM-петля (168 BPM, 4 такта).\nПересборка: `npm run audio:gen-music`\n',
);
console.log('wrote', join(OUT_DIR, 'table_bed.wav'), `${DUR.toFixed(2)}s`);
