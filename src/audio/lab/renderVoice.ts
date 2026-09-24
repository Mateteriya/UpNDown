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

function renderPiano(freq: number, p: LabVoiceParams, n: number, live = false): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const presence = clamp(p.presence, 0, 1);
  const amp = p.volume * 0.36;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.0006, p.attack * 0.45), Math.max(0.14, p.release));
  /* Инерция струн: сильнее на басу */
  const B = 0.0001 + clamp((180 - freq) / 220, 0, 1) * 0.00055;
  /* Live: меньше обертонов — аккорд не «по очереди» из‑за CPU */
  const partials = live
    ? freq < 110
      ? 5
      : freq < 280
        ? 4
        : 4
    : freq < 90
      ? 12
      : freq < 220
        ? 10
        : freq < 500
          ? 8
          : 6;
  const sustain = 0.12 + depth * 0.14;
  const decayBase = 1.35 - depth * 0.35 + bright * 0.15;
  /* Две струны в унисон — лёгкое биение рояля (в live — одна, ради отклика) */
  const cents = live ? 0 : 0.06 + depth * 0.1;
  const fA = freq * Math.pow(2, cents / 1200);
  const fB = live ? fA : freq * Math.pow(2, -cents / 1200);
  const unison = !live;
  /* Предрасчёт частичных — меньше Math в горячем цикле */
  const gArr = new Float32Array(partials);
  const dampArr = new Float32Array(partials);
  const fkA = new Float32Array(partials);
  const fkB = new Float32Array(partials);
  const keyTilt = freq < 150 ? 1.35 : freq > 800 ? 0.72 : 1;
  for (let k = 1; k <= partials; k++) {
    const stretch = Math.sqrt(1 + B * k * k);
    fkA[k - 1] = fA * k * stretch;
    fkB[k - 1] = fB * k * stretch;
    gArr[k - 1] =
      (1 / Math.pow(k, 0.95 + (1 - bright) * 0.45)) *
      Math.exp(-((k - 1) * (0.08 + (1 - bright) * 0.12)) * keyTilt);
    dampArr[k - 1] = decayBase + k * (0.55 + (1 - bright) * 0.85) - depth * 0.15;
  }
  let hammerLp = 0;
  const hammerCut = 2200 + presence * 5200 + bright * 2400;
  const hRc = 1 / (2 * Math.PI * hammerCut);
  const dt = 1 / LAB_SAMPLE_RATE;
  const hK = dt / (hRc + dt);
  const boardF = Math.max(48, freq * 0.5);
  const board2F = Math.max(70, freq * 1.5);
  /* Чуть больше дека / симпатия — без лишних sin в цикле частичных */
  const boardAmt = depth * (live ? 0.1 : 0.125);
  const board2Amt = depth * (live ? 0.04 : 0.05);
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.32 + depth * 0.22, dur * 0.42), sustain, rel, dur) * amp;
    let s = 0;
    for (let k = 0; k < partials; k++) {
      const envK = decayForDur(t, dur, dampArr[k]!);
      const aSin = Math.sin(2 * Math.PI * fkA[k]! * t);
      s +=
        gArr[k]! *
        envK *
        (unison ? 0.5 * (aSin + Math.sin(2 * Math.PI * fkB[k]! * t)) : aSin);
    }
    /* Молоток: короткий шумовой щелчок через LPF */
    const noise = ((i * 1103515245 + 12345) >>> 16) / 32768 - 1;
    const hammerEnv = Math.exp(-t * (55 + (1 - presence) * 70)) * (0.13 + presence * 0.26 + bright * 0.1);
    hammerLp += hK * (noise * hammerEnv - hammerLp);
    const board = boardAmt * Math.sin(2 * Math.PI * boardF * t) * decayForDur(t, dur, 0.85);
    const board2 = board2Amt * Math.sin(2 * Math.PI * board2F * t) * decayForDur(t, dur, 2.2);
    out[i] = softClip((s * (0.92 + presence * 0.08) + hammerLp + board + board2) * a);
  }
  return out;
}

