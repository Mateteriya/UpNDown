import {
  LAB_CHORD_MAX,
  LAB_CHORD_PRESETS_STORAGE_KEY,
  type LabChordPreset,
} from './types';

function uid(): string {
  return `ch_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMidis(midis: number[]): number[] {
  const uniq = [...new Set(midis.map((m) => Math.round(m)))].sort((a, b) => a - b);
  return uniq.slice(0, LAB_CHORD_MAX);
}

export function loadLabChordPresets(): LabChordPreset[] {
  try {
    const raw = localStorage.getItem(LAB_CHORD_PRESETS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LabChordPreset[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (c) =>
          c &&
          typeof c.id === 'string' &&
          typeof c.name === 'string' &&
          Array.isArray(c.midis) &&
          c.midis.length >= 2,
      )
      .map((c) => ({
        id: c.id,
        name: c.name.trim() || 'Аккорд',
        midis: normalizeMidis(c.midis),
        updatedAt: typeof c.updatedAt === 'number' ? c.updatedAt : Date.now(),
      }))
      .filter((c) => c.midis.length >= 2);
  } catch {
    return [];
  }
}

function saveAll(list: LabChordPreset[]): void {
  try {
    localStorage.setItem(LAB_CHORD_PRESETS_STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

export type UpsertLabChordInput = {
  id?: string;
  name: string;
  midis: number[];
};

export function upsertLabChordPreset(input: UpsertLabChordInput): LabChordPreset | null {
  const midis = normalizeMidis(input.midis);
  if (midis.length < 2) return null;
  const name = input.name.trim() || midis.map(String).join('-');
  const list = loadLabChordPresets();
  const now = Date.now();
  const idx = input.id ? list.findIndex((c) => c.id === input.id) : -1;
  if (idx >= 0) {
    const next: LabChordPreset = { ...list[idx]!, name, midis, updatedAt: now };
    list[idx] = next;
    saveAll(list);
    return next;
  }
  const created: LabChordPreset = { id: uid(), name, midis, updatedAt: now };
  list.unshift(created);
  saveAll(list);
  return created;
}

/** Заменить весь список (после merge с облаком). */
export function replaceLabChordPresets(list: LabChordPreset[]): void {
  saveAll(
    list
      .map((c) => ({
        id: c.id,
        name: (c.name || 'Аккорд').trim(),
        midis: normalizeMidis(c.midis),
        updatedAt: c.updatedAt || Date.now(),
      }))
      .filter((c) => c.midis.length >= 2),
  );
}

export function deleteLabChordPreset(id: string): void {
  saveAll(loadLabChordPresets().filter((c) => c.id !== id));
}
