/**
 * Офлайн-пакет картинок — только по явному действию пользователя («Скачать для офлайна»).
 * Автозагрузка при открытии меню отключена: иначе легко оборвать кэш и получить «пустую» главную.
 */
import { listCardFaceImageUrls } from '../cardAssets';
import { listAiBotAvatarUrls } from './aiBotAvatars';
import {
  MENU_OFFLINE_LEGEND_ART_URL,
  MENU_ONLINE_LEGEND_ART_URL,
  MENU_PC_CAST_ART_URLS,
} from './menuAssets';
import type { AIDifficulty } from '../game/types';

export const OFFLINE_CARD_IMAGES_CACHE = 'card-images-cache';
export const OFFLINE_AI_BOT_AVATARS_CACHE = 'ai-bot-avatars-cache';
export const OFFLINE_MENU_CAST_CACHE = 'menu-cast-cache';
export const OFFLINE_SHELL_ICONS_CACHE = 'shell-icons-cache';

const PACK_VERSION = 4;
const PACK_LS_KEY = 'updown-offline-pack-v4';
const CONCURRENCY = 3;

const ALL_AI_DIFFICULTIES: AIDifficulty[] = ['novice', 'amateur', 'expert'];

export type OfflinePackBucket = 'cards' | 'aiAvatars' | 'menu' | 'shell';

export type OfflinePackItem = {
  url: string;
  cacheName: string;
  bucket: OfflinePackBucket;
};

export type OfflinePackStatus = {
  version: number;
  ready: boolean;
  cached: number;
  total: number;
  running: boolean;
  lastError?: string;
  /** Нельзя скачать в этом окружении (HTTP / инкогнито и т.п.) */
  blocked?: boolean;
  blockReason?: string;
};

type StoredPack = {
  version: number;
  ready: boolean;
  cached: number;
  total: number;
};

let inFlight: Promise<OfflinePackStatus> | null = null;
let listeners = new Set<(s: OfflinePackStatus) => void>();
let lastStatus: OfflinePackStatus = {
  version: PACK_VERSION,
  ready: false,
  cached: 0,
  total: 0,
  running: false,
};

/** Cache Storage есть только в secure context (HTTPS / localhost). */
export function isCacheStorageAvailable(): boolean {
  try {
    return typeof caches !== 'undefined' && typeof caches.open === 'function';
  } catch {
    return false;
  }
}

/**
 * Почему кнопка офлайна не работает в этом окне.
 * Частый случай: телефон открыл http://192.168… вместо HTTPS-сайта / ярлыка.
 */
export function getOfflinePackBlockReason(): string | null {
  if (typeof window === 'undefined') return 'Окружение без окна браузера.';
  const secure = window.isSecureContext === true;
  const host = window.location.hostname;
  const isLocalHost = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (!secure && !isLocalHost) {
    return (
      'Сейчас страница открыта не по HTTPS (часто это адрес вида http://192.168…). ' +
      'Офлайн-пакет браузер здесь сохранить не даёт. Откройте игру с боевого сайта по HTTPS ' +
      'или с ярлыка на домашнем экране — и нажмите «Скачать» там.'
    );
  }
  if (!isCacheStorageAvailable()) {
    return (
      'Браузер не даёт Cache Storage (часто инкогнито / жёсткие настройки). ' +
      'Откройте обычное окно или ярлык приложения с HTTPS-сайта.'
    );
  }
  return null;
}

function readStored(): StoredPack | null {
  try {
    const raw = localStorage.getItem(PACK_LS_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw) as StoredPack;
    if (!p || p.version !== PACK_VERSION) return null;
    return p;
  } catch {
    return null;
  }
}

function writeStored(p: StoredPack): void {
  try {
    localStorage.setItem(PACK_LS_KEY, JSON.stringify(p));
  } catch {
    /* quota */
  }
}

function emit(s: OfflinePackStatus): void {
  lastStatus = s;
  listeners.forEach((fn) => {
    try {
      fn(s);
    } catch {
      /* ignore */
    }
  });
}

export function subscribeOfflinePackStatus(fn: (s: OfflinePackStatus) => void): () => void {
  listeners.add(fn);
  fn(lastStatus);
  return () => {
    listeners.delete(fn);
  };
}

export function getOfflinePackStatusSnapshot(): OfflinePackStatus {
  return lastStatus;
}