/** Rhodes: tine + колоколообразный обертон, мягкий LPF. */
function renderRhodes(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const presence = clamp(p.presence, 0, 1);
  const amp = p.volume * 0.4;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.002, p.attack), Math.max(0.16, p.release));
  const f0 = Math.max(40, freq);
  const tremHz = 4.2 + depth * 2.8;
  const tremAmt = 0.04 + depth * 0.14;
  const cutoff = 900 + bright * 2800 + presence * 900;
  const rc = 1 / (2 * Math.PI * cutoff);
  const dt = 1 / LAB_SAMPLE_RATE;
  const lpK = dt / (rc + dt);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.28 + depth * 0.2, dur * 0.4), 0.32 + depth * 0.12, rel, dur) * amp;
    const trem = 1 + tremAmt * Math.sin(2 * Math.PI * tremHz * t);
    const tine = Math.sin(2 * Math.PI * f0 * t);
    const bell = (0.35 + bright * 0.35) * Math.sin(2 * Math.PI * f0 * 2.0 * t) * decayForDur(t, dur, 2.1);
    const air = (0.08 + presence * 0.12) * Math.sin(2 * Math.PI * f0 * 3.01 * t) * decayForDur(t, dur, 4.5);
    const bark = (0.06 + presence * 0.1) * Math.sin(2 * Math.PI * f0 * 7.2 * t) * Math.exp(-t * 28);
    const raw = (tine * 0.7 + bell + air + bark) * a * trem;
    lp += lpK * (raw - lp);
    out[i] = Math.tanh(lp * 0.95);
  }
  return out;
}

/** Wurlitzer: reed, носовитость, мягкий овердрайв на атаке. */
function renderWurli(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const presence = clamp(p.presence, 0, 1);
  const amp = p.volume * 0.38;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.0015, p.attack * 0.8), Math.max(0.12, p.release));
  const f0 = Math.max(45, freq);
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.18 + depth * 0.12, dur * 0.35), 0.22 + depth * 0.1, rel, dur) * amp;
    const fund = Math.sin(2 * Math.PI * f0 * t);
    const reed =
      (0.42 + bright * 0.28) *
      Math.sin(2 * Math.PI * f0 * 2.0 * t + 0.4 * Math.sin(2 * Math.PI * f0 * t)) *
      decayForDur(t, dur, 2.4);
    const nasal = (0.18 + presence * 0.2) * Math.sin(2 * Math.PI * f0 * 3.0 * t) * decayForDur(t, dur, 3.6);
    const click = (0.1 + presence * 0.16) * Math.sin(2 * Math.PI * f0 * 9.5 * t) * Math.exp(-t * 42);
    const body = depth * 0.12 * Math.sin(2 * Math.PI * f0 * 0.5 * t) * decayForDur(t, dur, 1.1);
    const raw = (fund * 0.55 + reed + nasal + click + body) * a;
    /* Лёгкий овердрайв — характер Wurli */
    out[i] = Math.tanh(raw * (1.15 + bright * 0.35));
  }
  return out;
}

/** Clavinet: яркий щипок, короче сустейн, богатые нечётные. */
function renderClav(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const presence = clamp(p.presence, 0, 1);
  const amp = p.volume * 0.4;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.0008, p.attack * 0.5), Math.max(0.06, p.release * 0.85));
  const f0 = Math.max(50, freq);
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.08 + depth * 0.06, dur * 0.22), 0.08 + depth * 0.08, rel, dur) * amp;
    let s = 0;
    const odds = [1, 3, 5, 7, 9, 11];
    for (const k of odds) {
      const g = (1 / Math.pow(k, 0.7)) * (k === 1 ? 1 : 0.35 + bright * 0.45);
      s += g * Math.sin(2 * Math.PI * f0 * k * t) * decayForDur(t, dur, 2.2 + k * (1.4 - bright * 0.6));
    }
    const pick = (0.16 + presence * 0.28) * Math.sin(2 * Math.PI * f0 * 14 * t) * Math.exp(-t * (38 + presence * 20));
    const twang = (0.08 + bright * 0.1) * Math.sin(2 * Math.PI * f0 * 2.01 * t) * decayForDur(t, dur, 5);
    out[i] = softClip((s * 0.75 + pick + twang) * a);
  }
  return out;
}

