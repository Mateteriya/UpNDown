/**
 * Облачный синк лабы (аккорды + пресеты) через Supabase.
 * Локально — источник правды для офлайна; при логине — merge по updatedAt.
 */

import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import {
  deleteLabChordPreset,
  loadLabChordPresets,
  replaceLabChordPresets,
  upsertLabChordPreset,
} from './chordStore';
import { loadLabPresets, upsertLabPreset, type UpsertLabPresetInput } from './presetStore';
import type { LabChordPreset, LabPreset } from './types';

type RemoteChordRow = {
  client_id: string;
  name: string;
  midis: number[];
  updated_at: string;
};

type RemotePresetRow = {
  client_id: string;
  name: string;
  kind: string;
  payload: LabPreset;
  updated_at: string;
};

function tsMs(iso: string | undefined | null): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
}

function chordToRemote(c: LabChordPreset): Omit<RemoteChordRow, 'updated_at'> & { updated_at: string } {
  return {
    client_id: c.id,
    name: c.name,
    midis: c.midis,
    updated_at: new Date(c.updatedAt).toISOString(),
  };
}

/** Слить локальные и удалённые аккорды (last-write-wins по updatedAt). */
export function mergeChordLists(
  local: LabChordPreset[],
  remote: LabChordPreset[],
): LabChordPreset[] {
  const map = new Map<string, LabChordPreset>();
  for (const c of local) map.set(c.id, c);
  for (const c of remote) {
    const prev = map.get(c.id);
    if (!prev || c.updatedAt >= prev.updatedAt) map.set(c.id, c);
  }
  return [...map.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function pullLabChordsFromCloud(userId: string): Promise<LabChordPreset[]> {
  if (!supabase || !isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('lab_chord_presets')
    .select('client_id, name, midis, updated_at')
    .eq('user_id', userId);
  if (error || !data) {
    if (error) console.warn('[labCloud] pull chords', error.message);
    return [];
  }
  return (data as RemoteChordRow[])
    .map((r) => ({
      id: r.client_id,
      name: r.name,
      midis: Array.isArray(r.midis) ? r.midis.map(Number) : [],
      updatedAt: tsMs(r.updated_at),
    }))
    .filter((c) => c.midis.length >= 2);
}

export async function pushLabChordToCloud(userId: string, chord: LabChordPreset): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured()) return false;
  const row = chordToRemote(chord);
  const { error } = await supabase.from('lab_chord_presets').upsert(
    {
      user_id: userId,
      ...row,
    },
    { onConflict: 'user_id,client_id' },
  );
  if (error) {
    console.warn('[labCloud] push chord', error.message);
    return false;
  }
  return true;
}

export async function deleteLabChordFromCloud(userId: string, clientId: string): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured()) return false;
  const { error } = await supabase
    .from('lab_chord_presets')
    .delete()
    .eq('user_id', userId)
    .eq('client_id', clientId);
  if (error) {
    console.warn('[labCloud] delete chord', error.message);
    return false;
  }
  return true;
}

/** Полный sync аккордов: pull → merge → write local → push winners. */
export async function syncLabChordsWithCloud(userId: string): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  if (!supabase || !isSupabaseConfigured()) {
    return { ok: false, count: loadLabChordPresets().length, error: 'Supabase не настроен' };
  }
  try {
    const remote = await pullLabChordsFromCloud(userId);
    const local = loadLabChordPresets();
    const merged = mergeChordLists(local, remote);
    replaceLabChordPresets(merged);

    for (const c of merged) {
      const rem = remote.find((r) => r.id === c.id);
      if (!rem || c.updatedAt > rem.updatedAt) {
        await pushLabChordToCloud(userId, c);
      }
    }
    return { ok: true, count: merged.length };
  } catch (e) {
    return {
      ok: false,
      count: loadLabChordPresets().length,
      error: e instanceof Error ? e.message : 'sync failed',
    };
  }
}

/** Сохранить аккорд локально + в облако (если залогинены). */
export async function saveLabChordEverywhere(
  input: { id?: string; name: string; midis: number[] },
  userId: string | null | undefined,
): Promise<LabChordPreset | null> {
  const saved = upsertLabChordPreset(input);
  if (!saved) return null;
  if (userId) void pushLabChordToCloud(userId, saved);
  return saved;
}

export async function removeLabChordEverywhere(
  id: string,
  userId: string | null | undefined,
): Promise<void> {
  deleteLabChordPreset(id);
  if (userId) void deleteLabChordFromCloud(userId, id);
}

/* ——— Пресеты лабы (музыка/SFX) ——— */

