import { LAB_SAMPLE_RATE, type LabInstrumentId, type LabVoiceParams } from './types';

function clamp(n: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, n));
}

function env(t: number, attack: number, decay: number, sustain: number, release: number, dur: number): number {
  if (t < 0) return 0;
  if (t < attack) return attack <= 0 ? 1 : t / attack;
  if (t < attack + decay) {
    const u = (t - attack) / Math.max(1e-6, decay);
    return 1 - u * (1 - sustain);
  }
  if (t < dur - release) return sustain;
  if (t < dur) return sustain * (1 - (t - (dur - release)) / Math.max(1e-6, release));
  return 0;
}

/** Чтобы атака/релиз не съедали короткую «Длительность». */
function fitAdsr(dur: number, attack: number, release: number): { atk: number; rel: number } {
  const d = Math.max(0.05, dur);
  let atk = Math.max(0.001, attack);
  let rel = Math.max(0.02, release);
  const maxSum = d * 0.8;
  if (atk + rel > maxSum) {
    const s = maxSum / Math.max(1e-6, atk + rel);
    atk *= s;
    rel *= s;
  }
  return { atk, rel };
}

/** Эталон, на котором крутились исходные exp(-t * rate). */
const DECAY_REF_DUR = 0.55;

/** Затухание обертонов следует слайдеру длительности (при 0.55 с — как раньше). */
function decayForDur(t: number, dur: number, rateAtRef: number): number {
  const rate = rateAtRef * (DECAY_REF_DUR / Math.max(0.08, dur));
  return Math.exp(-t * rate);
}

export function midiToHz(midi: number, detuneCents = 0): number {
  return 440 * Math.pow(2, (midi - 69 + detuneCents / 100) / 12);
}

function softClip(x: number): number {
  return Math.tanh(x * 1.15);
}

function renderBell(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const amp = p.volume * 0.42;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.004, p.attack), Math.max(0.1, p.release));
  const decay = Math.min(0.22, dur * 0.32);
  const modIdx = 0.35 + depth * 0.9 + bright * 0.35;
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, decay, 0.28 + depth * 0.14, rel, dur) * amp;
    const mod =
      Math.sin(2 * Math.PI * freq * 2.0 * t) * modIdx * decayForDur(t, dur, 2.2 + (1 - depth));
    const fund = Math.sin(2 * Math.PI * freq * t + mod * 0.35);
    const h2 = (0.18 + bright * 0.12) * Math.sin(2 * Math.PI * freq * 2.005 * t) * decayForDur(t, dur, 2.4);
    const h3 = (0.06 + bright * 0.08) * Math.sin(2 * Math.PI * freq * 2.99 * t) * decayForDur(t, dur, 3.5);
    const air = 0.04 * bright * Math.sin(2 * Math.PI * freq * 4.1 * t) * decayForDur(t, dur, 8);
    out[i] = softClip((fund + h2 + h3 + air) * a);
  }
  return out;
}

/**
 * Hang / handpan: мягкая камера, медленное биение, тёмный хвост.
 * Без высоких негармоник — они звучали как кастрюли.
 */
function renderEPiano(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const amp = p.volume * 0.36;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.012, p.attack), Math.max(0.18, p.release));
  const f0 = Math.max(38, freq);
  const cavity = Math.max(30, f0 * 0.5);
  const fifth = f0 * 1.498;
  const oct = f0 * 1.997;
  const beatHz = 0.22 + depth * 0.38;
  const cutoff = 480 + bright * 1320 + depth * 140;
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / LAB_SAMPLE_RATE;
  const lpK = dt / (rc + dt);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.62 + depth * 0.28, dur * 0.4), 0.46, rel, dur) * amp;
    const dingFade = decayForDur(t, dur, 0.28 + (1 - depth) * 0.22);
    const ding =
      dingFade *
      (Math.sin(2 * Math.PI * f0 * t) + 0.78 * Math.sin(2 * Math.PI * (f0 + beatHz) * t));
    const body = (0.38 + depth * 0.34) * Math.sin(2 * Math.PI * cavity * t) * decayForDur(t, dur, 0.48);
    const shoulder = (0.08 + depth * 0.05) * Math.sin(2 * Math.PI * fifth * t) * decayForDur(t, dur, 1.05);
    const air = (0.04 + bright * 0.06) * Math.sin(2 * Math.PI * oct * t) * decayForDur(t, dur, 1.85);
    const mist = bright * 0.018 * Math.sin(2 * Math.PI * f0 * 2.99 * t) * decayForDur(t, dur, 4.8);
    const breathe = 1 + depth * 0.07 * Math.sin(2 * Math.PI * 0.28 * t);
    const raw = (ding * 0.48 + body + shoulder + air + mist) * a * breathe;
    lp += lpK * (raw - lp);
    out[i] = Math.tanh(lp * 0.9);
  }
  return out;
}

