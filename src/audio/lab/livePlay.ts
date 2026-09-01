import {
  LAB_SAMPLE_RATE,
  type LabPhraseNote,
  type LabVoiceParams,
  type LabBeatParams,
  type LabBeatLaneId,
  type LabMelodyLayer,
  DEFAULT_LAB_BEAT,
  DEFAULT_LAB_MUSIC_PAD,
  emptyBeatPattern,
  serializeBeatPattern,
  type LabMusicPadParams,
} from './types';
import { renderChordSamples, renderNoteSamples, renderPhraseSamples } from './renderVoice';
import { beatPlaybackGain, mixBeatIntoSamples, renderBeatSamples } from './renderBeat';
import { renderMusicBedSamples } from './renderMusicBed';

function mergeBeatParams(params: LabBeatParams): LabBeatParams {
  return { ...DEFAULT_LAB_BEAT, ...params };
}

let sharedCtx: AudioContext | null = null;
/** Общая шина лабы: компрессор/лимитер — без треска при полифонии длинных нот. */
let labMasterIn: GainNode | null = null;
let labMasterComp: DynamicsCompressorNode | null = null;
let labMasterOut: GainNode | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AC!();
    labMasterIn = null;
    labMasterComp = null;
    labMasterOut = null;
  }
  return sharedCtx;
}

function getLabMaster(ctx: AudioContext): GainNode {
  if (labMasterIn && labMasterIn.context === ctx) return labMasterIn;
  labMasterIn = ctx.createGain();
  labMasterIn.gain.value = 1;
  labMasterComp = ctx.createDynamicsCompressor();
  /* Мягкий «студийный» лимитер: ловит сумму длинных басов, не убивает характер */
  labMasterComp.threshold.value = -14;
  labMasterComp.knee.value = 22;
  labMasterComp.ratio.value = 12;
  labMasterComp.attack.value = 0.002;
  labMasterComp.release.value = 0.22;
  labMasterOut = ctx.createGain();
  labMasterOut.gain.value = 0.88;
  labMasterIn.connect(labMasterComp);
  labMasterComp.connect(labMasterOut);
  labMasterOut.connect(ctx.destination);
  return labMasterIn;
}

/** Поджать гейн активных голосов при полифонии (√N), лимитер добивает остаток. */
function syncPolyVoiceGains(): void {
  try {
    const ctx = getCtx();
    const n = active.size + (chordVoice ? 1 : 0) + (phraseVoice ? 1 : 0);
    const scale = n <= 1 ? 1 : Math.min(1, 1 / Math.sqrt(n * 0.85));
    const t = ctx.currentTime;
    for (const node of active.values()) {
      node.gain.gain.setTargetAtTime(scale, t, 0.025);
    }
    if (chordVoice) chordVoice.gain.gain.setTargetAtTime(scale, t, 0.025);
    if (phraseVoice) phraseVoice.gain.gain.setTargetAtTime(scale, t, 0.025);
  } catch {
    /* ignore */
  }
}

export async function resumeLabAudio(): Promise<AudioContext> {
  const c = getCtx();
  if (c.state === 'suspended') {
    try {
      await c.resume();
    } catch {
      /* ignore */
    }
  }
  return c;
}

function samplesToBuffer(ctx: AudioContext, samples: Float32Array): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, samples.length), LAB_SAMPLE_RATE);
  const ch = buf.getChannelData(0);
  if (samples.length === 0) {
    ch[0] = 0;
  } else {
    ch.set(samples);
  }
  return buf;
}

const active = new Map<number, { src: AudioBufferSourceNode; gain: GainNode }>();
let chordVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let gameVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let phraseVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let beatVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let beatBuf: AudioBuffer | null = null;
let beatPcm: Float32Array | null = null;
let beatParams: LabBeatParams = { ...DEFAULT_LAB_BEAT };
/** Якорь AudioContext.currentTime в момент старта петли. */
let beatLoopAnchorCtx = 0;
/** Длительность зацикленного буфера, сек. */
let beatLoopDurSec = 0;
/** Бит включали в этой сессии — подмешивать в экспорт, пока явно не выключат. */
let beatExportWanted = false;

