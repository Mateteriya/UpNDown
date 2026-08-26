import { loadAllLabSlots } from './lab/slotStore';
import { loadAudioSettings, saveAudioSettings } from './settings';
import { playSynthSound } from './synth';
import {
  AUDIO_CHANNELS,
  OTHER_VOLUME_MUL,
  SOUND_CHANNEL,
  type AudioChannel,
  type AudioSettings,
  type SoundId,
} from './types';

type PlayOpts = {
  mul?: number;
  channel?: AudioChannel;
  /** Превью микшера: без троттла карты и без «утки» чужих слотов. */
  preview?: boolean;
};

const SAMPLE_BASE = '/audio/sfx';
/** Бамп при смене wav — иначе браузер держит старый force-cache. */
const SAMPLE_VER = '8';

/** Громкость слота поверх канала. */
const SLOT_GAIN: Partial<Record<SoundId, number>> = {
  card_play: 1.2,
  trick_won: 0.85,
  exact_south: 0.95,
  exact_other: 0.7,
  over_south: 0.8,
  under_south: 0.75,
  ui_tap: 0.7,
  your_turn_soft: 0.82,
  your_turn_nudge_short: 0.8,
  your_turn_nudge_long: 0.72,
  deal_results_fly: 0.7,
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let channelGain: Record<AudioChannel, GainNode> | null = null;
let settings: AudioSettings = loadAudioSettings();
let unlockBound = false;
/** iOS/Chrome: AC, созданный без жеста, часто нельзя resume — ждём первый тап. */
let gestured = false;
const listeners = new Set<(s: AudioSettings) => void>();
const buffers = new Map<SoundId, AudioBuffer>();
let loadPromise: Promise<void> | null = null;
let labOverridesApplied = false;

/** Активные голоса по слоту — чтобы карта не наслаивалась. */
const activeBySlot = new Map<SoundId, { src: AudioBufferSourceNode; gain: GainNode }>();
let lastCardPlayAt = 0;

function resetGraph(): void {
  ctx = null;
  master = null;
  channelGain = null;
  buffers.clear();
  loadPromise = null;
  labOverridesApplied = false;
}

function ensureGraph(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (ctx && ctx.state === 'closed') resetGraph();
  const AC =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  /* Без жеста не создаём — иначе iOS/WebView оставляют мёртвый suspended-контекст. */
  if (!ctx && !gestured) return null;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.connect(ctx.destination);
    channelGain = {} as Record<AudioChannel, GainNode>;
    for (const ch of AUDIO_CHANNELS) {
      const g = ctx.createGain();
      g.connect(master);
      channelGain[ch] = g;
    }
    applyGains();
  }
  return ctx;
}

function applyGains(): void {
  if (master) {
    master.gain.value = settings.enabled ? settings.masterVolume : 0;
  }
  if (!channelGain) return;
  for (const ch of AUDIO_CHANNELS) {
    const muted = !settings.enabled || settings.muted[ch];
    channelGain[ch].gain.value = muted ? 0 : settings.volume[ch];
  }
}

async function resumeCtx(c: AudioContext): Promise<void> {
  if (c.state === 'running' || c.state === 'closed') return;
  try {
    await c.resume();
  } catch {
    /* жест уже истёк — следующий тап повторит */
  }
}

async function applyLabSlotOverrides(c: AudioContext): Promise<void> {
  if (labOverridesApplied) return;
  labOverridesApplied = true;
  const slots = await loadAllLabSlots();
  await Promise.all(
    slots.map(async (slot) => {
      try {
        const raw = slot.wav instanceof Blob ? await slot.wav.arrayBuffer() : slot.wav;
        const buf = await c.decodeAudioData(raw.slice(0));
        buffers.set(slot.id, buf);
      } catch {
        /* битый черновик — оставить public wav */
      }
    }),
  );
}

/** Подставить WAV из лабы сразу в партию (без перезагрузки). */
export async function installGameSample(id: SoundId, wav: ArrayBuffer): Promise<void> {
  const c = ensureGraph();
  if (!c) return;
  await resumeCtx(c);
  try {
    const buf = await c.decodeAudioData(wav.slice(0));
    buffers.set(id, buf);
  } catch {
    /* ignore */
  }
}