function renderPiano(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const amp = p.volume * 0.42;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.001, p.attack * 0.6), Math.max(0.08, p.release));
  const harms = [
    { mul: 1, g: 1 },
    { mul: 2.003, g: 0.42 + bright * 0.28 },
    { mul: 3.01, g: 0.22 + bright * 0.18 },
    { mul: 4.02, g: 0.1 + bright * 0.12 },
    { mul: 5.04, g: 0.05 + bright * 0.08 },
    { mul: 6.08, g: 0.03 * bright },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.25 + depth * 0.15, dur * 0.35), 0.18, rel, dur) * amp;
    let s = 0;
    for (const h of harms) {
      const inharm = 1 + (h.mul - 1) * 0.0008 * (1.2 - depth);
      s += h.g * Math.sin(2 * Math.PI * freq * h.mul * inharm * t) * decayForDur(t, dur, 1.8 + h.mul * (1.1 - bright));
    }
    const hammer =
      (0.12 + bright * 0.1) *
      Math.sin(2 * Math.PI * (freq * 18 + i * 0.37) * t) *
      Math.exp(-t * 90);
    out[i] = softClip((s + hammer) * a);
  }
  return out;
}

/** Тёплый щипок (нейлон): аддитив с быстрым затуханием верхов — не клавесин. */
function renderGuitar(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const amp = p.volume * 0.5;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.002, p.attack), Math.max(0.08, p.release));
  const harms = [
    { mul: 1, g: 1 },
    { mul: 2, g: 0.45 + bright * 0.2 },
    { mul: 3, g: 0.18 + bright * 0.12 },
    { mul: 4, g: 0.08 + bright * 0.08 },
    { mul: 5, g: 0.03 * bright },
  ];
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.08, dur * 0.25), 0.35 + depth * 0.15, rel, dur) * amp;
    let s = 0;
    for (const h of harms) {
      const damp = 2.2 + h.mul * (2.8 - bright * 1.2);
      s += h.g * Math.sin(2 * Math.PI * freq * h.mul * t) * decayForDur(t, dur, damp);
    }
    const pluck = (0.1 + bright * 0.06) * Math.sin(2 * Math.PI * freq * 6 * t) * Math.exp(-t * 40);
    const body = depth * 0.14 * Math.sin(2 * Math.PI * freq * 0.5 * t) * Math.exp(-t * 3.5);
    out[i] = softClip((s + pluck + body) * a);
  }
  return out;
}

function renderBass(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const amp = p.volume * 0.7;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.002, p.attack), Math.max(0.05, p.release));
  const f0 = Math.max(28, freq);
  const subHz = Math.max(28, f0 * 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.06 + depth * 0.05, dur * 0.3), 0.28, rel, dur) * amp;
    const body = Math.sin(2 * Math.PI * f0 * t);
    const sub = depth * 0.65 * Math.sin(2 * Math.PI * subHz * t);
    const mid = (0.25 + bright * 0.35) * Math.sin(2 * Math.PI * f0 * 2 * t) * decayForDur(t, dur, 4 + (1 - bright) * 4);
    const punch = (0.18 + bright * 0.12) * Math.sin(2 * Math.PI * f0 * 3 * t) * decayForDur(t, dur, 28);
    out[i] = softClip((body + sub + mid + punch) * a);
  }
  return out;
}

/**
 * Мягкий электронный бас: чистый суб, без fuzz/delay/reese.
 * depth = упругость (pitch drop + короче атака), brightness = открытость мягкого LPF.
 * Высота — настоящая MIDI-нота (раньше clamp 220 Hz делал все ноты выше A3 одинаковыми).
 */
function renderEBass(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const bounce = clamp(p.depth, 0, 1);
  const amp = p.volume * 0.5;
  const dur = p.duration;
  const atkIn = Math.max(0.004, p.attack * (1.15 - bounce * 0.55));
  const { atk, rel } = fitAdsr(dur, atkIn, Math.max(0.12, p.release * 1.1));
  const f0 = Math.max(28, freq);
  const subHz = Math.max(28, f0 * 0.5);
  /* Чуть шире LPF на высоких нотах — меньше грязи при полифонии */
  const cutoff = 150 + bright * 640 + bounce * 70 + Math.min(320, f0 * 0.28);
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / LAB_SAMPLE_RATE;
  const lpK = dt / (rc + dt);
  let lp = 0;
  let phase = 0;
  /* Sustain чуть ниже — длинные ноты не забивают шину при наложении */
  const sustain = 0.4 + bounce * 0.1;
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.14 + bounce * 0.08, dur * 0.35), sustain, rel, dur) * amp;
    const dropMs = 0.035 + bounce * 0.055;
    const dropAmt = bounce * 0.085;
    const fInst = f0 * (1 + dropAmt * Math.exp(-t / Math.max(0.012, dropMs)));
    phase += (2 * Math.PI * fInst) / LAB_SAMPLE_RATE;
    const fund = Math.sin(phase);
    const sub = (0.38 + bounce * 0.2) * Math.sin(2 * Math.PI * subHz * t);
    const tri =
      (0.1 + bright * 0.09) *
      (2 * Math.abs(2 * ((f0 * t) % 1) - 1) - 1) *
      decayForDur(t, dur, 2.8);
    const warm = (0.05 + bright * 0.045) * Math.sin(2 * Math.PI * f0 * 1.5 * t) * decayForDur(t, dur, 5.5);
    const raw = (fund * 0.72 + sub + tri * 0.2 + warm) * a;
    lp += lpK * (raw - lp);
    out[i] = Math.tanh(lp * 0.88);
  }
  return out;
}