function beatContentKey(p: LabBeatParams): string {
  const pat = p.rhythm === 'custom' ? serializeBeatPattern(p.pattern) : p.rhythm;
  return `${p.bass}|${p.kick}|${p.hats}|${p.snare}|${p.industrial}|${p.crackle}|${p.bpm}|${p.depth}|${p.rhythm}|${p.bars ?? 4}|${pat}`;
}

function fadeStop(node: { src: AudioBufferSourceNode; gain: GainNode } | null): void {
  if (!node) return;
  try {
    const t = getCtx().currentTime;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value), t);
    node.gain.gain.linearRampToValueAtTime(0.0001, t + 0.03);
    node.src.stop(t + 0.04);
  } catch {
    /* ignore */
  }
}

export function stopLabNote(midi: number): void {
  const cur = active.get(midi);
  if (!cur) return;
  fadeStop(cur);
  active.delete(midi);
  syncPolyVoiceGains();
}

function stopLabChord(): void {
  fadeStop(chordVoice);
  chordVoice = null;
  syncPolyVoiceGains();
}

function stopGameSample(): void {
  fadeStop(gameVoice);
  gameVoice = null;
}

export function stopLabPhrase(): void {
  fadeStop(phraseVoice);
  phraseVoice = null;
  syncPolyVoiceGains();
}

export function stopAllLabNotes(): void {
  for (const midi of [...active.keys()]) {
    const cur = active.get(midi);
    if (!cur) continue;
    fadeStop(cur);
    active.delete(midi);
  }
  fadeStop(chordVoice);
  chordVoice = null;
  fadeStop(gameVoice);
  gameVoice = null;
  fadeStop(phraseVoice);
  phraseVoice = null;
  syncPolyVoiceGains();
}

export function getLabBeatParams(): LabBeatParams {
  return { ...beatParams };
}

export function stopLabBeat(clearExport = true): void {
  fadeStop(beatVoice);
  beatVoice = null;
  beatLoopDurSec = 0;
  if (clearExport) beatExportWanted = false;
}

/** Длительность текущей петли (бит/музыка), сек. */
export function getLabBeatLoopDurationSec(): number {
  return beatLoopDurSec;
}

/** Фаза внутри петли 0…duration (null если петля не играет). */
export function getLabBeatLoopPhaseSec(): number | null {
  if (!beatVoice || beatLoopDurSec <= 0) return null;
  try {
    const elapsed = getCtx().currentTime - beatLoopAnchorCtx;
    return ((elapsed % beatLoopDurSec) + beatLoopDurSec) % beatLoopDurSec;
  } catch {
    return null;
  }
}

/**
 * Epoch для performance.now(): (now - epoch)/1000 ≈ текущая фаза петли.
 * Нужен, чтобы запись мелодии шла в той же шкале времени, что и бит.
 */
export function getLabBeatRecordEpochMs(): number | null {
  const phase = getLabBeatLoopPhaseSec();
  if (phase == null) return null;
  return performance.now() - phase * 1000;
}

export function isLabBeatExportWanted(): boolean {
  return beatExportWanted || beatVoice != null;
}

/** Процедурный бит под клавиши лабы (не играет в партии). */
export async function startLabBeat(params: LabBeatParams = beatParams): Promise<boolean> {
  const ctx = await resumeLabAudio();
  const merged = mergeBeatParams(params);
  stopLabBeat(false);
  beatParams = { ...merged };
  beatPcm = renderBeatSamples(beatParams);
  beatBuf = samplesToBuffer(ctx, beatPcm);
  beatExportWanted = true;
  const gain = ctx.createGain();
  gain.gain.value = beatPlaybackGain(merged);
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = beatBuf;
  src.loop = true;
  src.connect(gain);
  src.start();
  beatVoice = { src, gain };
  beatLoopAnchorCtx = ctx.currentTime;
  beatLoopDurSec = beatBuf.duration;
  return true;
}