async function ensureSamples(c: AudioContext): Promise<void> {
  const ids = Object.keys(SOUND_CHANNEL) as SoundId[];
  if (buffers.size >= ids.length) {
    await applyLabSlotOverrides(c);
    return;
  }
  if (loadPromise) {
    await loadPromise;
    return;
  }
  loadPromise = (async () => {
    await Promise.all(
      ids.map(async (id) => {
        if (buffers.has(id)) return;
        try {
          const res = await fetch(`${SAMPLE_BASE}/${id}.wav?v=${SAMPLE_VER}`, { cache: 'no-store' });
          if (!res.ok) return;
          const raw = await res.arrayBuffer();
          const buf = await c.decodeAudioData(raw.slice(0));
          buffers.set(id, buf);
        } catch {
          /* fallback synth */
        }
      }),
    );
    await applyLabSlotOverrides(c);
  })();
  try {
    await loadPromise;
  } finally {
    loadPromise = null;
  }
}

function noteGesture(): void {
  try {
    if (typeof navigator !== 'undefined' && navigator.userActivation?.isActive) {
      gestured = true;
    }
  } catch {
    /* Safari без UserActivation */
  }
}

function bindUnlock(): void {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const onGesture = () => {
    gestured = true;
    unlockAudio();
  };
  window.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  window.addEventListener('touchstart', onGesture, { capture: true, passive: true });
  window.addEventListener('keydown', onGesture, { capture: true });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && gestured) unlockAudio();
  });
  window.addEventListener('pageshow', () => {
    if (gestured) unlockAudio();
  });
  window.addEventListener('focus', () => {
    if (gestured) unlockAudio();
  });
}

/** Поднять AudioContext после жеста / возврата на вкладку / «Продолжить». */
export function unlockAudio(): void {
  bindUnlock();
  noteGesture();
  const c = ensureGraph();
  if (!c) return;
  void resumeCtx(c);
  if (buffers.size < Object.keys(SOUND_CHANNEL).length) {
    void ensureSamples(c);
  }
}

export function playSound(id: SoundId, opts?: PlayOpts): void {
  bindUnlock();
  noteGesture();
  const c = ensureGraph();
  if (!c || !channelGain) return;

  const ch = opts?.channel ?? SOUND_CHANNEL[id];
  if (!settings.enabled || settings.muted[ch]) return;

  const mul = opts?.mul ?? 1;
  if (mul <= 0) return;

  const run = () => {
    if (!channelGain) return;
    const dest = channelGain[ch];
    if (playBuffer(c, id, dest, mul, opts?.preview === true)) return;
    /* fallback synth, пока сэмплы грузятся */
    const voice = c.createGain();
    voice.gain.value = Math.min(1.4, Math.max(0, mul * (SLOT_GAIN[id] ?? 1)));
    voice.connect(dest);
    playSynthSound(c, voice, id);
    window.setTimeout(() => {
      try {
        voice.disconnect();
      } catch {
        /* ignore */
      }
    }, 7000);
  };

  const kick = async () => {
    await resumeCtx(c);
    await ensureSamples(c);
    run();
  };

  if (c.state !== 'running' || !buffers.has(id)) {
    void kick();
  } else {
    run();
  }
}

function stopSlot(id: SoundId): void {
  const cur = activeBySlot.get(id);
  if (!cur || !ctx) return;
  try {
    const t = ctx.currentTime;
    cur.gain.gain.cancelScheduledValues(t);
    cur.gain.gain.setValueAtTime(Math.max(0.0001, cur.gain.gain.value), t);
    cur.gain.gain.linearRampToValueAtTime(0.0001, t + 0.04);
    cur.src.stop(t + 0.05);
  } catch {
    /* ignore */
  }
  activeBySlot.delete(id);
}