/** Тёплый щипок (нейлон): форматны корпуса + быстрый спад верхов. */
function renderGuitar(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const presence = clamp(p.presence, 0, 1);
  const amp = p.volume * 0.46;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.0015, p.attack), Math.max(0.1, p.release));
  const f0 = Math.max(55, freq);
  const form1 = 280;
  const form2 = 650 + bright * 200;
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.1 + depth * 0.06, dur * 0.28), 0.28 + depth * 0.18, rel, dur) * amp;
    let s = 0;
    const harms = [
      { mul: 1, g: 1 },
      { mul: 2, g: 0.48 + bright * 0.22 },
      { mul: 3, g: 0.2 + bright * 0.14 },
      { mul: 4, g: 0.09 + bright * 0.1 },
      { mul: 5, g: 0.04 + bright * 0.06 },
      { mul: 6, g: 0.02 * bright },
    ];
    for (const h of harms) {
      const damp = 1.9 + h.mul * (2.4 - bright * 1.1) - depth * 0.2;
      s += h.g * Math.sin(2 * Math.PI * f0 * h.mul * t) * decayForDur(t, dur, damp);
    }
    const pluck =
      (0.12 + presence * 0.14 + bright * 0.06) *
      Math.sin(2 * Math.PI * f0 * 8.5 * t) *
      Math.exp(-t * (32 + (1 - presence) * 18));
    const body =
      depth * 0.16 * Math.sin(2 * Math.PI * form1 * t) * decayForDur(t, dur, 1.4) +
      depth * 0.07 * Math.sin(2 * Math.PI * form2 * t) * decayForDur(t, dur, 2.6);
    out[i] = softClip((s + pluck + body) * a);
  }
  return out;
}

