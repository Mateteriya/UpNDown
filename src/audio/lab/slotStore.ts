import type { SoundId } from '../types';
import type { LabPhraseNote, LabVoiceParams } from './types';

const DB_NAME = 'updown_lab_slots_v1';
const STORE = 'slots';
const DB_VER = 1;

/** То, что реально сохранили для слота: WAV + крутилки, чтобы вернуться и доделать. */
export type LabSlotRecord = {
  id: SoundId;
  wav: Blob;
  voice: LabVoiceParams;
  phrase: LabPhraseNote[];
  chordMidis: number[];
  lastMidi: number;
  savedAt: number;
};

function asWavBlob(wav: ArrayBuffer | Blob): Blob {
  return wav instanceof Blob ? wav : new Blob([wav], { type: 'audio/wav' });
}

function normalizeSlot(raw: LabSlotRecord | undefined): LabSlotRecord | null {
  if (!raw || !raw.id || !raw.wav) return null;
  return { ...raw, wav: asWavBlob(raw.wav) };
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('indexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('idb open failed'));
  });
}

export async function saveLabSlot(
  record: Omit<LabSlotRecord, 'wav'> & { wav: ArrayBuffer | Blob },
): Promise<void> {
  const db = await openDb();
  const stored: LabSlotRecord = { ...record, wav: asWavBlob(record.wav) };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('idb write failed'));
    tx.objectStore(STORE).put(stored);
  });
}

export async function loadLabSlot(id: SoundId): Promise<LabSlotRecord | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(normalizeSlot(req.result as LabSlotRecord | undefined));
      req.onerror = () => reject(req.error ?? new Error('idb read failed'));
    });
  } catch {
    return null;
  }
}

export async function listLabSlotIds(): Promise<SoundId[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAllKeys();
      req.onsuccess = () => resolve((req.result as SoundId[]) ?? []);
      req.onerror = () => reject(req.error ?? new Error('idb keys failed'));
    });
  } catch {
    return [];
  }
}

export async function deleteLabSlot(id: SoundId): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error ?? new Error('idb delete failed'));
      tx.objectStore(STORE).delete(id);
    });
  } catch {
    /* ignore */
  }
}

export async function loadAllLabSlots(): Promise<LabSlotRecord[]> {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () =>
        resolve(((req.result as LabSlotRecord[]) ?? []).map((s) => normalizeSlot(s)).filter((s): s is LabSlotRecord => !!s));
      req.onerror = () => reject(req.error ?? new Error('idb all failed'));
    });
  } catch {
    return [];
  }
}

/** Dev-only: Vite middleware пишет WAV сразу в public/audio/sfx. */
export async function writeSlotToDevServer(id: SoundId, wav: ArrayBuffer | Blob): Promise<boolean> {
  try {
    const res = await fetch(`/__updown_lab_sfx?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav instanceof Blob ? wav : new Blob([wav.slice(0)], { type: 'audio/wav' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Dev-only: пишет фоновую петлю в public/audio/music/{id}.wav */
export async function writeMusicSlotToDevServer(id: string, wav: ArrayBuffer | Blob): Promise<boolean> {
  try {
    const res = await fetch(`/__updown_lab_music?id=${encodeURIComponent(id)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'audio/wav' },
      body: wav instanceof Blob ? wav : new Blob([wav.slice(0)], { type: 'audio/wav' }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
