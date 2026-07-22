/** Иллюстрации легенд режимов (public/МЕНЮ). */
export const MENU_ONLINE_LEGEND_ART_URL = encodeURI('/МЕНЮ/Онлайн.jpg');
export const MENU_OFFLINE_LEGEND_ART_URL = encodeURI('/МЕНЮ/офлайн.jpg');

/** ПК-меню: кот-герой (сейчас не используется на главной). */
export const MENU_PC_HERO_ART_URL = encodeURI('/МЕНЮ/для меню ПК.jpg');

/**
 * Ротация каста меню (ПК + мобилка): 7 кадров.
 * За раз грузится один файл (~200–400 KB); следующий — prefetch по желанию.
 */
export const MENU_PC_CAST_ART_URLS = [
  encodeURI('/МЕНЮ/для меню ПК 7.jpg'),
  encodeURI('/МЕНЮ/для меню ПК 70.jpg'),
  encodeURI('/МЕНЮ/для меню ПК 71.jpg'),
  encodeURI('/МЕНЮ/для меню ПК 72.jpg'),
  encodeURI('/МЕНЮ/для меню ПК 77.jpg'),
  encodeURI('/МЕНЮ/для меню ПК 79.jpg'),
  encodeURI('/МЕНЮ/для меню ПК 8.jpg'),
] as const;

const CAST_IDX_LS = 'upnd-menu-pc-cast-idx';
const CAST_PINNED_LS = 'upnd-menu-pc-cast-pinned';

/** Антидребезг: React Strict Mode дважды монтирует меню в dev. */
let lastMenuCastAdvanceAt = 0;
const MENU_CAST_ADVANCE_GUARD_MS = 500;

export type MenuPcCastPick = { index: number; url: string };

export function getMenuPcCastCount(): number {
  return MENU_PC_CAST_ART_URLS.length;
}

export function getMenuPcCastUrlAt(index: number): string {
  const n = MENU_PC_CAST_ART_URLS.length;
  const i = ((index % n) + n) % n;
  return MENU_PC_CAST_ART_URLS[i]!;
}

function readStoredCastIndex(): number {
  const n = MENU_PC_CAST_ART_URLS.length;
  try {
    const raw = localStorage.getItem(CAST_IDX_LS);
    const parsed = raw != null ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(parsed) && parsed >= 0) return parsed % n;
  } catch {
    /* ignore */
  }
  return 0;
}

function writeStoredCastIndex(index: number): void {
  const n = MENU_PC_CAST_ART_URLS.length;
  try {
    localStorage.setItem(CAST_IDX_LS, String(((index % n) + n) % n));
  } catch {
    /* ignore */
  }
}

/** Закреплён ли текущий кадр (без автосмены и смены при заходе). */
export function isMenuPcCastPinned(): boolean {
  try {
    return localStorage.getItem(CAST_PINNED_LS) === '1';
  } catch {
    return false;
  }
}

export function setMenuPcCastPinned(pinned: boolean): void {
  try {
    if (pinned) localStorage.setItem(CAST_PINNED_LS, '1');
    else localStorage.removeItem(CAST_PINNED_LS);
  } catch {
    /* ignore */
  }
}

/** Текущий кадр по localStorage (без сдвига). */
export function getMenuPcCastCurrent(): MenuPcCastPick {
  const index = readStoredCastIndex();
  return { index, url: getMenuPcCastUrlAt(index) };
}

/** Поставить конкретный кадр (стрелки / автосвайп). */
export function setMenuPcCastIndex(index: number): MenuPcCastPick {
  const n = MENU_PC_CAST_ART_URLS.length;
  const next = ((index % n) + n) % n;
  writeStoredCastIndex(next);
  return { index: next, url: getMenuPcCastUrlAt(next) };
}

/** Сдвиг на delta кадров по кругу. */
export function advanceMenuPcCast(delta = 1): MenuPcCastPick {
  const cur = readStoredCastIndex();
  return setMenuPcCastIndex(cur + delta);
}

/**
 * Кадр при заходе на главное меню: следующий по кругу.
 * Если фон закреплён — без сдвига. Не дергает индекс повторно при двойном mount Strict Mode.
 */
export function takeMenuPcCastForMenuVisit(): MenuPcCastPick {
  if (isMenuPcCastPinned()) return getMenuPcCastCurrent();
  const now = Date.now();
  if (now - lastMenuCastAdvanceAt < MENU_CAST_ADVANCE_GUARD_MS) {
    return getMenuPcCastCurrent();
  }
  lastMenuCastAdvanceAt = now;
  return advanceMenuPcCast(1);
}

/** Тихий prefetch следующего JPG (не блокирует UI). */
export function preloadMenuPcCastUrl(url: string): void {
  if (typeof Image === 'undefined') return;
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
  } catch {
    /* ignore */
  }
}

const castDisplayCache = new Map<string, string>();

/**
 * C: для мобилки — decode/resize через createImageBitmap (~512px),
 * чтобы в GPU не тащить полный 1024² JPG. Fallback = исходный url.
 */
export async function resolveMenuCastDisplayUrl(
  url: string,
  opts?: { maxEdge?: number },
): Promise<string> {
  const maxEdge = opts?.maxEdge ?? 512;
  const cacheKey = `${url}|${maxEdge}`;
  const cached = castDisplayCache.get(cacheKey);
  if (cached) return cached;
  if (typeof fetch !== 'function' || typeof createImageBitmap !== 'function') {
    return url;
  }
  try {
    const res = await fetch(url, { credentials: 'same-origin' });
    if (!res.ok) return url;
    const blob = await res.blob();
    const bmp = await createImageBitmap(blob, {
      resizeWidth: maxEdge,
      resizeHeight: maxEdge,
      resizeQuality: 'high',
    });
    const canvas = document.createElement('canvas');
    canvas.width = bmp.width;
    canvas.height = bmp.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bmp.close();
      return url;
    }
    ctx.drawImage(bmp, 0, 0);
    bmp.close();
    const out = canvas.toDataURL('image/jpeg', 0.82);
    castDisplayCache.set(cacheKey, out);
    return out;
  } catch {
    return url;
  }
}

/**
 * @deprecated используйте takeMenuPcCastForMenuVisit / getMenuPcCastCurrent
 * Оставлено для совместимости: поведение как «новый визит меню».
 */
export function getMenuPcCastArtUrlForSession(): string {
  return takeMenuPcCastForMenuVisit().url;
}

/** @deprecated один кадр — используйте ротацию */
export const MENU_PC_CAST_ART_URL = MENU_PC_CAST_ART_URLS[0];