function renderBass(freq: number, p: LabVoiceParams, n: number): Float32Array {
  const out = new Float32Array(n);
  const bright = clamp(p.brightness, 0, 1);
  const depth = clamp(p.depth, 0, 1);
  const presence = clamp(p.presence, 0, 1);
  const amp = p.volume * 0.62;
  const dur = p.duration;
  const { atk, rel } = fitAdsr(dur, Math.max(0.002, p.attack), Math.max(0.06, p.release));
  const f0 = Math.max(28, freq);
  const subHz = Math.max(28, f0 * 0.5);
  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const a = env(t, atk, Math.min(0.07 + depth * 0.06, dur * 0.32), 0.3 + depth * 0.08, rel, dur) * amp;
    const body = Math.sin(2 * Math.PI * f0 * t);
    const sub = (0.45 + depth * 0.35) * Math.sin(2 * Math.PI * subHz * t);
    const mid =
      (0.22 + bright * 0.32) * Math.sin(2 * Math.PI * f0 * 2 * t) * decayForDur(t, dur, 3.5 + (1 - bright) * 3);
    const punch =
      (0.14 + presence * 0.16 + bright * 0.08) *
      Math.sin(2 * Math.PI * f0 * 3 * t) *
      decayForDur(t, dur, 18 + (1 - presence) * 12);
    const click = presence * 0.08 * Math.sin(2 * Math.PI * f0 * 8 * t) * Math.exp(-t * 55);
    out[i] = softClip((body * 0.7 + sub + mid + punch + click) * a);
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

const RENDERERS: Record<
  LabInstrumentId,
  (freq: number, p: LabVoiceParams, n: number, live?: boolean) => Float32Array
> = {
  bell: renderBell,
  epiano: renderEPiano,
  piano: renderPiano,
  rhodes: renderRhodes,
  wurli: renderWurli,
  clav: renderClav,
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

/**
 * Короткий «зал»: early reflections + feedback. Нужен запас длины буфера (см. renderNoteSamples),
 * иначе хвост обрезается вместе с нотой и крутилка «не работает».
 * live — облегчённый (2 отражения), чтобы аккорды не ждали рендер.
 */
function applySpace(samples: Float32Array, space: number, live = false): Float32Array {
  const wet = clamp(space, 0, 1);
  if (wet < 0.02 || samples.length < 8) return samples;
  const out = new Float32Array(samples.length);
  const d1 = Math.floor(0.023 * LAB_SAMPLE_RATE);
  const d2 = Math.floor(0.037 * LAB_SAMPLE_RATE);
  const dryKeep = 1 - wet * 0.38;
  const wetGain = 0.55 + wet * 0.7;
  if (live) {
    for (let i = 0; i < samples.length; i++) {
      const dry = samples[i]!;
      const e1 = i >= d1 ? samples[i - d1]! : 0;
      const e2 = i >= d2 ? samples[i - d2]! : 0;
      out[i] = dry * dryKeep + (e1 * 0.5 + e2 * 0.35) * wetGain;
    }
    return out;
  }
  const d3 = Math.floor(0.053 * LAB_SAMPLE_RATE);
  const d4 = Math.floor(0.079 * LAB_SAMPLE_RATE);
  const dFb = Math.floor(0.097 * LAB_SAMPLE_RATE);
  const fbAmt = 0.22 + wet * 0.38;
  let fb = 0;
  for (let i = 0; i < samples.length; i++) {
    const dry = samples[i]!;
    const e1 = i >= d1 ? samples[i - d1]! : 0;
    const e2 = i >= d2 ? samples[i - d2]! : 0;
    const e3 = i >= d3 ? samples[i - d3]! : 0;
    const e4 = i >= d4 ? samples[i - d4]! : 0;
    const delayed = i >= dFb ? out[i - dFb]! : 0;
    fb = delayed * fbAmt + dry * 0.12;
    const room = (e1 * 0.42 + e2 * 0.3 + e3 * 0.22 + e4 * 0.16 + fb * 0.65) * wetGain;
    out[i] = dry * dryKeep + room * wet;
  }
  return out;
}

/** Офлайн-рендер одной ноты (то же услышите и в WAV). live — быстрее для клавиатуры. */
export function renderNoteSamples(
  midi: number,
  voice: LabVoiceParams,
  opts?: { live?: boolean },
): Float32Array {
  const live = opts?.live === true;
  const baseDur = clamp(Number.isFinite(voice.duration) ? voice.duration : 0.55, 0.04, 6);
  const detune = Number.isFinite(voice.detuneCents) ? voice.detuneCents : 0;
  const inst = voice.instrument;
  const spaceAmt = Number.isFinite(voice.space) ? voice.space : 0.22;
  /* Хвост зала после ноты — иначе «Зал» не слышно на коротких звуках */
  const spacePad = spaceAmt > 0.02 ? 0.12 + spaceAmt * (live ? 0.22 : 0.72) : 0;
  const renderDur = baseDur;
  const totalDur = Math.min(live ? 3.2 : 8, baseDur + spacePad);
  const nBody = Math.max(1, Math.floor(LAB_SAMPLE_RATE * renderDur));
  const n = Math.max(nBody, Math.floor(LAB_SAMPLE_RATE * totalDur));
  const safe: LabVoiceParams = {
    ...voice,
    instrument: RENDERERS[inst] ? inst : 'piano',
    duration: renderDur,
    attack: Number.isFinite(voice.attack) ? voice.attack : 0.008,
    release: Number.isFinite(voice.release) ? voice.release : 0.35,
    brightness: Number.isFinite(voice.brightness) ? voice.brightness : 0.7,
    depth: Number.isFinite(voice.depth) ? voice.depth : 0.55,
    volume: clamp(Number.isFinite(voice.volume) ? voice.volume : 0.7, 0, 1),
    detuneCents: detune,
    filter: Number.isFinite(voice.filter) ? voice.filter : 1,
    presence: Number.isFinite(voice.presence) ? voice.presence : 0.48,
    space: spaceAmt,
    octave: Number.isFinite(voice.octave) ? voice.octave : 0,
  };
  const hz = midiToHz(midi, detune);
  const body = RENDERERS[safe.instrument](hz, safe, nBody, live);
  const padded =
    n === nBody
      ? body
      : (() => {
          const buf = new Float32Array(n);
          buf.set(body);
          return buf;
        })();
  const filtered = applyToneFilter(padded, safe.filter);
  return applySpace(filtered, safe.space, live);
}

/** Свести фразу в один буфер. */
export function renderPhraseSamples(
  phrase: { midi: number; at: number; dur?: number }[],
  voice: LabVoiceParams,
): Float32Array {
  if (phrase.length === 0) return new Float32Array(0);
  const spaceAmt = Number.isFinite(voice.space) ? voice.space! : 0;
  const spacePad = spaceAmt > 0.02 ? 0.12 + spaceAmt * 0.72 : 0;
  let end = 0;
  for (const note of phrase) {
    const dur = Math.max(0.04, note.dur ?? voice.duration);
    end = Math.max(end, note.at + dur + spacePad + 0.02);
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