export function getOfflinePackManifest(): OfflinePackItem[] {
  const cards = listCardFaceImageUrls().map(
    (url): OfflinePackItem => ({
      url,
      cacheName: OFFLINE_CARD_IMAGES_CACHE,
      bucket: 'cards',
    }),
  );
  const aiAvatars = ALL_AI_DIFFICULTIES.flatMap((d) => listAiBotAvatarUrls(d)).map(
    (url): OfflinePackItem => ({
      url,
      cacheName: OFFLINE_AI_BOT_AVATARS_CACHE,
      bucket: 'aiAvatars',
    }),
  );
  const menu = [
    ...MENU_PC_CAST_ART_URLS,
    MENU_OFFLINE_LEGEND_ART_URL,
    MENU_ONLINE_LEGEND_ART_URL,
  ].map(
    (url): OfflinePackItem => ({
      url,
      cacheName: OFFLINE_MENU_CAST_CACHE,
      bucket: 'menu',
    }),
  );
  const shell: OfflinePackItem[] = [
    '/favicon.ico',
    '/icon-192.png',
    '/icon-256.png',
    '/icon-512.png',
  ].map((url) => ({
    url,
    cacheName: OFFLINE_SHELL_ICONS_CACHE,
    bucket: 'shell',
  }));

  const seen = new Set<string>();
  const out: OfflinePackItem[] = [];
  for (const item of [...shell, ...cards, ...aiAvatars, ...menu]) {
    if (seen.has(item.url)) continue;
    seen.add(item.url);
    out.push(item);
  }
  return out;
}

function urlMatchVariants(path: string): string[] {
  const out = new Set<string>();
  const add = (p: string) => {
    if (p) out.add(p);
  };
  add(path);
  try {
    add(decodeURI(path));
  } catch {
    /* ignore */
  }
  try {
    add(encodeURI(decodeURI(path)));
  } catch {
    try {
      add(encodeURI(path));
    } catch {
      /* ignore */
    }
  }
  try {
    const segs = path.split('/');
    add(
      segs
        .map((seg, i) => {
          if (i === 0 && seg === '') return '';
          try {
            return encodeURIComponent(decodeURIComponent(seg));
          } catch {
            return encodeURIComponent(seg);
          }
        })
        .join('/'),
    );
  } catch {
    /* ignore */
  }
  return [...out];
}

async function isUrlInCache(cache: Cache, url: string): Promise<boolean> {
  for (const v of urlMatchVariants(url)) {
    if (await cache.match(v)) return true;
  }
  return false;
}

async function putUrlInCache(cache: Cache, url: string): Promise<boolean> {
  if (await isUrlInCache(cache, url)) return true;
  try {
    /* Без cache:'reload' — не выбиваем уже лежащий SW/HTTP кэш оболочки */
    const res = await fetch(url, { credentials: 'same-origin', mode: 'same-origin' });
    if (!res.ok) return false;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 16) return false;
    const headers = new Headers(res.headers);
    if (!headers.has('content-type')) {
      headers.set('content-type', guessContentType(url));
    }
    await Promise.all(
      urlMatchVariants(url).map((v) =>
        cache.put(
          v,
          new Response(buf.slice(0), { status: 200, statusText: 'OK', headers }),
        ),
      ),
    );
    await new Promise<void>((resolve) => {
      const img = new Image();
      img.onload = () => resolve();
      img.onerror = () => resolve();
      img.src = url;
    });
    return true;
  } catch {
    return false;
  }
}

function guessContentType(url: string): string {
  const u = url.toLowerCase();
  if (u.endsWith('.ico')) return 'image/x-icon';
  if (u.includes('.png')) return 'image/png';
  if (u.includes('.webp')) return 'image/webp';
  if (u.includes('.svg')) return 'image/svg+xml';
  return 'image/jpeg';
}

async function mapPool<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!);
    }
  }
  const n = Math.min(limit, Math.max(1, items.length));
  await Promise.all(Array.from({ length: n }, () => worker()));
  return results;
}

async function countCachedInManifest(): Promise<{ cached: number; total: number }> {
  const manifest = getOfflinePackManifest();
  const total = manifest.length;
  if (!isCacheStorageAvailable()) return { cached: 0, total };
  const byCache = new Map<string, Cache>();
  let cached = 0;
  for (const item of manifest) {
    let c = byCache.get(item.cacheName);
    if (!c) {
      c = await caches.open(item.cacheName);
      byCache.set(item.cacheName, c);
    }
    if (await isUrlInCache(c, item.url)) cached += 1;
  }
  return { cached, total };
}