const RENDERERS: Record<LabInstrumentId, (freq: number, p: LabVoiceParams, n: number) => Float32Array> = {
  bell: renderBell,
  epiano: renderEPiano,
  piano: renderPiano,
  guitar: renderGuitar,
  bass: renderBass,
  ebass: renderEBass,
};

/** Однополюсный lowpass: filter 1 ≈ прозрачно, 0 — только низ. */
function applyToneFilter(samples: Float32Array, amount: number): Float32Array {
  const a = clamp(amount, 0, 1);
  if (a >= 0.995) return samples;
  const cutoff = 180 + a * a * 16000;
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / LAB_SAMPLE_RATE;
  const k = dt / (rc + dt);
  const out = new Float32Array(samples.length);
  let lp = 0;
  for (let i = 0; i < samples.length; i++) {
    lp += k * (samples[i]! - lp);
    out[i] = lp;
  }
  return out;
}

/** Офлайн-рендер одной ноты (то же услышите и в WAV). */
export function renderNoteSamples(midi: number, voice: LabVoiceParams): Float32Array {
  const dur = clamp(Number.isFinite(voice.duration) ? voice.duration : 0.55, 0.04, 6);
  const n = Math.max(1, Math.floor(LAB_SAMPLE_RATE * dur));
  const detune = Number.isFinite(voice.detuneCents) ? voice.detuneCents : 0;
  const hz = midiToHz(midi, detune);
  const safe: LabVoiceParams = {
    ...voice,
    duration: dur,
    attack: Number.isFinite(voice.attack) ? voice.attack : 0.008,
    release: Number.isFinite(voice.release) ? voice.release : 0.35,
    brightness: Number.isFinite(voice.brightness) ? voice.brightness : 0.7,
    depth: Number.isFinite(voice.depth) ? voice.depth : 0.55,
    volume: Number.isFinite(voice.volume) ? voice.volume : 0.7,
    detuneCents: detune,
    filter: Number.isFinite(voice.filter) ? voice.filter : 1,
    octave: Number.isFinite(voice.octave) ? voice.octave : 0,
  };
  const raw = RENDERERS[safe.instrument](hz, safe, n);
  return applyToneFilter(raw, safe.filter);
}

/** Свести фразу в один буфер. */
export function renderPhraseSamples(
  phrase: { midi: number; at: number; dur?: number }[],
  voice: LabVoiceParams,
): Float32Array {
  if (phrase.length === 0) return new Float32Array(0);
  let end = 0;
  for (const note of phrase) {
    const dur = Math.max(0.04, note.dur ?? voice.duration);
    end = Math.max(end, note.at + dur + 0.02);
  }
  const n = Math.max(1, Math.floor(LAB_SAMPLE_RATE * end));
  const out = new Float32Array(n);
  for (const note of phrase) {
    const dur = Math.max(0.04, note.dur ?? voice.duration);
    const samples = renderNoteSamples(note.midi, { ...voice, duration: dur });
    const offset = Math.floor(note.at * LAB_SAMPLE_RATE);
    for (let i = 0; i < samples.length; i++) {
      const j = offset + i;
      if (j >= 0 && j < n) out[j]! += samples[i]!;
    }
  }
  /* Только антиклип: не поднимать пик до 0.92 — иначе громкость слайдера пропадает. */
  let peak = 1e-9;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(out[i]!));
  if (peak > 0.92) {
    const g = 0.92 / peak;
    for (let i = 0; i < n; i++) out[i]! *= g;
  }
  return out;
}

/** Аккорд: все ноты в один момент (пик нормализуется). */
export function renderChordSamples(midis: number[], voice: LabVoiceParams): Float32Array {
  const unique = [...new Set(midis)].slice(0, 8);
  if (unique.length === 0) return new Float32Array(0);
  return renderPhraseSamples(
    unique.map((midi) => ({ midi, at: 0 })),
    voice,
  );
}