/** Фоновая петля (бит + пад + мелодия) — режим «Музыка» в лабе. */
export async function startLabMusicBed(
  beat: LabBeatParams,
  pad: LabMusicPadParams = DEFAULT_LAB_MUSIC_PAD,
  phrase: LabPhraseNote[] = [],
  voice?: LabVoiceParams,
  rootMidi = 45,
  layers?: LabMelodyLayer[],
): Promise<boolean> {
  const ctx = await resumeLabAudio();
  const merged = mergeBeatParams(beat);
  stopLabBeat(false);
  beatParams = { ...merged };
  beatPcm = renderMusicBedSamples({
    beat: merged,
    pad: { ...DEFAULT_LAB_MUSIC_PAD, ...pad },
    phrase,
    layers,
    voice,
    rootMidi,
    applyVolume: false,
  });
  beatBuf = samplesToBuffer(ctx, beatPcm);
  beatExportWanted = true;
  const gain = ctx.createGain();
  gain.gain.value = beatPlaybackGain(merged);
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = beatBuf;
  src.loop = true;
  src.connect(gain);
  src.start();
  beatVoice = { src, gain };
  beatLoopAnchorCtx = ctx.currentTime;
  beatLoopDurSec = beatBuf.duration;
  return true;
}

/** Обновить параметры; если бит играет — перезапустить петлю или только громкость. */
export async function setLabBeatParams(params: LabBeatParams): Promise<void> {
  const merged = mergeBeatParams(params);
  const contentSame = beatContentKey(merged) === beatContentKey(beatParams);
  const prev = beatParams;
  beatParams = { ...merged };

  if (beatVoice && contentSame) {
    /* только громкость — без пересборки буфера */
    beatVoice.gain.gain.value = beatPlaybackGain(merged);
    return;
  }

  if (beatVoice) {
    await startLabBeat(merged);
    return;
  }

  if (beatContentKey(prev) !== beatContentKey(merged)) {
    beatBuf = null;
    beatPcm = null;
  }
}

/** В режиме музыки: только громкость без пересборки (контент тот же). */
export function setLabMusicPlaybackVolume(volume: number): void {
  beatParams = { ...beatParams, volume };
  if (beatVoice) {
    beatVoice.gain.gain.value = beatPlaybackGain(beatParams);
  }
}

export function isLabBeatOn(): boolean {
  return beatVoice != null;
}

/** Короткий one-shot удара при клике по сетке (даже до старта петли). */
export async function previewLabDrumHit(lane: LabBeatLaneId, from?: LabBeatParams): Promise<void> {
  const ctx = await resumeLabAudio();
  const base = { ...DEFAULT_LAB_BEAT, ...beatParams, ...from };
  const pattern = emptyBeatPattern();
  pattern[lane][0] = true;
  const samples = renderBeatSamples({
    ...base,
    rhythm: 'custom',
    pattern,
    bars: 4,
    bass: 0,
    kick: lane === 'kick' ? Math.max(base.kick, 0.9) : 0,
    snare: lane === 'snare' ? Math.max(base.snare, 0.85) : 0,
    hats: lane === 'hats' ? Math.max(base.hats, 0.75) : 0,
    industrial: Math.min(base.industrial, 0.35),
    crackle: 0,
    volume: 1.2,
  });
  const n = Math.min(samples.length, Math.floor(LAB_SAMPLE_RATE * 0.32));
  if (n < 32) return;
  const slice = samples.subarray(0, n);
  const buf = samplesToBuffer(ctx, slice);
  const node = startBuffer(ctx, buf);
  node.gain.gain.value = 0.95;
  node.src.onended = () => {
    try {
      node.gain.disconnect();
    } catch {
      /* ignore */
    }
  };
}

/** Подмешать петлю бита на длину семпла (мелодия + бит в WAV). */
export async function mixLabBeatInto(samples: Float32Array, params: LabBeatParams = beatParams): Promise<Float32Array> {
  await resumeLabAudio();
  const p = { ...DEFAULT_LAB_BEAT, ...params };
  beatParams = { ...p };
  beatPcm = renderBeatSamples(p);
  return mixBeatIntoSamples(samples, p);
}

