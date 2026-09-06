/**
 * Простой снимок комнат на диск — переживает рестарт процесса.
 * Не БД: один JSON, debounce, prune finished / stale waiting / idle playing.
 * Авто-ротация копий в подпапке backups/ — техдиру не нужен ручной cron.
 */

import {
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
  existsSync,
  readdirSync,
  unlinkSync,
  copyFileSync,
  writeFile,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameRoomRow } from './protocol.js';
import type { RoomStore } from './rooms.js';
import { slimRoomForPersist } from './stateView.js';

const PERSIST_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_BACKUP_EVERY_MS = 10 * 60 * 1000;
const DEFAULT_BACKUP_KEEP = 24;

/** Finished: 2ч (раньше 24ч — копились в JSON и мешали). */
export const FINISHED_MAX_AGE_MS = 2 * 60 * 60 * 1000;
/** Public/private waiting без активности — мусор зала столов. */
export const WAITING_MAX_AGE_MS = 90 * 60 * 1000;
/** Playing без апдейтов — брошенная / зависшая партия. */
export const PLAYING_MAX_AGE_MS = 8 * 60 * 60 * 1000;
/** Как часто гонять prune (не только hourly). */
const DEFAULT_PRUNE_EVERY_MS = 15 * 60 * 1000;

type SnapshotFile = {
  version: number;
  savedAt: string;
  rooms: GameRoomRow[];
};

function defaultPersistPath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../data/rooms.json');
}

export function resolveRoomPersistPath(): string {
  const fromEnv = (process.env.ROOM_PERSIST_PATH ?? '').trim();
  if (fromEnv) return resolve(fromEnv);
  return defaultPersistPath();
}

