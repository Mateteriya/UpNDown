/**
 * Планшет (ПК-шелл): ручной масштаб сукна.
 * UI: 100% = изначальный размер режима.
 * Диапазон 93%…108%; шаг по умолчанию 1% (3p / ПК·4p).
 * Планшет · 4p: шаг крупнее; высота растёт смелее UI%, ширина почти не следует.
 * 4p: «100%» = бывший визуал 125% высоты (и пропорциональная ширина базы).
 */

export const TABLET_TABLE_SCALE_PCT_MIN = 93;
export const TABLET_TABLE_SCALE_PCT_MAX = 108;
export const TABLET_TABLE_SCALE_PCT_DEFAULT = 100;
export const TABLET_TABLE_SCALE_PCT_STEP = 1;
/** Планшет · 4p: крупнее шаг шестерёнки стола (высота вниз). */
export const TABLET_FOUR_TABLE_SCALE_PCT_STEP = 4;

/** Бывший boost 25% высоты → изначальный размер 4p. */
export const TABLET_FOUR_BASE_HEIGHT_MUL = 1.25;
/** При boost 25 ширина была 1 + 5%*(25/95). */
export const TABLET_FOUR_BASE_WIDTH_MUL = 1 + 0.05 * (25 / 95);
/**
 * Планшет · 4p: доля UI-дельты в ширине (0 = не растёт, 1 = как раньше).
 * «Почти не» — слабый follow.
 */
export const TABLET_FOUR_WIDTH_SCALE_FOLLOW = 0.12;
/**
 * Планшет · 4p: усиление UI-дельты по высоте (1 = как раньше, >1 смелее вниз).
 */
export const TABLET_FOUR_HEIGHT_SCALE_GAIN = 2.5;

export const TABLET_TABLE_SCALE_LS_KEY_FOUR = 'updown_tablet_table_scale_pct_4';
export const TABLET_TABLE_SCALE_LS_KEY_THREE = 'updown_tablet_table_scale_pct_3';
/** ПК · 4p (не планшет): отдельный ключ — без tablet 1.25× базы. */
export const PC_DESKTOP_TABLE_SCALE_LS_KEY_FOUR = 'updown_pc_desktop_table_scale_pct_4';
/** Старые ключи boost 0…95 — только для мягкой миграции. */
const LEGACY_BOOST_LS_KEY = 'updown_tablet_table_height_boost';
const LEGACY_BOOST_LS_KEY_FOUR = 'updown_tablet_table_height_boost_4';
const LEGACY_BOOST_LS_KEY_THREE = 'updown_tablet_table_height_boost_3';

export type TabletTableScalePct = number;

export function clampTabletTableScalePct(pct: number): TabletTableScalePct {
  if (!Number.isFinite(pct)) return TABLET_TABLE_SCALE_PCT_DEFAULT;
  const rounded = Math.round(pct);
  return Math.max(
    TABLET_TABLE_SCALE_PCT_MIN,
    Math.min(TABLET_TABLE_SCALE_PCT_MAX, rounded),
  );
}

export function tabletTableScaleLsKey(playerCount: 3 | 4): string {
  return playerCount === 3 ? TABLET_TABLE_SCALE_LS_KEY_THREE : TABLET_TABLE_SCALE_LS_KEY_FOUR;
}

export function defaultTabletTableScalePct(_playerCount: 3 | 4): TabletTableScalePct {
  return TABLET_TABLE_SCALE_PCT_DEFAULT;
}

/** Старый boost 25 ≡ новый UI 100%; иначе — в ближайшее в 93…108. */
function migrateLegacyBoostToPct(boost: number, playerCount: 3 | 4): TabletTableScalePct {
  if (!Number.isFinite(boost)) return TABLET_TABLE_SCALE_PCT_DEFAULT;
  if (playerCount === 4) {
    /* boost 25 → 100%; ± вокруг — линейно в новый коридор */
    const mapped = 100 + (boost - 25);
    return clampTabletTableScalePct(mapped);
  }
  return clampTabletTableScalePct(100 + boost);
}

/** Миграция со шкалы 90/100/110 → 93…108. */
function migrateOldPctScale(pct: number): TabletTableScalePct {
  if (!Number.isFinite(pct)) return TABLET_TABLE_SCALE_PCT_DEFAULT;
  if (pct <= 90) return TABLET_TABLE_SCALE_PCT_MIN;
  if (pct >= 110) return TABLET_TABLE_SCALE_PCT_MAX;
  return clampTabletTableScalePct(pct);
}