/** Нужно ли класть бит в сохранённый WAV. */
export function shouldBakeBeatIntoExport(explicitOn?: boolean): boolean {
  return explicitOn === true || beatExportWanted || beatVoice != null;
}

function startBuffer(ctx: AudioContext, buf: AudioBuffer): { src: AudioBufferSourceNode; gain: GainNode } {
  const gain = ctx.createGain();
  gain.gain.value = 1;
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  src.start();
  return { src, gain };
}

/** Играть одну ноту (буфер = офлайн-рендер → WAV совпадёт). */
export async function playLabNote(midi: number, voice: LabVoiceParams): Promise<void> {
  const ctx = await resumeLabAudio();
  stopLabNote(midi);
  const samples = renderNoteSamples(midi, voice);
  const buf = samplesToBuffer(ctx, samples);
  const voiceNode = startBuffer(ctx, buf);
  voiceNode.src.onended = () => {
    if (active.get(midi)?.src === voiceNode.src) active.delete(midi);
    try {
      voiceNode.gain.disconnect();
    } catch {
      /* ignore */
    }
    syncPolyVoiceGains();
  };
  active.set(midi, voiceNode);
  syncPolyVoiceGains();
}

/** 2–8 нот одновременно, с нормализацией как в WAV. */
export async function playLabChord(midis: number[], voice: LabVoiceParams): Promise<void> {
  const unique = [...new Set(midis)].slice(0, 8);
  if (unique.length === 0) return;
  if (unique.length === 1) {
    await playLabNote(unique[0]!, voice);
    return;
  }
  const ctx = await resumeLabAudio();
  stopLabChord();
  const samples = renderChordSamples(unique, voice);
  const buf = samplesToBuffer(ctx, samples);
  const node = startBuffer(ctx, buf);
  node.src.onended = () => {
    if (chordVoice?.src === node.src) chordVoice = null;
    try {
      node.gain.disconnect();
    } catch {
      /* ignore */
    }
    syncPolyVoiceGains();
  };
  chordVoice = node;
  syncPolyVoiceGains();
}

export async function playLabPhrase(phrase: LabPhraseNote[], voice: LabVoiceParams): Promise<number> {
  if (phrase.length === 0) return 0;
  const ctx = await resumeLabAudio();
  stopLabPhrase();
  const samples = renderPhraseSamples(phrase, voice);
  const buf = samplesToBuffer(ctx, samples);
  const node = startBuffer(ctx, buf);
  node.src.onended = () => {
    if (phraseVoice?.src === node.src) phraseVoice = null;
    try {
      node.gain.disconnect();
    } catch {
      /* ignore */
    }
    syncPolyVoiceGains();
  };
  phraseVoice = node;
  syncPolyVoiceGains();
  return samples.length / LAB_SAMPLE_RATE;
}

export function isLabPhrasePlaying(): boolean {
  return phraseVoice != null;
}

async function playDecodedWav(raw: ArrayBuffer): Promise<boolean> {
  const ctx = await resumeLabAudio();
  try {
    const buf = await ctx.decodeAudioData(raw.slice(0));
    stopGameSample();
    const node = startBuffer(ctx, buf);
    node.src.onended = () => {
      if (gameVoice?.src === node.src) gameVoice = null;
      try {
        node.gain.disconnect();
      } catch {
        /* ignore */
      }
    };
    gameVoice = node;
    return true;
  } catch {
    return false;
  }
}

/** Сыграть сохранённый WAV (из IndexedDB / только что собранный буфер). */
export async function playWavBytes(raw: ArrayBuffer): Promise<boolean> {
  return playDecodedWav(raw);
}

/** Текущий WAV из игры (`public/audio/sfx/{id}.wav`), без mute настроек приложения. */
export async function playGameSample(id: string): Promise<boolean> {
  try {
    const res = await fetch(`/audio/sfx/${id}.wav?labcmp=1`, { cache: 'no-store' });
    if (!res.ok) return false;
    const raw = await res.arrayBuffer();
    return playDecodedWav(raw);
  } catch {
    return false;
  }
}
