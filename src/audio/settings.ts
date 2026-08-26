import {
  AUDIO_CHANNELS,
  AUDIO_SETTINGS_STORAGE_KEY,
  DEFAULT_AUDIO_SETTINGS,
  type AudioChannel,
  type AudioSettings,
} from './types';

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(1, Math.max(0, n));
}

type Stored = {
  enabled?: boolean;
  masterVolume?: number;
  muted?: Partial<Record<string, boolean>>;
  volume?: Partial<Record<string, number>>;
};

function channelMuted(stored: Stored, ch: AudioChannel): boolean {
  if (stored.muted?.[ch] != null) return !!stored.muted[ch];
  /* v1: один канал table → и свои, и стол */
  if ((ch === 'mine' || ch === 'others') && stored.muted?.table != null) {
    return !!stored.muted.table;
  }
  return DEFAULT_AUDIO_SETTINGS.muted[ch];
}

function channelVolume(stored: Stored, ch: AudioChannel): number {
  if (stored.volume?.[ch] != null) return clamp01(Number(stored.volume[ch]));
  if ((ch === 'mine' || ch === 'others') && stored.volume?.table != null) {
    return clamp01(Number(stored.volume.table));
  }
  return DEFAULT_AUDIO_SETTINGS.volume[ch];
}

export function loadAudioSettings(): AudioSettings {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY) : null;
    if (!raw) return structuredClone(DEFAULT_AUDIO_SETTINGS);
    const parsed = JSON.parse(raw) as Stored;
    const muted = {} as Record<AudioChannel, boolean>;
    const volume = {} as Record<AudioChannel, number>;
    for (const ch of AUDIO_CHANNELS) {
      muted[ch] = channelMuted(parsed, ch);
      volume[ch] = channelVolume(parsed, ch);
    }
    return {
      enabled: parsed.enabled !== false,
      masterVolume: clamp01(parsed.masterVolume ?? DEFAULT_AUDIO_SETTINGS.masterVolume),
      muted,
      volume,
    };
  } catch {
    return structuredClone(DEFAULT_AUDIO_SETTINGS);
  }
}

export function saveAudioSettings(settings: AudioSettings): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    /* ignore */
  }
}

export function patchAudioSettings(
  prev: AudioSettings,
  patch: Partial<{
    enabled: boolean;
    masterVolume: number;
    muted: Partial<Record<AudioChannel, boolean>>;
    volume: Partial<Record<AudioChannel, number>>;
  }>,
): AudioSettings {
  const muted = { ...prev.muted };
  const volume = { ...prev.volume };
  if (patch.muted) {
    for (const ch of AUDIO_CHANNELS) {
      if (patch.muted[ch] != null) muted[ch] = !!patch.muted[ch];
    }
  }
  if (patch.volume) {
    for (const ch of AUDIO_CHANNELS) {
      const v = patch.volume[ch];
      if (v != null) volume[ch] = clamp01(v);
    }
  }
  return {
    enabled: patch.enabled ?? prev.enabled,
    masterVolume: clamp01(patch.masterVolume ?? prev.masterVolume),
    muted,
    volume,
  };
}
