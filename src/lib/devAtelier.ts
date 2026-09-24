/**
 * Доступ к лабам / музыкальной студии.
 * — Полный «режим разработчика» (список лаб): только staging / localhost / DEV.
 * — Музыкальная студия в проде: жест или URL-ключ (шаринг).
 */

const DEV_MODE_KEY = 'updown-devMode';
const MUSIC_STUDIO_KEY = 'updown-musicStudio';

/** Ключ для шаринга: /#studio=ether или ?studio=ether */
export function musicStudioUrlKey(): string {
  const raw = (import.meta.env.VITE_MUSIC_STUDIO_KEY as string | undefined)?.trim();
  return raw && raw.length > 0 ? raw : 'ether';
}

function envBool(key: string, defaultValue: boolean): boolean {
  const raw = import.meta.env[key] as string | undefined;
  if (raw == null || raw.trim() === '') return defaultValue;
  const v = raw.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** Хост, где разрешён полный каталог лаб (не прод-UI). */
export function isDevAtelierHost(): boolean {
  if (import.meta.env.DEV) return true;
  if (envBool('VITE_DEV_ATELIER', false)) return true;
  if (typeof window === 'undefined') return false;
  const h = window.location.hostname.toLowerCase();
  if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]') return true;
  if (h.endsWith('.local')) return true;
  if (h.includes('staging')) return true;
  return false;
}

export function isFullDevModeEnabled(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  if (!isDevAtelierHost()) return false;
  try {
    return sessionStorage.getItem(DEV_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

export function enableFullDevMode(): boolean {
  if (!isDevAtelierHost()) return false;
  try {
    sessionStorage.setItem(DEV_MODE_KEY, '1');
  } catch {
    /* ignore */
  }
  return true;
}

export function isMusicStudioUnlocked(): boolean {
  if (isFullDevModeEnabled()) return true;
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(MUSIC_STUDIO_KEY) === '1';
  } catch {
    return false;
  }
}

export function unlockMusicStudio(): void {
  try {
    sessionStorage.setItem(MUSIC_STUDIO_KEY, '1');
  } catch {
    /* ignore */
  }
}

/** Переход в студию (после жеста). */
export function openMusicStudio(): void {
  unlockMusicStudio();
  if (typeof window === 'undefined') return;
  window.location.href = '/audio-sfx-lab';
}

function tokenMatches(raw: string | null | undefined): boolean {
  if (raw == null) return false;
  const t = raw.trim().toLowerCase();
  if (!t) return false;
  if (t === '1' || t === 'true' || t === 'yes' || t === 'studio') return true;
  return t === musicStudioUrlKey().toLowerCase();
}

/**
 * Читает URL (#studio / #studio=key / ?studio=key).
 * При успехе — unlock + при необходимости редирект на /audio-sfx-lab.
 * @returns true, если ключ принят.
 */
export function consumeMusicStudioUrlUnlock(): boolean {
  if (typeof window === 'undefined') return false;
  const url = new URL(window.location.href);
  const q = url.searchParams.get('studio') ?? url.searchParams.get('atelier');

  let hashOk = false;
  const hash = (url.hash || '').replace(/^#/, '');
  if (hash === 'studio' || hash === 'ether') hashOk = true;
  else if (hash.startsWith('studio=')) hashOk = tokenMatches(hash.slice('studio='.length));
  else if (hash.startsWith('studio/')) hashOk = tokenMatches(hash.slice('studio/'.length));
  else if (hash.startsWith('atelier=')) hashOk = tokenMatches(hash.slice('atelier='.length));

  const ok = tokenMatches(q) || hashOk;
  if (!ok) return false;

  unlockMusicStudio();

  const onLab = url.pathname === '/audio-sfx-lab' || url.pathname.startsWith('/audio-sfx-lab/');
  if (!onLab) {
    window.location.replace('/audio-sfx-lab');
    return true;
  }

  /* Убрать ключ из адресной строки, сессия уже открыта */
  url.searchParams.delete('studio');
  url.searchParams.delete('atelier');
  if (
    hash === 'studio' ||
    hash === 'ether' ||
    hash.startsWith('studio=') ||
    hash.startsWith('studio/') ||
    hash.startsWith('atelier=')
  ) {
    url.hash = '';
  }
  const next = `${url.pathname}${url.search}${url.hash}`;
  window.history.replaceState(null, '', next || '/audio-sfx-lab');
  return true;
}

/** Доступ к /audio-sfx-lab */
export function canAccessMusicStudio(): boolean {
  return isMusicStudioUnlocked() || isFullDevModeEnabled();
}

/** Доступ к остальным лабам (не музыка) */
export function canAccessDevLab(): boolean {
  return isFullDevModeEnabled();
}

/** Тройной тап за окно ms. */
export function createTripleTapHandler(onTriple: () => void, windowMs = 520): () => void {
  let count = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  return () => {
    count += 1;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      count = 0;
      timer = null;
    }, windowMs);
    if (count >= 3) {
      count = 0;
      if (timer) clearTimeout(timer);
      timer = null;
      onTriple();
    }
  };
}