export function readTabletTableScalePct(playerCount: 3 | 4 = 4): TabletTableScalePct {
  const fallback = defaultTabletTableScalePct(playerCount);
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const keyed = localStorage.getItem(tabletTableScaleLsKey(playerCount));
    if (keyed != null) return migrateOldPctScale(Number(keyed));

    const legacySeat =
      playerCount === 3 ? LEGACY_BOOST_LS_KEY_THREE : LEGACY_BOOST_LS_KEY_FOUR;
    const legacyRaw =
      localStorage.getItem(legacySeat) ?? localStorage.getItem(LEGACY_BOOST_LS_KEY);
    if (legacyRaw != null) {
      return migrateLegacyBoostToPct(Number(legacyRaw), playerCount);
    }
    return fallback;
  } catch {
    return fallback;
  }
}

export function writeTabletTableScalePct(
  pct: TabletTableScalePct,
  playerCount: 3 | 4 = 4,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      tabletTableScaleLsKey(playerCount),
      String(clampTabletTableScalePct(pct)),
    );
  } catch {
    /* ignore */
  }
}

export function bumpTabletTableScalePct(
  current: TabletTableScalePct,
  dir: 1 | -1,
  step: number = TABLET_TABLE_SCALE_PCT_STEP,
): TabletTableScalePct {
  const s = Number.isFinite(step) && step > 0 ? step : TABLET_TABLE_SCALE_PCT_STEP;
  return clampTabletTableScalePct(current + dir * s);
}

export function readPcDesktopTableScalePct(): TabletTableScalePct {
  const fallback = TABLET_TABLE_SCALE_PCT_DEFAULT;
  try {
    if (typeof localStorage === 'undefined') return fallback;
    const keyed = localStorage.getItem(PC_DESKTOP_TABLE_SCALE_LS_KEY_FOUR);
    if (keyed != null) return migrateOldPctScale(Number(keyed));
    return fallback;
  } catch {
    return fallback;
  }
}

export function writePcDesktopTableScalePct(pct: TabletTableScalePct): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      PC_DESKTOP_TABLE_SCALE_LS_KEY_FOUR,
      String(clampTabletTableScalePct(pct)),
    );
  } catch {
    /* ignore */
  }
}

/** ПК · 4p: 100% = текущий размер сукна режима (без tablet base 1.25). */
export function pcDesktopTableScaleMul(pct: TabletTableScalePct): number {
  return clampTabletTableScalePct(pct) / 100;
}

function baseHeightMul(playerCount: 3 | 4): number {
  return playerCount === 4 ? TABLET_FOUR_BASE_HEIGHT_MUL : 1;
}

function baseWidthMul(playerCount: 3 | 4): number {
  return playerCount === 4 ? TABLET_FOUR_BASE_WIDTH_MUL : 1;
}

/** Итоговый множитель высоты: база режима × UI (4p — с усилением). */
export function tabletTableHeightMul(
  pct: TabletTableScalePct,
  playerCount: 3 | 4 = 4,
): number {
  const p = clampTabletTableScalePct(pct);
  const delta = (p - TABLET_TABLE_SCALE_PCT_DEFAULT) / 100;
  if (playerCount === 4) {
    return TABLET_FOUR_BASE_HEIGHT_MUL * (1 + delta * TABLET_FOUR_HEIGHT_SCALE_GAIN);
  }
  return baseHeightMul(playerCount) * (1 + delta);
}

/** Итоговый множитель ширины: база режима × UI (4p — почти без роста). */
export function tabletTableWidthMul(
  pct: TabletTableScalePct,
  playerCount: 3 | 4 = 4,
): number {
  const p = clampTabletTableScalePct(pct);
  const delta = (p - TABLET_TABLE_SCALE_PCT_DEFAULT) / 100;
  if (playerCount === 4) {
    return TABLET_FOUR_BASE_WIDTH_MUL * (1 + delta * TABLET_FOUR_WIDTH_SCALE_FOLLOW);
  }
  return baseWidthMul(playerCount) * (1 + delta);
}

/** При 107–108% зазор стол↔Запад/Восток уменьшаем вдвое. */
export function tabletTableSideGapTight(pct: TabletTableScalePct): boolean {
  const p = clampTabletTableScalePct(pct);
  return p >= 107;
}

export const TABLET_CENTER_AREA_GAP_PX = 16;
export const TABLET_CENTER_AREA_GAP_TIGHT_PX = 8;
