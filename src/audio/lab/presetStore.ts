import {
  DEFAULT_LAB_VOICE,
  LAB_PRESETS_STORAGE_KEY,
  LAB_SESSION_DRAFT_KEY,
  cloneLabBeatParams,
  cloneLabMelodyLayers,
  cloneLabMusicPad,
  cloneLabVoiceParams,
  type LabBeatParams,
  type LabMelodyLayer,
  type LabMusicPadParams,
  type LabMusicSessionSnapshot,
  type LabMusicSlotId,
  type LabPreset,
  type LabVoiceParams,
} from './types';

function uid(): string {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function deepClonePresetFields(input: UpsertLabPresetInput): {
  voice: LabVoiceParams;
  phrase: LabPreset['phrase'];
  beat?: LabBeatParams;
  pad?: LabMusicPadParams;
  layers?: LabMelodyLayer[];
  chordMidis?: number[];
  session?: LabMusicSessionSnapshot;
} {
  return {
    voice: cloneLabVoiceParams(input.voice),
    phrase: (input.phrase ?? []).map((n) => ({ ...n })),
    beat: input.beat ? cloneLabBeatParams(input.beat) : undefined,
    pad: input.pad ? cloneLabMusicPad(input.pad) : undefined,
    layers: input.layers ? cloneLabMelodyLayers(input.layers) : undefined,
    chordMidis: input.chordMidis ? [...input.chordMidis] : undefined,
    session: input.session ? { ...input.session } : undefined,
  };
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

export type UpsertLabPresetInput = {
  id?: string;
  name: string;
  voice: LabVoiceParams;
  phrase: LabPreset['phrase'];
  slotHint?: string;
  chordMidis?: number[];
  lastMidi?: number;
  kind?: 'sfx' | 'music';
  musicSlot?: LabMusicSlotId;
  beat?: LabBeatParams;
  pad?: LabMusicPadParams;
  layers?: LabMelodyLayer[];
  session?: LabMusicSessionSnapshot;
  /** Если задан — не перебивать updatedAt при sync с облака. */
  updatedAt?: number;
};

export function upsertLabPreset(input: UpsertLabPresetInput): LabPreset {
  const list = loadLabPresets();
  const now = input.updatedAt ?? Date.now();
  const kind = input.kind ?? 'sfx';
  const idx = input.id
    ? list.findIndex((p) => p.id === input.id)
    : kind === 'sfx' && input.slotHint
      ? list.findIndex((p) => (p.kind ?? 'sfx') === 'sfx' && p.slotHint === input.slotHint)
      : -1;
  const cloned = deepClonePresetFields(input);
  const patch: Partial<LabPreset> = {
    name: input.name,
    voice: cloned.voice,
    phrase: cloned.phrase,
    slotHint: input.slotHint,
    chordMidis: cloned.chordMidis,
    lastMidi: input.lastMidi,
    kind,
    musicSlot: input.musicSlot,
    beat: cloned.beat,
    pad: cloned.pad,
    layers: cloned.layers,
    session: cloned.session,
    updatedAt: now,
  };
  if (idx >= 0) {
    const next: LabPreset = { ...list[idx]!, ...patch };
    list[idx] = next;
    saveAll(list);
    return next;
  }
  const created: LabPreset = {
    id: input.id ?? uid(),
    name: input.name,
    voice: cloned.voice,
    phrase: cloned.phrase,
    slotHint: input.slotHint,
    chordMidis: cloned.chordMidis,
    lastMidi: input.lastMidi,
    kind,
    musicSlot: input.musicSlot,
    beat: cloned.beat,
    pad: cloned.pad,
    layers: cloned.layers,
    session: cloned.session,
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

export type LabSessionDraft = {
  voice: LabVoiceParams;
  beat: LabBeatParams;
  pad: LabMusicPadParams;
  layers: LabMelodyLayer[];
  musicSlot: LabMusicSlotId;
  labMode: 'sfx' | 'music';
  staffLayerId: string | null;
  beatOn: boolean;
  bakeBeat: boolean;
  focusArrange: boolean;
  keyboardOpen: boolean;
  /** Плавающая клавиатура «поверх». */
  keyboardFloat?: boolean;
  savedAt: number;
};

export function saveLabSessionDraft(draft: Omit<LabSessionDraft, 'savedAt'>): void {
  try {
    const payload: LabSessionDraft = {
      voice: cloneLabVoiceParams(draft.voice),
      beat: cloneLabBeatParams(draft.beat),
      pad: cloneLabMusicPad(draft.pad),
      layers: cloneLabMelodyLayers(draft.layers),
      musicSlot: draft.musicSlot,
      labMode: draft.labMode,
      staffLayerId: draft.staffLayerId,
      beatOn: draft.beatOn,
      bakeBeat: draft.bakeBeat,
      focusArrange: draft.focusArrange,
      keyboardOpen: draft.keyboardOpen,
      keyboardFloat: draft.keyboardFloat === true,
      savedAt: Date.now(),
    };
    localStorage.setItem(LAB_SESSION_DRAFT_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

export function loadLabSessionDraft(): LabSessionDraft | null {
  try {
    const raw = localStorage.getItem(LAB_SESSION_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LabSessionDraft;
    if (!parsed?.voice || !parsed?.beat) return null;
    return parsed;
  } catch {
    return null;
  }
}
