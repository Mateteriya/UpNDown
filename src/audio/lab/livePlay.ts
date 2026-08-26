import { LAB_SAMPLE_RATE, type LabPhraseNote, type LabVoiceParams, type LabBeatParams, DEFAULT_LAB_BEAT } from './types';
import { renderChordSamples, renderNoteSamples, renderPhraseSamples } from './renderVoice';
import { beatPlaybackGain, mixBeatIntoSamples, renderBeatSamples } from './renderBeat';

function mergeBeatParams(params: LabBeatParams): LabBeatParams {
  return { ...DEFAULT_LAB_BEAT, ...params };
}

let sharedCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!sharedCtx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    sharedCtx = new AC!();
  }
  return sharedCtx;
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
let beatVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let beatBuf: AudioBuffer | null = null;
let beatPcm: Float32Array | null = null;
let beatParams: LabBeatParams = { ...DEFAULT_LAB_BEAT };
/** Бит включали в этой сессии — подмешивать в экспорт, пока явно не выключат. */
let beatExportWanted = false;

function beatContentKey(p: LabBeatParams): string {
  return `${p.bass}|${p.percussion}|${p.industrial}|${p.crackle}|${p.bpm}|${p.depth}|${p.rhythm}`;
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
}

function stopLabChord(): void {
  fadeStop(chordVoice);
  chordVoice = null;
}

function stopGameSample(): void {
  fadeStop(gameVoice);
  gameVoice = null;
}

export function stopAllLabNotes(): void {
  for (const midi of [...active.keys()]) stopLabNote(midi);
  stopLabChord();
  stopGameSample();
}

export function getLabBeatParams(): LabBeatParams {
  return { ...beatParams };
}

export function stopLabBeat(clearExport = true): void {
  fadeStop(beatVoice);
  beatVoice = null;
  if (clearExport) beatExportWanted = false;
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
  gain.connect(ctx.destination);
  const src = ctx.createBufferSource();
  src.buffer = beatBuf;
  src.loop = true;
  src.connect(gain);
  src.start();
  beatVoice = { src, gain };
  return true;
}

/** Обновить параметры; если бит играет — перезапустить петлю или только громкость. */
export async function setLabBeatParams(params: LabBeatParams): Promise<void> {
  const contentSame = beatContentKey(params) === beatContentKey(beatParams);
  const prev = beatParams;
  beatParams = { ...params };

  if (beatVoice && contentSame) {
    beatVoice.gain.gain.value = beatPlaybackGain(params);
    return;
  }

  if (beatVoice) {
    await startLabBeat(params);
    return;
  }

  beatParams = { ...mergeBeatParams(params) };
  if (beatContentKey(prev) !== beatContentKey(beatParams)) {
    beatBuf = null;
    beatPcm = null;
  }
}

export function isLabBeatOn(): boolean {
  return beatVoice != null;
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
  gain.connect(ctx.destination);
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
  };
  active.set(midi, voiceNode);
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
  };
  chordVoice = node;
}

export async function playLabPhrase(phrase: LabPhraseNote[], voice: LabVoiceParams): Promise<void> {
  if (phrase.length === 0) return;
  const ctx = await resumeLabAudio();
  stopAllLabNotes();
  const samples = renderPhraseSamples(phrase, voice);
  const buf = samplesToBuffer(ctx, samples);
  const node = startBuffer(ctx, buf);
  node.src.onended = () => {
    try {
      node.gain.disconnect();
    } catch {
      /* ignore */
    }
  };
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
