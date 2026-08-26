/**
 * Процедурные SFX v1 — мягче и «дороже», без дешёвых square-писков.
 * Позже заменяются файлами по тому же SoundId.
 */
import type { SoundId } from './types';

type Ctx = AudioContext;

function connectOut(node: AudioNode, dest: AudioNode): void {
  node.connect(dest);
}

/** Мягкая огибающая (не экспонента в 0 — клики). */
function ampEnv(
  ctx: Ctx,
  t0: number,
  peak: number,
  attack: number,
  hold: number,
  release: number,
): GainNode {
  const g = ctx.createGain();
  const p = Math.max(0.0008, peak);
  g.gain.setValueAtTime(0.0008, t0);
  g.gain.linearRampToValueAtTime(p, t0 + attack);
  g.gain.setValueAtTime(p, t0 + attack + hold);
  g.gain.linearRampToValueAtTime(0.0008, t0 + attack + hold + release);
  return g;
}

function softTone(
  ctx: Ctx,
  dest: AudioNode,
  freq: number,
  t0: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
  detune = 0,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  const attack = Math.min(0.04, dur * 0.2);
  const release = Math.max(0.08, dur * 0.55);
  const hold = Math.max(0, dur - attack - release);
  const g = ampEnv(ctx, t0, peak, attack, hold, release);
  const filt = ctx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.frequency.setValueAtTime(Math.min(4200, freq * 4.5), t0);
  filt.Q.value = 0.6;
  osc.connect(filt);
  filt.connect(g);
  connectOut(g, dest);
  osc.start(t0);
  osc.stop(t0 + dur + 0.08);
}

/** Колокольчик: несущая + тихая квинта. */
function softBell(ctx: Ctx, dest: AudioNode, freq: number, t0: number, dur: number, peak: number): void {
  softTone(ctx, dest, freq, t0, dur, peak * 0.85, 'sine');
  softTone(ctx, dest, freq * 2.01, t0, dur * 0.7, peak * 0.22, 'sine');
  softTone(ctx, dest, freq * 3.01, t0, dur * 0.4, peak * 0.08, 'triangle', 3);
}

