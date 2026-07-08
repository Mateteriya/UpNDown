/** Моб. landscape · Юг: макс. размер имени (было 14×1.8≈25, −3px → 22). */
export const MOBILE_SOUTH_LANDSCAPE_NAME_BASE_FONT_PX = Math.round(14 * 1.8) - 3;

/** С этой длины — минимальный шрифт (символы 14…17). */
export const MOBILE_SOUTH_LANDSCAPE_NAME_LONG_MIN_CHARS = 14;

export const MOBILE_SOUTH_LANDSCAPE_NAME_MAX_CHARS = 17;
export const MOBILE_SOUTH_LANDSCAPE_NAME_FULL_SIZE_MAX_CHARS = 8;
export const MOBILE_SOUTH_LANDSCAPE_NAME_MIN_FONT_PX = 15;
export const MOBILE_SOUTH_LANDSCAPE_NAME_SHRINK_STEP_PX = 2;

export function countMobileSouthLandscapeNameChars(name: string): number {
  return Math.min([...name].length, MOBILE_SOUTH_LANDSCAPE_NAME_MAX_CHARS);
}

/** ≤8 — полный размер; 9–13 — −2px за символ; ≥14 — минимальный. */
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