function playBuffer(
  c: AudioContext,
  id: SoundId,
  dest: AudioNode,
  mul: number,
  preview = false,
): boolean {
  const buf = buffers.get(id);
  if (!buf || !channelGain) return false;

  /* Карта: не чаще 90мс и всегда один голос */
  if (id === 'card_play' && !preview) {
    const now = performance.now();
    if (now - lastCardPlayAt < 90) return true;
    lastCardPlayAt = now;
    stopSlot('card_play');
  }

  /* Взятка / ровно — дать карте короткий удар, потом приглушить этот же голос */
  if (
    !preview &&
    (id === 'trick_won' || id === 'exact_south' || id === 'exact_other' || id === 'over_south')
  ) {
    const victim = activeBySlot.get('card_play');
    if (victim) {
      window.setTimeout(() => {
        const cur = activeBySlot.get('card_play');
        if (cur && cur.src === victim.src) stopSlot('card_play');
      }, 70);
    }
  }
  if (!preview && id === 'deal_results_fly') {
    stopSlot('card_play');
  }

  const voice = c.createGain();
  const slotGain = SLOT_GAIN[id] ?? 1;
  voice.gain.value = Math.min(1.4, Math.max(0, mul * slotGain));
  voice.connect(dest);

  const src = c.createBufferSource();
  src.buffer = buf;
  src.connect(voice);
  src.onended = () => {
    if (activeBySlot.get(id)?.src === src) activeBySlot.delete(id);
    try {
      voice.disconnect();
    } catch {
      /* ignore */
    }
  };
  activeBySlot.set(id, { src, gain: voice });
  src.start();
  return true;
}

export function getAudioSettings(): AudioSettings {
  return settings;
}

export function subscribeAudioSettings(fn: (s: AudioSettings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setAudioSettings(next: AudioSettings): void {
  settings = next;
  saveAudioSettings(next);
  ensureGraph();
  applyGains();
  listeners.forEach((fn) => fn(settings));
}

export function stopNudgeSounds(): void {
  stopSlot('your_turn_soft');
  stopSlot('your_turn_nudge_long');
  stopSlot('your_turn_nudge_short');
}

let volumePreview: { src: AudioBufferSourceNode; gain: GainNode; id: SoundId } | null = null;
let volumePreviewSynthTimer = 0;
let volumePreviewGen = 0;

export function stopVolumePreview(): void {
  volumePreviewGen += 1;
  if (volumePreviewSynthTimer) {
    window.clearInterval(volumePreviewSynthTimer);
    volumePreviewSynthTimer = 0;
  }
  if (!volumePreview) return;
  try {
    volumePreview.src.stop();
    volumePreview.gain.disconnect();
  } catch {
    /* ignore */
  }
  volumePreview = null;
}

/** Зацикленное превью, пока двигают ползунок громкости. */
export function startVolumePreview(id: SoundId, opts?: PlayOpts): void {
  if (volumePreview?.id === id) return;
  stopVolumePreview();
  bindUnlock();
  noteGesture();
  const c = ensureGraph();
  if (!c || !channelGain) return;
  const ch = opts?.channel ?? SOUND_CHANNEL[id];
  if (!settings.enabled || settings.muted[ch]) return;
  const mul = opts?.mul ?? 1;
  const gen = volumePreviewGen;

  const start = () => {
    if (gen !== volumePreviewGen) return;
    if (!channelGain) return;
    const dest = channelGain[ch];
    const buf = buffers.get(id);
    if (buf) {
      const voice = c.createGain();
      voice.gain.value = Math.min(1.4, Math.max(0, mul * (SLOT_GAIN[id] ?? 1)));
      voice.connect(dest);
      const src = c.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.connect(voice);
      src.start();
      volumePreview = { src, gain: voice, id };
      return;
    }
    playSound(id, { ...opts, preview: true });
    volumePreviewSynthTimer = window.setInterval(() => {
      if (gen !== volumePreviewGen) return;
      playSound(id, { ...opts, preview: true });
    }, 450);
  };

  void resumeCtx(c)
    .then(() => ensureSamples(c))
    .then(start);
}

export function stopAllSounds(): void {
  stopVolumePreview();
  for (const id of [...activeBySlot.keys()]) stopSlot(id);
}

/** Превью в микшере: глушим стол и играем один семпл, без наслоения. */
export function playPreviewSound(id: SoundId, opts?: PlayOpts): void {
  stopAllSounds();
  lastCardPlayAt = 0;
  playSound(id, { ...opts, preview: true });
}

export function playOtherSound(id: SoundId): void {
  playSound(id, { mul: OTHER_VOLUME_MUL, channel: 'others' });
}

export function playUiTap(): void {
  playSound('ui_tap');
}

export function playIllegal(): void {
  playSound('illegal');
}

export function playCardPlaySouth(): void {
  stopNudgeSounds();
  playSound('card_play');
}

export function initAudioSubsystem(): void {
  bindUnlock();
  settings = loadAudioSettings();
}