function softNoise(
  ctx: Ctx,
  dest: AudioNode,
  t0: number,
  dur: number,
  peak: number,
  centerHz: number,
  q = 1.2,
): void {
  const n = Math.max(1, Math.floor(ctx.sampleRate * dur));
  const buf = ctx.createBuffer(1, n, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < n; i++) {
    const fade = 1 - i / n;
    data[i] = (Math.random() * 2 - 1) * fade;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const filt = ctx.createBiquadFilter();
  filt.type = 'bandpass';
  filt.frequency.value = centerHz;
  filt.Q.value = q;
  const g = ampEnv(ctx, t0, peak, 0.008, dur * 0.15, dur * 0.75);
  src.connect(filt);
  filt.connect(g);
  connectOut(g, dest);
  src.start(t0);
  src.stop(t0 + dur + 0.04);
}

export function playSynthSound(ctx: Ctx, dest: AudioNode, id: SoundId, when = 0): void {
  const t0 = ctx.currentTime + when;

  switch (id) {
    case 'ui_tap':
      softBell(ctx, dest, 920, t0, 0.16, 0.28);
      break;
    case 'illegal':
      softNoise(ctx, dest, t0, 0.1, 0.22, 420, 0.8);
      softTone(ctx, dest, 165, t0, 0.18, 0.2, 'triangle');
      softTone(ctx, dest, 138, t0 + 0.06, 0.2, 0.14, 'sine');
      break;
    case 'card_play':
      softTone(ctx, dest, 180, t0, 0.1, 0.34, 'sine');
      softTone(ctx, dest, 270, t0, 0.11, 0.28, 'triangle');
      softTone(ctx, dest, 360, t0, 0.09, 0.16, 'sine');
      softTone(ctx, dest, 720, t0, 0.04, 0.1, 'sine');
      break;
    case 'trick_won':
      softBell(ctx, dest, 523.25, t0, 0.28, 0.26);
      softBell(ctx, dest, 659.25, t0 + 0.09, 0.32, 0.2);
      break;
    case 'bid_place':
      softBell(ctx, dest, 440, t0, 0.22, 0.22);
      softBell(ctx, dest, 554.37, t0 + 0.08, 0.24, 0.16);
      break;
    case 'exact_south':
      softBell(ctx, dest, 523.25, t0, 0.35, 0.3);
      softBell(ctx, dest, 659.25, t0 + 0.1, 0.38, 0.26);
      softBell(ctx, dest, 783.99, t0 + 0.22, 0.45, 0.22);
      break;
    case 'exact_other':
      softBell(ctx, dest, 523.25, t0, 0.28, 0.14);
      softBell(ctx, dest, 659.25, t0 + 0.1, 0.3, 0.1);
      break;
    case 'over_south':
      softTone(ctx, dest, 349.23, t0, 0.28, 0.2, 'triangle');
      softTone(ctx, dest, 293.66, t0 + 0.12, 0.35, 0.16, 'sine');
      softNoise(ctx, dest, t0 + 0.05, 0.12, 0.08, 600, 0.7);
      break;
    case 'over_other':
      softTone(ctx, dest, 311.13, t0, 0.24, 0.09, 'triangle');
      break;
    case 'under_south':
      softTone(ctx, dest, 196, t0, 0.4, 0.16, 'sine');
      softTone(ctx, dest, 164.81, t0 + 0.14, 0.45, 0.12, 'sine');
      break;
    case 'under_other':
      softTone(ctx, dest, 185, t0, 0.32, 0.07, 'sine');
      break;
    case 'your_turn_soft':
      softBell(ctx, dest, 659.25, t0, 0.28, 0.2);
      softBell(ctx, dest, 830.61, t0 + 0.1, 0.3, 0.18);
      softBell(ctx, dest, 987.77, t0 + 0.2, 0.36, 0.14);
      break;
    case 'your_turn_nudge_long': {
      const notes = [587.33, 739.99, 880, 1046.5, 880, 739.99, 659.25];
      notes.forEach((f, i) => softBell(ctx, dest, f, t0 + i * 0.48, 0.5, 0.14));
      break;
    }
    case 'your_turn_nudge_short':
      softBell(ctx, dest, 739.99, t0, 0.26, 0.18);
      softBell(ctx, dest, 932.33, t0 + 0.1, 0.28, 0.15);
      softBell(ctx, dest, 1108.73, t0 + 0.2, 0.3, 0.12);
      break;
    case 'deal_complete':
      softBell(ctx, dest, 392, t0, 0.32, 0.2);
      softBell(ctx, dest, 493.88, t0 + 0.14, 0.38, 0.16);
      break;
    case 'deal_complete_south':
      softBell(ctx, dest, 440, t0, 0.3, 0.24);
      softBell(ctx, dest, 554.37, t0 + 0.12, 0.36, 0.2);
      softBell(ctx, dest, 659.25, t0 + 0.26, 0.42, 0.16);
      break;
    case 'deal_results_fly':
      softBell(ctx, dest, 523.25, t0, 0.32, 0.18);
      softBell(ctx, dest, 392.0, t0 + 0.18, 0.34, 0.17);
      softBell(ctx, dest, 329.63, t0 + 0.36, 0.36, 0.16);
      softBell(ctx, dest, 261.63, t0 + 0.54, 0.4, 0.15);
      break;
    case 'game_win':
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => softBell(ctx, dest, f, t0 + i * 0.14, 0.4, 0.22));
      break;
    case 'game_lose':
      softTone(ctx, dest, 392, t0, 0.35, 0.18, 'triangle');
      softTone(ctx, dest, 311.13, t0 + 0.2, 0.4, 0.15, 'sine');
      softTone(ctx, dest, 246.94, t0 + 0.42, 0.55, 0.12, 'sine');
      break;
    default:
      break;
  }
}
