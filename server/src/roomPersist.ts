/**
 * Простой снимок комнат на диск — переживает рестарт процесса.
 * Не БД: один JSON, debounce, prune finished / stale waiting / idle playing.
 */

import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameRoomRow } from './protocol.js';
import type { RoomStore } from './rooms.js';

const PERSIST_VERSION = 1;
const DEFAULT_DEBOUNCE_MS = 500;

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

export class RoomPersist {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly path: string;
  private readonly debounceMs: number;

  constructor(
    private readonly store: RoomStore,
    opts?: { path?: string; debounceMs?: number },
  ) {
    this.path = opts?.path ?? resolveRoomPersistPath();
    this.debounceMs = opts?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  }

  get filePath(): string {
    return this.path;
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
      this.flushSync();
    }, this.debounceMs);
  }

  flushSync(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    try {
      mkdirSync(dirname(this.path), { recursive: true });
      const rooms = this.store.listAll();
      const payload: SnapshotFile = {
        version: PERSIST_VERSION,
        savedAt: new Date().toISOString(),
        rooms,
      };
      const tmp = `${this.path}.${process.pid}.tmp`;
      writeFileSync(tmp, JSON.stringify(payload), 'utf8');
      renameSync(tmp, this.path);
    } catch (e) {
      console.warn('[room-persist] save failed:', e instanceof Error ? e.message : e);
    }
  }

  startPruneInterval(everyMs = DEFAULT_PRUNE_EVERY_MS): void {
    setInterval(() => {
      const n = this.runPrune('interval prune');
      if (n > 0) this.flushSync();
    }, everyMs).unref?.();
  }
}
