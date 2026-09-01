import {
  LAB_SAMPLE_RATE,
  type LabBeatParams,
  type LabMelodyLayer,
  type LabMusicPadParams,
  type LabPhraseNote,
  type LabVoiceParams,
} from './types';
import { mixBeatIntoSamples, renderBeatSamples } from './renderBeat';
import { renderPhraseSamples } from './renderVoice';

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

function softLimit(x: number): number {
  return Math.tanh(x * 0.95) * 0.98;
}

function midiToHz(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/**
 * Атмосфера: amt = громкость, tone = яркость фильтра (глухо ↔ открыто).
 * Изменения должны быть сразу слышны на всём диапазоне.
 */
function renderPadLayer(n: number, bpm: number, pad: LabMusicPadParams, rootMidi: number): Float32Array {
  const out = new Float32Array(n);
  const amt = clamp(pad.pad, 0, 1);
  if (amt < 0.01) return out;

  const tone = clamp(pad.tone, 0, 1);
  const beat = 60 / clamp(bpm, 80, 190);
  const barDur = beat * 4;
  const root = midiToHz(rootMidi);
  const chordA = [root, root * Math.pow(2, 3 / 12), root * Math.pow(2, 7 / 12), root * 2];
  const chordB = [
    root * Math.pow(2, 5 / 12),
    root * Math.pow(2, 8 / 12),
    root * Math.pow(2, 12 / 12),
    root * Math.pow(2, 17 / 12),
  ];

  for (let i = 0; i < n; i++) {
    const t = i / LAB_SAMPLE_RATE;
    const bar = Math.floor(t / barDur);
    const chord = bar % 4 < 2 ? chordA : chordB;
    let s = 0;
    for (let k = 0; k < chord.length; k++) {
      const f = chord[k]!;
      const w = k === 0 ? 0.4 : k === 1 ? 0.32 : k === 2 ? 0.24 : 0.18;
      s += Math.sin(2 * Math.PI * f * t) * w;
      /* tone поднимает обертоны */
      s += Math.sin(2 * Math.PI * f * 2 * t) * 0.14 * tone;
      s += Math.sin(2 * Math.PI * f * 3 * t) * 0.08 * tone * tone;
    }
    const breath = 0.65 + 0.35 * Math.sin(2 * Math.PI * (0.06 + tone * 0.05) * t);
    const edge = Math.min(1, t / 0.15) * Math.min(1, (n / LAB_SAMPLE_RATE - t) / 0.15);
    out[i] = s * breath * edge * amt * 0.48;
  }

  /* tone=0 → глухой LPF (~180Hz), tone=1 → почти открыто */
  let lp = out[0] ?? 0;
  const coef = 0.012 + tone * tone * 0.22;
  for (let i = 0; i < n; i++) {
    lp += coef * (out[i]! - lp);
    out[i] = lp;
  }
  return out;
}

function tileMelody(melody: Float32Array, targetLen: number): Float32Array {
  if (melody.length === 0) return new Float32Array(targetLen);
  if (melody.length >= targetLen) return melody.subarray(0, targetLen);
  const out = new Float32Array(targetLen);
  for (let i = 0; i < targetLen; i++) out[i] = melody[i % melody.length]!;
  return out;
}

export type RenderMusicBedArgs = {
  beat: LabBeatParams;
  pad: LabMusicPadParams;
  /** Одна фраза (SFX / простой случай). */
  phrase?: LabPhraseNote[];
  /** Несколько слоёв мелодии (режим «Музыка»). Имеет приоритет над phrase. */
  layers?: LabMelodyLayer[];
  voice?: LabVoiceParams;
  rootMidi?: number;
  /** Если false — громкость только для экспорта; в лайве крутит GainNode. */
  applyVolume?: boolean;
};

function resolveMelodyLayers(args: RenderMusicBedArgs): LabMelodyLayer[] {
  if (args.layers && args.layers.length > 0) return args.layers;
  if (args.phrase && args.phrase.length > 0) {
    return [{ id: '_phrase', name: 'Фраза', notes: args.phrase, enabled: true, gain: 1 }];
  }
  return [];
}

/**
 * Фоновая петля: бит + атмосфера + (опц.) мелодия / слои.
 * Master volume по умолчанию НЕ запекается (лайв крутит GainNode) —
 * для сохранения передай applyVolume: true.
 */
export function renderMusicBedSamples(args: RenderMusicBedArgs): Float32Array {
  const beatParams: LabBeatParams = {
    ...args.beat,
    bars: (args.beat.bars === 8 || args.beat.bars === 16 ? args.beat.bars : 4) as 4 | 8 | 16,
    /* в буфер бита volume=1 — мастер отдельно */
    volume: 1,
  };
  const beat = renderBeatSamples(beatParams);
  const n = beat.length;
  if (n === 0) return beat;

  const pad = renderPadLayer(n, beatParams.bpm, args.pad, args.rootMidi ?? 45);
  const masterMel = clamp(args.pad.melody, 0, 1);
  const melody = new Float32Array(n);
  if (args.voice && masterMel > 0.02) {
    for (const layer of resolveMelodyLayers(args)) {
      if (!layer.enabled || layer.gain < 0.02 || layer.notes.length === 0) continue;
      const mel = tileMelody(renderPhraseSamples(layer.notes, args.voice), n);
      const g = layer.gain * masterMel * 0.85;
      for (let i = 0; i < n; i++) melody[i]! += mel[i]! * g;
    }
  }

  const beatLevel = 0.78;
  const master = args.applyVolume === true ? clamp(args.beat.volume ?? 1, 0, 2) : 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = softLimit((beat[i]! * beatLevel + pad[i]! + melody[i]!) * master);
  }

  const fade = Math.min(1024, Math.floor(LAB_SAMPLE_RATE * 0.012));
  for (let i = 0; i < fade; i++) {
    const a = i / fade;
    out[i]! = out[i]! * a + out[n - fade + i]! * (1 - a);
  }
  for (let i = 0; i < fade; i++) out[n - fade + i]! *= i / fade;

  return out;
}

export function mixMelodyWithBeat(melody: Float32Array, beat: LabBeatParams): Float32Array {
  return mixBeatIntoSamples(melody, beat);
}