/** Только проверка кэша — без сети и без скачивания. */
export async function refreshOfflinePackStatus(): Promise<OfflinePackStatus> {
  const manifest = getOfflinePackManifest();
  const blockReason = getOfflinePackBlockReason();
  if (blockReason || !isCacheStorageAvailable()) {
    const s: OfflinePackStatus = {
      version: PACK_VERSION,
      ready: false,
      cached: 0,
      total: manifest.length,
      running: false,
      blocked: true,
      blockReason: blockReason ?? 'Cache Storage недоступен в этом окне.',
    };
    emit(s);
    return s;
  }
  try {
    const { cached, total } = await countCachedInManifest();
    const ready = cached === total && total > 0;
    const s: OfflinePackStatus = {
      version: PACK_VERSION,
      ready,
      cached,
      total,
      running: false,
      blocked: false,
    };
    writeStored({ version: PACK_VERSION, ready, cached, total });
    emit(s);
    return s;
  } catch {
    const stored = readStored();
    const s: OfflinePackStatus = {
      version: PACK_VERSION,
      ready: stored?.ready === true,
      cached: stored?.cached ?? 0,
      total: manifest.length,
      running: false,
      blocked: false,
    };
    emit(s);
    return s;
  }
}

/**
 * Скачать / докачать пакет. Только по кнопке пользователя.
 * Без сети — отказ, статус из проверки кэша.
 */
export async function downloadOfflinePack(opts?: { force?: boolean }): Promise<OfflinePackStatus> {
  const blockReason = getOfflinePackBlockReason();
  if (blockReason || !isCacheStorageAvailable()) {
    const s: OfflinePackStatus = {
      version: PACK_VERSION,
      ready: false,
      cached: 0,
      total: getOfflinePackManifest().length,
      running: false,
      blocked: true,
      blockReason: blockReason ?? 'Cache Storage недоступен в этом окне.',
    };
    emit(s);
    return s;
  }

  if (navigator.onLine === false) {
    const checked = await refreshOfflinePackStatus();
    return {
      ...checked,
      lastError: checked.ready
        ? undefined
        : 'Нет интернета. Включите сеть и нажмите «Скачать» ещё раз.',
    };
  }

  if (inFlight) return inFlight;

  inFlight = (async () => {
    const manifest = getOfflinePackManifest();
    const total = manifest.length;
    emit({ version: PACK_VERSION, ready: false, cached: 0, total, running: true });

    let cached = 0;
    const byCache = new Map<string, Cache>();
    const getCache = async (name: string) => {
      let c = byCache.get(name);
      if (!c) {
        c = await caches.open(name);
        byCache.set(name, c);
      }
      return c;
    };

    const results = await mapPool(manifest, CONCURRENCY, async (item) => {
      const cache = await getCache(item.cacheName);
      if (!opts?.force && (await isUrlInCache(cache, item.url))) {
        cached += 1;
        emit({ version: PACK_VERSION, ready: false, cached, total, running: true });
        return true;
      }
      if (opts?.force) {
        for (const v of urlMatchVariants(item.url)) {
          try {
            await cache.delete(v);
          } catch {
            /* ignore */
          }
        }
      }
      const ok = await putUrlInCache(cache, item.url);
      if (ok) {
        cached += 1;
        emit({ version: PACK_VERSION, ready: false, cached, total, running: true });
      }
      return ok;
    });

    const okCount = results.filter(Boolean).length;
    const ready = okCount === total;
    const status: OfflinePackStatus = {
      version: PACK_VERSION,
      ready,
      cached: okCount,
      total,
      running: false,
      lastError: ready
        ? undefined
        : `Скачано ${okCount} из ${total}. Нажмите ещё раз, чтобы докачать остаток.`,
    };
    writeStored({ version: PACK_VERSION, ready, cached: okCount, total });
    emit(status);
    return status;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** @deprecated используйте downloadOfflinePack — оставлено для совместимости импортов */
export async function ensureOfflinePack(opts?: { force?: boolean }): Promise<OfflinePackStatus> {
  return downloadOfflinePack(opts);
}

/** При старте приложения — только статус, без скачивания. */
export function warmOfflineAssetsIfOnline(): void {
  if (typeof window === 'undefined') return;
  void refreshOfflinePackStatus();
}

export function resetOfflineWarmFlag(): void {
  try {
    localStorage.removeItem(PACK_LS_KEY);
  } catch {
    /* ignore */
  }
  emit({
    version: PACK_VERSION,
    ready: false,
    cached: 0,
    total: getOfflinePackManifest().length,
    running: false,
  });
}
