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
  normalizeMusicPad,
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
  /* Мягкий «студийный» компрессор: ловит всплески, не давит всю петлю в «мультик» */
  labMasterComp.threshold.value = -18;
  labMasterComp.knee.value = 28;
  labMasterComp.ratio.value = 4;
  labMasterComp.attack.value = 0.008;
  labMasterComp.release.value = 0.28;
  labMasterOut = ctx.createGain();
  labMasterOut.gain.value = 0.92;
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
      const vel = node.vel ?? 1;
      node.gain.gain.setTargetAtTime(vel * scale, t, 0.025);
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

/** Для watchdog: AudioContext лабы (отдельно от игровой шины). */
export function getLabAudioContext(): AudioContext {
  return getCtx();
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

type LiveNoteVoice = { src: AudioBufferSourceNode; gain: GainNode; vel: number };
const active = new Map<number, LiveNoteVoice>();
let chordVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let gameVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let phraseVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let beatVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
/** Разовое проигрывание (не петля) — отдельно от beatVoice. */
let oneShotVoice: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let oneShotAnchorCtx = 0;
let oneShotDurSec = 0;
let beatBuf: AudioBuffer | null = null;
let beatPcm: Float32Array | null = null;
let beatParams: LabBeatParams = { ...DEFAULT_LAB_BEAT };
/** Якорь AudioContext.currentTime в момент старта петли. */
let beatLoopAnchorCtx = 0;
/** Длительность зацикленного буфера, сек. */
let beatLoopDurSec = 0;
/** Точка старта / припаркованный playhead (сек внутри петли). */
let beatLoopCueSec = 0;
/** Скорость прослушивания петли (1 = норма, 2 = ×2). Не меняет BPM/ноты. */
let beatPlaybackRate = 1;
/** Бит включали в этой сессии — подмешивать в экспорт, пока явно не выключат. */
let beatExportWanted = false;
/** Нота ещё рендерится — отпустить сразу после старта. */
const pendingGateRelease = new Map<number, number>();
/** MIDI в процессе async playLabNote (ещё нет в active). */
const renderingNotes = new Set<number>();
/** Поколение playLabNote — отбросить устаревший старт. */
const notePlayGen = new Map<number, number>();

function beatContentKey(p: LabBeatParams): string {
  const bars = p.bars ?? 4;
  const pat =
    p.rhythm === 'custom'
      ? serializeBeatPattern(p.pattern, bars, { tileOneBar: p.patternRepeat === true })
      : p.rhythm;
  return `${p.bass}|${p.kick}|${p.hats}|${p.snare}|${p.industrial}|${p.crackle}|${p.bpm}|${p.depth}|${p.rhythm}|${bars}|${p.patternRepeat ? 1 : 0}|${pat}`;
}

function fadeStop(
  node: { src: AudioBufferSourceNode; gain: GainNode } | null,
  releaseSec = 0.03,
  delaySec = 0,
): void {
  if (!node) return;
  try {
    const t = getCtx().currentTime;
    const rel = Math.max(0.02, Math.min(3.5, releaseSec));
    const delay = Math.max(0, delaySec);
    const fadeAt = t + delay;
    node.gain.gain.cancelScheduledValues(t);
    node.gain.gain.setValueAtTime(Math.max(0.0001, node.gain.gain.value), fadeAt);
    node.gain.gain.exponentialRampToValueAtTime(0.0001, fadeAt + rel);
    node.src.stop(fadeAt + rel + 0.02);
  } catch {
    /* ignore */
  }
}

export function stopLabNote(midi: number): void {
  const cur = active.get(midi);
  if (!cur) return;
  fadeStop(cur, 0.04);
  active.delete(midi);
  syncPolyVoiceGains();
}

/** Отпустить ноту с релизом голоса (удержание / педаль). */
export function releaseLabNote(midi: number, releaseSec = 0.12): void {
  const cur = active.get(midi);
  if (!cur) {
    /* Звук ещё не стартовал (тяжёлый рендер) — отпустить в момент старта */
    pendingGateRelease.set(midi, Math.max(0.06, releaseSec));
    return;
  }
  pendingGateRelease.delete(midi);
  fadeStop(cur, releaseSec);
  active.delete(midi);
  syncPolyVoiceGains();
}

export function isLabNoteActive(midi: number): boolean {
  return active.has(midi);
}

/** Глушит все звучащие/стартующие ноты, кроме физически удерживаемых (сброс педали). */
export function releaseUnheldLabNotes(
  heldMidis: ReadonlySet<number>,
  releaseSec = 0.12,
): number[] {
  const released: number[] = [];
  for (const midi of new Set([...active.keys(), ...renderingNotes])) {
    if (heldMidis.has(midi)) continue;
    releaseLabNote(midi, releaseSec);
    released.push(midi);
  }
  return released;
}

export function cancelPendingGateRelease(midi: number): void {
  pendingGateRelease.delete(midi);
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
  try {
    const phase = getLabBeatLoopPhaseSec();
    if (phase != null) beatLoopCueSec = phase;
  } catch {
    /* ignore */
  }
  fadeStop(beatVoice);
  beatVoice = null;
  fadeStop(oneShotVoice);
  oneShotVoice = null;
  oneShotDurSec = 0;
  beatLoopDurSec = 0;
  if (clearExport) beatExportWanted = false;
}

/** Остановить только разовое ▶ (петлю не трогает). */
export function stopLabOneShot(): void {
  fadeStop(oneShotVoice);
  oneShotVoice = null;
  oneShotDurSec = 0;
}

/** Длительность текущей петли (бит/музыка), сек. */
export function getLabBeatLoopDurationSec(): number {
  return beatLoopDurSec;
}

/** Припаркованный playhead / точка следующего старта, сек. */
export function getLabBeatLoopCueSec(): number {
  return beatLoopCueSec;
}

function wrapLoopOffset(sec: number, dur: number): number {
  if (!(dur > 0)) return Math.max(0, sec);
  return ((sec % dur) + dur) % dur;
}

/**
 * Перемотать петлю (или припарковать playhead, если стоп).
 * Возвращает фактический offset в сек.
 */
export function seekLabBeatLoop(offsetSec: number): number {
  const dur =
    beatLoopDurSec > 0 ? beatLoopDurSec : beatBuf != null && beatBuf.duration > 0 ? beatBuf.duration : 0;
  const off = wrapLoopOffset(offsetSec, dur > 0 ? dur : Math.max(offsetSec, 0.001));
  beatLoopCueSec = dur > 0 ? off : Math.max(0, offsetSec);

  if (!beatVoice || !beatBuf || !(beatBuf.duration > 0)) {
    return beatLoopCueSec;
  }

  const ctx = getCtx();
  const gainVal = beatVoice.gain.gain.value;
  try {
    beatVoice.src.stop(0);
  } catch {
    /* ignore */
  }
  try {
    beatVoice.gain.disconnect();
  } catch {
    /* ignore */
  }

  const gain = ctx.createGain();
  gain.gain.value = gainVal;
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = beatBuf;
  src.loop = true;
  applyPlaybackRateToSource(src);
  src.connect(gain);
  const startOff = wrapLoopOffset(beatLoopCueSec, beatBuf.duration);
  src.start(0, startOff);
  beatVoice = { src, gain };
  beatLoopAnchorCtx = anchorForOffset(ctx.currentTime, startOff);
  beatLoopDurSec = beatBuf.duration;
  beatLoopCueSec = startOff;
  return startOff;
}

/** Фаза внутри петли или разового проигрывания, сек буфера (null если ничего не играет). */
export function getLabBeatLoopPhaseSec(): number | null {
  try {
    const now = getCtx().currentTime;
    if (beatVoice && beatLoopDurSec > 0) {
      const rate = Math.max(0.25, Math.min(4, beatPlaybackRate || 1));
      const elapsed = (now - beatLoopAnchorCtx) * rate;
      return ((elapsed % beatLoopDurSec) + beatLoopDurSec) % beatLoopDurSec;
    }
    if (oneShotVoice && oneShotDurSec > 0) {
      const rate = Math.max(0.25, Math.min(4, beatPlaybackRate || 1));
      const elapsed = (now - oneShotAnchorCtx) * rate;
      if (elapsed < 0) return 0;
      if (elapsed >= oneShotDurSec) return null;
      return elapsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Скорость прослушивания петли (не BPM композиции). */
export function getLabBeatPlaybackRate(): number {
  return beatPlaybackRate;
}

/**
 * ×0.5 / ×1 / ×2 для прослушивания без пересборки буфера и без сдвига нот.
 * Playhead идёт в той же музыкальной фазе.
 */
export function setLabBeatPlaybackRate(rate: number): number {
  const next = Math.max(0.25, Math.min(4, Number.isFinite(rate) ? rate : 1));
  const phase = getLabBeatLoopPhaseSec();
  beatPlaybackRate = next;
  try {
    const ctx = getCtx();
    if (beatVoice) {
      beatVoice.src.playbackRate.value = next;
      if (phase != null && next > 0) {
        beatLoopAnchorCtx = ctx.currentTime - phase / next;
      }
    }
    if (oneShotVoice) {
      oneShotVoice.src.playbackRate.value = next;
      if (phase != null && next > 0 && oneShotDurSec > 0) {
        oneShotAnchorCtx = ctx.currentTime - phase / next;
      }
    }
  } catch {
    /* ignore */
  }
  return beatPlaybackRate;
}

function applyPlaybackRateToSource(src: AudioBufferSourceNode): void {
  src.playbackRate.value = Math.max(0.25, Math.min(4, beatPlaybackRate || 1));
}

function anchorForOffset(ctxNow: number, offsetSec: number): number {
  const rate = Math.max(0.25, Math.min(4, beatPlaybackRate || 1));
  return ctxNow - offsetSec / rate;
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
  applyPlaybackRateToSource(src);
  src.connect(gain);
  const off = wrapLoopOffset(beatLoopCueSec, beatBuf.duration);
  src.start(0, off);
  beatVoice = { src, gain };
  beatLoopAnchorCtx = anchorForOffset(ctx.currentTime, off);
  beatLoopDurSec = beatBuf.duration;
  beatLoopCueSec = off;
  return true;
}

/** Фоновая петля (бит + пад + мелодия) — режим «Музыка» в лабе. */
let musicBedPlayGen = 0;

export async function startLabMusicBed(
  beat: LabBeatParams,
  pad: LabMusicPadParams = DEFAULT_LAB_MUSIC_PAD,
  phrase: LabPhraseNote[] = [],
  voice?: LabVoiceParams,
  rootMidi = 45,
  layers?: LabMelodyLayer[],
): Promise<boolean> {
  const gen = ++musicBedPlayGen;
  const ctx = await resumeLabAudio();
  if (gen !== musicBedPlayGen) return false;
  const merged = mergeBeatParams(beat);
  /* Рендер ДО stop: иначе playhead/петля мёртвые на время сборки 7–8 слоёв,
   * а отменённый gen оставляет тишину при beatOn=true. */
  const pcm = renderMusicBedSamples({
    beat: merged,
    pad: normalizeMusicPad({ ...DEFAULT_LAB_MUSIC_PAD, ...pad }),
    phrase,
    layers,
    voice,
    rootMidi,
    applyVolume: false,
  });
  if (gen !== musicBedPlayGen) return false;
  const buf = samplesToBuffer(ctx, pcm);
  if (gen !== musicBedPlayGen) return false;

  beatParams = { ...merged };
  beatPcm = pcm;
  beatBuf = buf;
  stopLabBeat(false);
  beatExportWanted = true;
  const gain = ctx.createGain();
  gain.gain.value = beatPlaybackGain(merged);
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = beatBuf;
  src.loop = true;
  applyPlaybackRateToSource(src);
  src.connect(gain);
  const off = wrapLoopOffset(beatLoopCueSec, beatBuf.duration);
  src.start(0, off);
  beatVoice = { src, gain };
  beatLoopAnchorCtx = anchorForOffset(ctx.currentTime, off);
  beatLoopDurSec = beatBuf.duration;
  beatLoopCueSec = off;
  return true;
}

function stopOneShotOnly(): void {
  fadeStop(oneShotVoice);
  oneShotVoice = null;
  oneShotDurSec = 0;
}

/**
 * Проиграть бит+атмосферу+мелодии один раз (без зацикливания).
 * Не включает «Петлю» — по окончании тишина.
 */
export async function playLabMusicOnce(
  beat: LabBeatParams,
  pad: LabMusicPadParams = DEFAULT_LAB_MUSIC_PAD,
  phrase: LabPhraseNote[] = [],
  voice?: LabVoiceParams,
  rootMidi = 45,
  layers?: LabMelodyLayer[],
): Promise<boolean> {
  const gen = ++musicBedPlayGen;
  const ctx = await resumeLabAudio();
  if (gen !== musicBedPlayGen) return false;
  const merged = mergeBeatParams(beat);
  const pcm = renderMusicBedSamples({
    beat: merged,
    pad: normalizeMusicPad({ ...DEFAULT_LAB_MUSIC_PAD, ...pad }),
    phrase,
    layers,
    voice,
    rootMidi,
    applyVolume: false,
  });
  if (gen !== musicBedPlayGen) return false;
  if (pcm.length < 32) return false;
  const buf = samplesToBuffer(ctx, pcm);
  if (gen !== musicBedPlayGen) return false;
  stopOneShotOnly();
  const gain = ctx.createGain();
  gain.gain.value = beatPlaybackGain(merged);
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = false;
  applyPlaybackRateToSource(src);
  src.connect(gain);
  const off = wrapLoopOffset(beatLoopCueSec, buf.duration);
  src.start(0, off);
  oneShotVoice = { src, gain };
  oneShotAnchorCtx = anchorForOffset(ctx.currentTime, off);
  oneShotDurSec = Math.max(0, buf.duration - off);
  src.onended = () => {
    if (oneShotVoice?.src === src) {
      oneShotVoice = null;
      oneShotDurSec = 0;
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
  return true;
}

/** Проиграть только бит один раз (режим SFX). */
export async function playLabBeatOnce(params: LabBeatParams): Promise<boolean> {
  const ctx = await resumeLabAudio();
  const merged = mergeBeatParams(params);
  stopOneShotOnly();
  const pcm = renderBeatSamples(merged);
  if (pcm.length < 32) return false;
  const buf = samplesToBuffer(ctx, pcm);
  const gain = ctx.createGain();
  gain.gain.value = beatPlaybackGain(merged);
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = false;
  applyPlaybackRateToSource(src);
  src.connect(gain);
  const off = wrapLoopOffset(beatLoopCueSec, buf.duration);
  src.start(0, off);
  oneShotVoice = { src, gain };
  oneShotAnchorCtx = anchorForOffset(ctx.currentTime, off);
  oneShotDurSec = Math.max(0, buf.duration - off);
  src.onended = () => {
    if (oneShotVoice?.src === src) {
      oneShotVoice = null;
      oneShotDurSec = 0;
      try {
        gain.disconnect();
      } catch {
        /* ignore */
      }
    }
  };
  return true;
}

export function isLabOneShotPlaying(): boolean {
  return oneShotVoice != null;
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

/** Keep-alive UI лабы на window — переживает HMR любого модуля. */
export function markLabUiMounted(): number {
  const w = window as Window & { __updownLabUiKeepAlive?: number };
  const n = (w.__updownLabUiKeepAlive ?? 0) + 1;
  w.__updownLabUiKeepAlive = n;
  return n;
}

/** Гасить петлю только если страница реально ушла (не быстрый remount/HMR). */
export function scheduleLabUiTeardown(token: number, delayMs = 600): void {
  window.setTimeout(() => {
    const w = window as Window & { __updownLabUiKeepAlive?: number };
    if (w.__updownLabUiKeepAlive === token) stopLabBeat();
  }, delayMs);
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

function startBuffer(
  ctx: AudioContext,
  buf: AudioBuffer,
  when?: number,
): { src: AudioBufferSourceNode; gain: GainNode } {
  const gain = ctx.createGain();
  gain.gain.value = 1;
  gain.connect(getLabMaster(ctx));
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(gain);
  if (when != null && when > ctx.currentTime) src.start(when);
  else src.start();
  return { src, gain };
}

type PendingLiveNote = {
  midi: number;
  voice: LabVoiceParams;
  opts?: { gate?: boolean; longGate?: boolean; velocity?: number };
  gen: number;
};

let pendingLiveNotes: PendingLiveNote[] = [];
let pendingLiveFlush = 0;
let liveFlushRunning = false;
/** Поколение playLabChord — устаревший рендер не перебивает более новый аккорд. */
let chordPlayGen = 0;

async function flushPendingLiveNotes(): Promise<void> {
  if (liveFlushRunning) return;
  liveFlushRunning = true;
  pendingLiveFlush = 0;
  try {
    while (pendingLiveNotes.length > 0) {
      const batch = pendingLiveNotes;
      pendingLiveNotes = [];
      const ctx = await resumeLabAudio();
      /* Ноты, пришедшие во время resume, подхватим в следующей итерации while. */
      const live = batch.filter((p) => notePlayGen.get(p.midi) === p.gen);
      if (live.length === 0) continue;

      /* Один when на весь батч — аккорд с клавиатуры без «лесенки». */
      const when = ctx.currentTime;
      const started: {
        midi: number;
        gen: number;
        node: { src: AudioBufferSourceNode; gain: GainNode };
        vel: number;
      }[] = [];

      /* Аккорд-буфер не должен глушить живые ноты */
      stopLabChord();

      for (const p of live) {
        if (notePlayGen.get(p.midi) !== p.gen) continue;
        try {
          stopLabNote(p.midi);
          const velRaw =
            p.opts?.velocity == null ? 1 : Math.min(1, Math.max(0.05, p.opts.velocity));
          const velCurve = Math.pow(velRaw, 1.55);
          const velGain = 0.08 + 0.92 * velCurve;
          /* Короткий live-буфер: release всё равно гасит; длинный = лаг при петле */
          const dur = p.opts?.gate
            ? p.opts.longGate
              ? Math.min(2.8, Math.max(Number(p.voice.duration) || 0.55, 2.0))
              : Math.min(1.45, Math.max(Number(p.voice.duration) || 0.55, 1.05))
            : Math.min(Number(p.voice.duration) || 0.55, 1.6);
          const voiced: LabVoiceParams = {
            ...p.voice,
            duration: dur,
            brightness: Math.min(
              1,
              (Number.isFinite(p.voice.brightness) ? p.voice.brightness : 0.7) * (0.4 + 0.6 * velRaw),
            ),
            filter: Math.min(
              1,
              Math.max(
                0.15,
                (Number.isFinite(p.voice.filter) ? p.voice.filter : 1) * (0.45 + 0.55 * velRaw),
              ),
            ),
          };
          const samples = renderNoteSamples(p.midi, voiced, { live: true });
          if (notePlayGen.get(p.midi) !== p.gen) continue;
          const buf = samplesToBuffer(ctx, samples);
          const voiceNode = startBuffer(ctx, buf, when);
          voiceNode.gain.gain.value = velGain;
          started.push({ midi: p.midi, gen: p.gen, node: voiceNode, vel: velGain });
        } catch {
          if (notePlayGen.get(p.midi) === p.gen) renderingNotes.delete(p.midi);
        }
      }

      for (const s of started) {
        if (notePlayGen.get(s.midi) !== s.gen) {
          try {
            s.node.src.stop(0);
          } catch {
            /* ignore */
          }
          renderingNotes.delete(s.midi);
          continue;
        }
        s.node.src.onended = () => {
          if (active.get(s.midi)?.src === s.node.src) active.delete(s.midi);
          try {
            s.node.gain.disconnect();
          } catch {
            /* ignore */
          }
          syncPolyVoiceGains();
        };
        active.set(s.midi, { ...s.node, vel: s.vel });
        renderingNotes.delete(s.midi);

        const pendingRel = pendingGateRelease.get(s.midi);
        if (pendingRel != null) {
          pendingGateRelease.delete(s.midi);
          fadeStop(s.node, Math.max(0.06, pendingRel), 0.02);
          active.delete(s.midi);
        }
      }
      syncPolyVoiceGains();
    }
  } finally {
    liveFlushRunning = false;
    if (pendingLiveNotes.length > 0 && !pendingLiveFlush) {
      pendingLiveFlush = 1;
      queueMicrotask(() => {
        void flushPendingLiveNotes();
      });
    }
  }
}

/** Играть одну ноту (live: microtask-батч, без ожидания кадра UI). */
export async function playLabNote(
  midi: number,
  voice: LabVoiceParams,
  opts?: { gate?: boolean; longGate?: boolean; velocity?: number },
): Promise<void> {
  const gen = (notePlayGen.get(midi) ?? 0) + 1;
  notePlayGen.set(midi, gen);
  pendingGateRelease.delete(midi);
  renderingNotes.add(midi);

  pendingLiveNotes = pendingLiveNotes.filter((p) => p.midi !== midi);
  pendingLiveNotes.push({ midi, voice, opts, gen });

  if (!pendingLiveFlush) {
    pendingLiveFlush = 1;
    queueMicrotask(() => {
      void flushPendingLiveNotes();
    });
  }
}

/** Сбросить одиночные live-ноты (перед буфером аккорда). */
function stopAllActiveLiveNotes(): void {
  for (const midi of [...active.keys()]) {
    const cur = active.get(midi);
    if (!cur) continue;
    fadeStop(cur, 0.03);
    active.delete(midi);
  }
  for (const midi of [...renderingNotes]) {
    notePlayGen.set(midi, (notePlayGen.get(midi) ?? 0) + 1);
    renderingNotes.delete(midi);
    pendingGateRelease.delete(midi);
  }
  pendingLiveNotes = [];
}

/** 2–8 нот одновременно, с нормализацией как в WAV. */
export async function playLabChord(midis: number[], voice: LabVoiceParams): Promise<void> {
  const unique = [...new Set(midis)].slice(0, 8);
  if (unique.length === 0) return;
  const gen = ++chordPlayGen;
  if (unique.length === 1) {
    stopLabChord();
    await playLabNote(unique[0]!, voice);
    return;
  }
  const ctx = await resumeLabAudio();
  if (gen !== chordPlayGen) return;
  /* Иначе первая нота (через playLabNote) остаётся в active и мешает / глушит аккорд */
  stopAllActiveLiveNotes();
  stopLabChord();
  const samples = renderChordSamples(unique, voice);
  if (gen !== chordPlayGen) return;
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
