/** Иллюстрации легенд режимов (public/МЕНЮ). */
export const MENU_ONLINE_LEGEND_ART_URL = encodeURI('/МЕНЮ/Онлайн.jpg');
export const MENU_OFFLINE_LEGEND_ART_URL = encodeURI('/МЕНЮ/офлайн.jpg');

/** ПК-меню: кот-герой (сейчас не используется на главной). */
export const MENU_PC_HERO_ART_URL = encodeURI('/МЕНЮ/для меню ПК.jpg');

/**
 * Ротация каста ПК: 7 кадров.
 * За сессию грузится только ОДИН файл (~200–400 KB), не все сразу.
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
const CAST_URL_SESSION = 'upnd-menu-pc-cast-url';

/** URL каста на текущую сессию вкладки; при новом открытии приложения — следующий по кругу. */
export function getMenuPcCastArtUrlForSession(): string {
  try {
    const cached = sessionStorage.getItem(CAST_URL_SESSION);
    if (cached && (MENU_PC_CAST_ART_URLS as readonly string[]).includes(cached)) {
      return cached;
    }
  } catch {
    /* ignore */
  }

  const n = MENU_PC_CAST_ART_URLS.length;
  let idx = 0;
  try {
    const raw = localStorage.getItem(CAST_IDX_LS);
    const parsed = raw != null ? Number.parseInt(raw, 10) : 0;
    if (Number.isFinite(parsed) && parsed >= 0) idx = parsed % n;
  } catch {
    /* ignore */
  }

  const url = MENU_PC_CAST_ART_URLS[idx]!;
  try {
    localStorage.setItem(CAST_IDX_LS, String((idx + 1) % n));
    sessionStorage.setItem(CAST_URL_SESSION, url);
  } catch {
    /* ignore */
  }
  return url;
}

/** @deprecated один кадр — используйте getMenuPcCastArtUrlForSession */
export const MENU_PC_CAST_ART_URL = MENU_PC_CAST_ART_URLS[0];
