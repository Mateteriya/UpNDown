import {
  DEFAULT_LAB_VOICE,
  LAB_PRESETS_STORAGE_KEY,
  type LabPreset,
  type LabVoiceParams,
} from './types';

function uid(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function loadLabPresets(): LabPreset[] {
  try {
    const raw = localStorage.getItem(LAB_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((p) => p && typeof p.id === 'string' && p.voice);
  } catch {
    return [];
  }
}

function saveAll(presets: LabPreset[]): void {
  try {
    localStorage.setItem(LAB_PRESETS_STORAGE_KEY, JSON.stringify(presets));
  } catch {
    /* ignore */
  }
}

export function upsertLabPreset(
  input: {
    id?: string;
    name: string;
    voice: LabVoiceParams;
    phrase: LabPreset['phrase'];
    slotHint?: string;
    chordMidis?: number[];
    lastMidi?: number;
  },
): LabPreset {
  const list = loadLabPresets();
  const now = Date.now();
  const idx = input.id
    ? list.findIndex((p) => p.id === input.id)
    : input.slotHint
      ? list.findIndex((p) => p.slotHint === input.slotHint)
      : -1;
  if (idx >= 0) {
    const next: LabPreset = {
      ...list[idx]!,
      name: input.name,
      voice: input.voice,
      phrase: input.phrase,
      slotHint: input.slotHint,
      chordMidis: input.chordMidis,
      lastMidi: input.lastMidi,
      updatedAt: now,
    };
    list[idx] = next;
    saveAll(list);
    return next;
  }
  const created: LabPreset = {
    id: uid(),
    name: input.name,
    voice: input.voice,
    phrase: input.phrase,
    slotHint: input.slotHint,
    chordMidis: input.chordMidis,
    lastMidi: input.lastMidi,
    updatedAt: now,
  };
  list.unshift(created);
  saveAll(list);
  return created;
}

export function deleteLabPreset(id: string): void {
  saveAll(loadLabPresets().filter((p) => p.id !== id));
}

export function exportPresetJson(preset: LabPreset): void {
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${preset.name.replace(/[^\w\-а-яё]+/gi, '_') || 'preset'}.json`;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function cloneDefaultVoice(): LabVoiceParams {
  return { ...DEFAULT_LAB_VOICE };
}