export async function pullLabPresetsFromCloud(userId: string): Promise<LabPreset[]> {
  if (!supabase || !isSupabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('lab_music_presets')
    .select('client_id, name, kind, payload, updated_at')
    .eq('user_id', userId);
  if (error || !data) {
    if (error) console.warn('[labCloud] pull presets', error.message);
    return [];
  }
  return (data as RemotePresetRow[])
    .map((r) => {
      const p = r.payload;
      if (!p || typeof p !== 'object') return null;
      return {
        ...p,
        id: r.client_id,
        name: r.name || p.name,
        kind: (r.kind as LabPreset['kind']) || p.kind || 'sfx',
        updatedAt: tsMs(r.updated_at) || p.updatedAt || Date.now(),
      } as LabPreset;
    })
    .filter((p): p is LabPreset => !!p && typeof p.id === 'string' && !!p.voice);
}

export async function pushLabPresetToCloud(userId: string, preset: LabPreset): Promise<boolean> {
  if (!supabase || !isSupabaseConfigured()) return false;
  const { error } = await supabase.from('lab_music_presets').upsert(
    {
      user_id: userId,
      client_id: preset.id,
      name: preset.name,
      kind: preset.kind ?? 'sfx',
      payload: preset,
      updated_at: new Date(preset.updatedAt || Date.now()).toISOString(),
    },
    { onConflict: 'user_id,client_id' },
  );
  if (error) {
    console.warn('[labCloud] push preset', error.message);
    return false;
  }
  return true;
}

export function mergePresetLists(local: LabPreset[], remote: LabPreset[]): LabPreset[] {
  const map = new Map<string, LabPreset>();
  for (const p of local) map.set(p.id, p);
  for (const p of remote) {
    const prev = map.get(p.id);
    if (!prev || (p.updatedAt ?? 0) >= (prev.updatedAt ?? 0)) map.set(p.id, p);
  }
  return [...map.values()].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}

export async function syncLabPresetsWithCloud(userId: string): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  if (!supabase || !isSupabaseConfigured()) {
    return { ok: false, count: loadLabPresets().length, error: 'Supabase не настроен' };
  }
  try {
    const remote = await pullLabPresetsFromCloud(userId);
    const local = loadLabPresets();
    const merged = mergePresetLists(local, remote);
    /* Перезаписываем через upsert каждого — presetStore не имеет replaceAll */
    for (const p of merged) {
      const input: UpsertLabPresetInput = {
        id: p.id,
        name: p.name,
        voice: p.voice,
        phrase: p.phrase,
        slotHint: p.slotHint,
        chordMidis: p.chordMidis,
        lastMidi: p.lastMidi,
        kind: p.kind,
        musicSlot: p.musicSlot,
        beat: p.beat,
        pad: p.pad,
        layers: p.layers,
        session: p.session,
        updatedAt: p.updatedAt,
      };
      const saved = upsertLabPreset(input);
      const rem = remote.find((r) => r.id === p.id);
      if (!rem || (saved.updatedAt ?? 0) > (rem.updatedAt ?? 0)) {
        await pushLabPresetToCloud(userId, saved);
      }
    }
    return { ok: true, count: merged.length };
  } catch (e) {
    return {
      ok: false,
      count: loadLabPresets().length,
      error: e instanceof Error ? e.message : 'sync failed',
    };
  }
}

/** Вход в лабу: синк аккордов + пресетов. */
export async function syncLabLibraryWithCloud(userId: string): Promise<{
  chords: number;
  presets: number;
  ok: boolean;
  message: string;
}> {
  const [ch, pr] = await Promise.all([
    syncLabChordsWithCloud(userId),
    syncLabPresetsWithCloud(userId),
  ]);
  const ok = ch.ok && pr.ok;
  const parts = [
    ch.ok ? `аккорды: ${ch.count}` : `аккорды: локально (${ch.error ?? 'нет облака'})`,
    pr.ok ? `пресеты: ${pr.count}` : `пресеты: локально (${pr.error ?? 'нет облака'})`,
  ];
  return {
    ok,
    chords: ch.count,
    presets: pr.count,
    message: parts.join(' · '),
  };
}

export type LabCloudInspect = {
  ok: boolean;
  localChords: number;
  localPresets: number;
  cloudChords: number;
  cloudPresets: number;
  cloudChordsLatestAt: string | null;
  cloudPresetsLatestAt: string | null;
  error?: string;
};

function maxIso(rows: { updated_at?: string | null }[] | null): string | null {
  if (!rows?.length) return null;
  let best = 0;
  let iso: string | null = null;
  for (const r of rows) {
    const t = tsMs(r.updated_at);
    if (t >= best) {
      best = t;
      iso = r.updated_at ?? null;
    }
  }
  return iso;
}

/** Снимок облака без merge — для отчёта «последние синхронизации». */
export async function inspectLabCloudSync(userId: string): Promise<LabCloudInspect> {
  const localChords = loadLabChordPresets().length;
  const localPresets = loadLabPresets().length;
  if (!supabase || !isSupabaseConfigured()) {
    return {
      ok: false,
      localChords,
      localPresets,
      cloudChords: 0,
      cloudPresets: 0,
      cloudChordsLatestAt: null,
      cloudPresetsLatestAt: null,
      error: 'Supabase не настроен',
    };
  }
  try {
    const [chordRes, presetRes] = await Promise.all([
      supabase.from('lab_chord_presets').select('updated_at').eq('user_id', userId),
      supabase.from('lab_music_presets').select('updated_at').eq('user_id', userId),
    ]);
    if (chordRes.error || presetRes.error) {
      return {
        ok: false,
        localChords,
        localPresets,
        cloudChords: 0,
        cloudPresets: 0,
        cloudChordsLatestAt: null,
        cloudPresetsLatestAt: null,
        error: chordRes.error?.message ?? presetRes.error?.message ?? 'ошибка запроса',
      };
    }
    return {
      ok: true,
      localChords,
      localPresets,
      cloudChords: chordRes.data?.length ?? 0,
      cloudPresets: presetRes.data?.length ?? 0,
      cloudChordsLatestAt: maxIso(chordRes.data),
      cloudPresetsLatestAt: maxIso(presetRes.data),
    };
  } catch (e) {
    return {
      ok: false,
      localChords,
      localPresets,
      cloudChords: 0,
      cloudPresets: 0,
      cloudChordsLatestAt: null,
      cloudPresetsLatestAt: null,
      error: e instanceof Error ? e.message : 'inspect failed',
    };
  }
}