export function isRoomPersistEnabled(): boolean {
  const v = (process.env.ROOM_PERSIST ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'off' && v !== 'no';
}

function readBackupKeep(): number {
  const raw = Number(process.env.ROOM_BACKUP_KEEP ?? '');
  if (Number.isFinite(raw) && raw >= 0) return Math.floor(raw);
  return DEFAULT_BACKUP_KEEP;
}

function readBackupEveryMs(): number {
  const raw = Number(process.env.ROOM_BACKUP_EVERY_MS ?? '');
  if (Number.isFinite(raw) && raw >= 60_000) return Math.floor(raw);
  return DEFAULT_BACKUP_EVERY_MS;
}

export class RoomPersist {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private backupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly path: string;
  private readonly debounceMs: number;
  private readonly backupKeep: number;
  private readonly backupEveryMs: number;
  private lastBackupFingerprint = '';
  private writeBusy = false;
  private writeQueued = false;
  private writeSeq = 0;

  constructor(
    private readonly store: RoomStore,
    opts?: { path?: string; debounceMs?: number },
  ) {
    this.path = opts?.path ?? resolveRoomPersistPath();
    this.debounceMs = opts?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.backupKeep = readBackupKeep();
    this.backupEveryMs = readBackupEveryMs();
  }

  get filePath(): string {
    return this.path;
  }

  private backupDir(): string {
    return join(dirname(this.path), 'backups');
  }

  private runPrune(label: string): number {
    const counts = this.store.pruneStale({
      finishedMaxAgeMs: FINISHED_MAX_AGE_MS,
      waitingMaxAgeMs: WAITING_MAX_AGE_MS,
      playingMaxAgeMs: PLAYING_MAX_AGE_MS,
    });
    const n = counts.finished + counts.waiting + counts.playing;
    if (n > 0) {
      console.log(
        `[room-persist] ${label}: −${n} (finished ${counts.finished}, waiting ${counts.waiting}, playing ${counts.playing})`,
      );
    }
    return n;
  }

  load(): number {
    if (!existsSync(this.path)) return 0;
    try {
      const raw = readFileSync(this.path, 'utf8');
      const data = JSON.parse(raw) as SnapshotFile;
      if (!data || !Array.isArray(data.rooms)) return 0;
      const n = this.store.hydrate(data.rooms);
      const pruned = this.runPrune('load prune');
      if (pruned > 0) this.flushSync();
      return n;
    } catch (e) {
      console.warn('[room-persist] load failed:', e instanceof Error ? e.message : e);
      return 0;
    }
  }

  schedule(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushAsync();
    }, this.debounceMs);
  }

  private roomsPayload(): SnapshotFile {
    return {
      version: PERSIST_VERSION,
      savedAt: new Date().toISOString(),
      rooms: this.store.listAll().map(slimRoomForPersist),
    };
  }

  private finishWrite(): void {
    this.writeBusy = false;
    if (this.writeQueued) {
      this.writeQueued = false;
      this.flushAsync();
    }
  }

  /** Не блокируем event loop на каждый ход — иначе Wi‑Fi-сокеты отваливаются у всех сразу. */
  flushAsync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.writeBusy) {
      this.writeQueued = true;
      return;
    }
    this.writeBusy = true;
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.${++this.writeSeq}.tmp`;
      writeFile(tmp, JSON.stringify(this.roomsPayload()), 'utf8', (err) => {
        if (err) {
          console.warn('[room-persist] save failed:', err.message);
          this.finishWrite();
          return;
        }
        try {
          renameSync(tmp, this.path);
        } catch (e) {
          try {
            unlinkSync(tmp);
          } catch {
            /* ignore */
          }
          console.warn('[room-persist] rename failed:', e instanceof Error ? e.message : e);
        }
        this.finishWrite();
      });
    } catch (e) {
      console.warn('[room-persist] save failed:', e instanceof Error ? e.message : e);
      this.finishWrite();
    }
  }

  flushSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const tmp = `${this.path}.${process.pid}.${++this.writeSeq}.tmp`;
      writeFileSync(tmp, JSON.stringify(this.roomsPayload()), 'utf8');
      renameSync(tmp, this.path);
    } catch (e) {
      console.warn('[room-persist] save failed:', e instanceof Error ? e.message : e);
    }
  }

  /** Копия актуального снимка в backups/; без изменений файла — no-op. */
  rotateBackup(label = 'interval'): void {
    if (this.backupKeep <= 0) return;
    if (!existsSync(this.path)) return;
    try {
      const raw = readFileSync(this.path, 'utf8');
      const fingerprint = `${raw.length}:${raw.slice(0, 64)}:${raw.slice(-64)}`;
      if (fingerprint === this.lastBackupFingerprint && label === 'interval') return;
      const dir = this.backupDir();
      mkdirSync(dir, { recursive: true });
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const dest = join(dir, `rooms-${stamp}.json`);
      copyFileSync(this.path, dest);
      this.lastBackupFingerprint = fingerprint;
      this.pruneBackupFiles(dir);
      console.log(`[room-persist] backup ${label}: ${dest}`);
    } catch (e) {
      console.warn('[room-persist] backup failed:', e instanceof Error ? e.message : e);
    }
  }

  private pruneBackupFiles(dir: string): void {
    let files: string[];
    try {
      files = readdirSync(dir)
        .filter((f) => f.startsWith('rooms-') && f.endsWith('.json'))
        .sort();
    } catch {
      return;
    }
    const excess = files.length - this.backupKeep;
    if (excess <= 0) return;
    for (let i = 0; i < excess; i++) {
      try {
        unlinkSync(join(dir, files[i]!));
      } catch {
        /* ignore */
      }
    }
  }

  startPruneInterval(everyMs = DEFAULT_PRUNE_EVERY_MS): void {
    setInterval(() => {
      const n = this.runPrune('interval prune');
      if (n > 0) this.flushSync();
    }, everyMs).unref?.();
  }

  startBackupInterval(): void {
    if (this.backupKeep <= 0) return;
    this.rotateBackup('startup');
    this.backupTimer = setInterval(() => this.rotateBackup('interval'), this.backupEveryMs);
    this.backupTimer.unref?.();
    console.log(
      `[room-persist] auto-backup every ${Math.round(this.backupEveryMs / 60000)}m, keep ${this.backupKeep} → ${this.backupDir()}`,
    );
  }
}
