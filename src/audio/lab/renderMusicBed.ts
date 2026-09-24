import {
  LAB_SAMPLE_RATE,
  normalizeLabBars,
  fitMelodyNotesToLoop,
  type LabBeatParams,
  type LabMelodyLayer,
  type LabMusicPadParams,
  type LabPhraseNote,
  type LabVoiceParams,
} from './types';
import { mixBeatIntoSamples, renderBeatSamples, resolveLoopSeamForBeat, applyLoopSeamCrossfade } from './renderBeat';
import { renderAtmosphereMix } from './renderAtmosphere';
import { renderPhraseSamples } from './renderVoice';

function clamp(x: number, a: number, b: number): number {
  return Math.min(b, Math.max(a, x));
}

/** Линейно уложить пик ≤ maxPeak — без tanh (он даёт «мультяшный» хрип на сумме слоёв). */
function peakNormalize(buf: Float32Array, maxPeak: number): void {
  let peak = 1e-9;
  for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i]!));
  if (peak <= maxPeak) return;
  const s = maxPeak / peak;
  for (let i = 0; i < buf.length; i++) buf[i]! *= s;
}

/** Уложить мелодию в длину петли: обрезка/паддинг, БЕЗ зацикливания (иначе «двойная» мелодия). */
function placeMelodyInLoop(melody: Float32Array, targetLen: number): Float32Array {
  if (targetLen <= 0) return new Float32Array(0);
  if (melody.length === 0) return new Float32Array(targetLen);
  if (melody.length === targetLen) return melody;
  const out = new Float32Array(targetLen);
  out.set(melody.subarray(0, Math.min(melody.length, targetLen)));
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

/** Сустейн педали в записи может быть длинным — в миксе режем хвост, чтобы 8 слоёв не взрывали шину. */
function capNoteDurForMix(notes: LabPhraseNote[], maxDur: number): LabPhraseNote[] {
  return notes.map((n) =>
    n.dur != null && n.dur > maxDur ? { ...n, dur: maxDur } : n,
  );
}

/**
 * Фоновая петля: бит + атмосфера + (опц.) мелодия / слои.
 * Master volume по умолчанию НЕ запекается (лайв крутит GainNode) —
 * для сохранения передай applyVolume: true.
 */
export function renderMusicBedSamples(args: RenderMusicBedArgs): Float32Array {
  const beatParams: LabBeatParams = {
    ...args.beat,
    bars: normalizeLabBars(args.beat.bars),
    /* в буфер бита volume=1 — мастер отдельно */
    volume: 1,
  };
  const beat = renderBeatSamples(beatParams);
  const n = beat.length;
  if (n === 0) return beat;

  const pad = renderAtmosphereMix(
    n,
    beatParams.bpm,
    args.pad,
    args.rootMidi ?? 45,
    beatParams.bars,
    true,
  );
  const masterMel = clamp(args.pad.melody, 0, 1);
  const melody = new Float32Array(n);
  const loopSec = n / LAB_SAMPLE_RATE;
  const layers = resolveMelodyLayers(args).filter(
    (layer) => layer.enabled && layer.gain >= 0.02 && layer.notes.length > 0,
  );
  const fallbackVoice = args.voice;
  if (masterMel > 0.02 && layers.length > 0 && (fallbackVoice || layers.some((l) => l.voice))) {
    const L = layers.length;
    /* Мягче авто-приглушение: 7 слоёв остаются «плотными», без мультяшного клипа */
    const layerNorm = L <= 1 ? 1 : 1 / Math.pow(L, 0.36);
    const busGain = 0.82 * masterMel;
    /* Фикс. потолок сустейна — не зависит от числа слоёв (иначе 7↔8 меняет тембр старых дорожек) */
    const noteCap = 4.2;
    for (const layer of layers) {
      const layerVoice = layer.voice ?? fallbackVoice;
      if (!layerVoice) continue;
      /* fit только на рендер — в state ноты не трогаем */
      const fitted = capNoteDurForMix(fitMelodyNotesToLoop(layer.notes, loopSec), noteCap);
      const raw = renderPhraseSamples(fitted, layerVoice);
      /* Каждый слой — свой потолок, иначе длинный сустейн одного слоя забивает пик фразы */
      peakNormalize(raw, 0.82);
      const mel = placeMelodyInLoop(raw, n);
      const g = layer.gain * busGain * layerNorm;
      for (let i = 0; i < n; i++) melody[i]! += mel[i]! * g;
    }
    /* Шина мелодий отдельно — не тащим дисторшн на бит/пэд */
    const melCeil = L <= 2 ? 0.88 : Math.max(0.58, 0.88 / Math.pow(L / 2, 0.28));
    peakNormalize(melody, melCeil);
  }

  const beatLevel = 0.72;
  const master = args.applyVolume === true ? clamp(args.beat.volume ?? 1, 0, 2) : 1;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    out[i] = (beat[i]! * beatLevel + pad[i]! + melody[i]!) * master;
  }
  /* Финальный потолок без tanh — иначе при 6–8 слоях всё звучит «как мультик» */
  peakNormalize(out, 0.97);

  const beatSec = 60 / clamp(beatParams.bpm, 80, 190);
  const stepDur = beatSec / 4;
  const padDur = stepDur * 4;
  const { fade: loopFade, mode: loopSeamMode } = resolveLoopSeamForBeat(beatParams, n, stepDur, padDur);
  applyLoopSeamCrossfade(out, loopFade, loopSeamMode);

  return out;
}

export function mixMelodyWithBeat(melody: Float32Array, beat: LabBeatParams): Float32Array {
  return mixBeatIntoSamples(melody, beat);
}
