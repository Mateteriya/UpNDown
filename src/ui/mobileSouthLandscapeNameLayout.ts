/** Моб. landscape · Юг: однострочное имя + fade/scroll; кегли компактнее портрета. */

/** Базовый кегль (короткие имена ≤8). */
export const MOBILE_SOUTH_LANDSCAPE_NAME_BASE_FONT_PX = 14;

/** С этой длины — минимальный шрифт (символы 14…17). */
export const MOBILE_SOUTH_LANDSCAPE_NAME_LONG_MIN_CHARS = 14;

export const MOBILE_SOUTH_LANDSCAPE_NAME_MAX_CHARS = 17;
export const MOBILE_SOUTH_LANDSCAPE_NAME_FULL_SIZE_MAX_CHARS = 8;
export const MOBILE_SOUTH_LANDSCAPE_NAME_MIN_FONT_PX = 11;
export const MOBILE_SOUTH_LANDSCAPE_NAME_SHRINK_STEP_PX = 1;

export function countMobileSouthLandscapeNameChars(name: string): number {
  return Math.min([...name].length, MOBILE_SOUTH_LANDSCAPE_NAME_MAX_CHARS);
}

/** ≤8 — полный; 9–13 — −1px за символ; ≥14 — минимальный. */
export function getMobileSouthLandscapeNameFontPx(charCount: number): number {
  if (charCount <= MOBILE_SOUTH_LANDSCAPE_NAME_FULL_SIZE_MAX_CHARS) {
    return MOBILE_SOUTH_LANDSCAPE_NAME_BASE_FONT_PX;
  }
  if (charCount >= MOBILE_SOUTH_LANDSCAPE_NAME_LONG_MIN_CHARS) {
    return MOBILE_SOUTH_LANDSCAPE_NAME_MIN_FONT_PX;
  }
  const steps = charCount - MOBILE_SOUTH_LANDSCAPE_NAME_FULL_SIZE_MAX_CHARS;
  return MOBILE_SOUTH_LANDSCAPE_NAME_BASE_FONT_PX - steps * MOBILE_SOUTH_LANDSCAPE_NAME_SHRINK_STEP_PX;
}
