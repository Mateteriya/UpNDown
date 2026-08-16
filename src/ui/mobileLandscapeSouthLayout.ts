/**
 * Моб. landscape · раскладка панели Юга (панель слева, рука справа, фикс. ширина под 9 карт).
 *
 * Эталон калибровки **660×330**. Фикс. панель (247) в обычном phone LS с длинной стороны **≥651**
 * (стык с after-short ≤650) — иначе дыра 651–659 без after-short и без старого порога 660.
 * Подробнее: docs/MOBILE-LANDSCAPE-SOUTH-LAYOUT.md
 */
import { useEffect, useState } from 'react';

/** Стык с after-short (≤650): обычный LS / south-tuned с длинной стороны ≥651. */
export const MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX = 651;
export const MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX = 330;
/**
 * DevTools/Edge иногда отдают visualViewport.height на 1px меньше (329 при «330»).
 * Без допуска tuned не включается → панель считается через ResizeObserver и «плывёт» между браузерами.
 */
export const MOBILE_LANDSCAPE_SOUTH_TUNED_HEIGHT_TOLERANCE_PX = 1;
/**
 * Ширина панели Юга при 9 картах на эталоне 660×330 (не DOM-замер — одинаково в Chrome/Edge/Safari).
 */
export const MOBILE_LANDSCAPE_SOUTH_PANEL_FIXED_REFERENCE_W_PX = 247;

export const MOBILE_LANDSCAPE_SOUTH_TUNED_REFERENCE_VIEWPORT = {
  /** Эталон калибровки (не порог включения). */
  width: 660,
  height: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX,
} as const;

export type MobileLandscapeSouthLayoutViewport = {
  width: number;
  height: number;
};

export function readMobileLandscapeSouthLayoutViewportPx(): MobileLandscapeSouthLayoutViewport {
  if (typeof window === 'undefined') {
    return { ...MOBILE_LANDSCAPE_SOUTH_TUNED_REFERENCE_VIEWPORT };
  }
  const vv = window.visualViewport;
  const width =
    vv != null && Number.isFinite(vv.width) && vv.width > 0 ? vv.width : window.innerWidth;
  const height =
    vv != null && Number.isFinite(vv.height) && vv.height > 0 ? vv.height : window.innerHeight;
  return {
    width: Math.max(0, Math.round(width)),
    /* ceil: 329.2px от Edge → 330, иначе tuned не срабатывает при «экране» 660×330 */
    height: Math.max(0, Math.ceil(height)),
  };
}

/** true, если viewport не меньше калибровочного минимума (660×330). */
export function isMobileLandscapeSouthLayoutTuned(
  viewport: MobileLandscapeSouthLayoutViewport,
): boolean {
  return (
    viewport.width >= MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX &&
    viewport.height >=
      MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX - MOBILE_LANDSCAPE_SOUTH_TUNED_HEIGHT_TOLERANCE_PX
  );
}

/** Фиксированная ширина панели Юга (landscape · tuned) или null — считать динамически. */
export function mobileLandscapeSouthPanelFixedWidthPxWhenTuned(
  viewport: MobileLandscapeSouthLayoutViewport,
): number | null {
  return isMobileLandscapeSouthLayoutTuned(viewport)
    ? MOBILE_LANDSCAPE_SOUTH_PANEL_FIXED_REFERENCE_W_PX
    : null;
}

/** Синхрон с --game-table-landscape-table-col-width в index.css (landscape · колонка Севера). */
export const MOBILE_LANDSCAPE_NORTH_COL_SIDE_REF_PX = 128;
export const MOBILE_LANDSCAPE_BOARD_GAP_PX = 1;

export function estimateMobileLandscapeNorthColumnWidthPx(viewportWidth: number): number {
  return Math.max(
    0,
    Math.round(
      (viewportWidth -
        2 * MOBILE_LANDSCAPE_NORTH_COL_SIDE_REF_PX -
        2 * MOBILE_LANDSCAPE_BOARD_GAP_PX) *
        0.8,
    ),
  );
}

/** Узкий landscape (short-VH телефон): панель Севера не шире колонки — иначе бейдж хода наезжает. */
export function capMobileLandscapeNorthPanelWidthPx(
  viewportWidth: number,
  idealPanelWidthPx: number,
  minPanelWidthPx = 120,
  safetyPx = 2,
): number {
  const columnW = estimateMobileLandscapeNorthColumnWidthPx(viewportWidth);
  if (columnW <= 0) return idealPanelWidthPx;
  const capped = Math.min(idealPanelWidthPx, columnW - safetyPx);
  return Math.max(minPanelWidthPx, capped);
}

/** Подписка на visualViewport / resize для класса viewport-mobile-landscape-south-tuned. */
export function useMobileLandscapeSouthLayoutTuned(): boolean {
  const [tuned, setTuned] = useState(() =>
    typeof window !== 'undefined'
      ? isMobileLandscapeSouthLayoutTuned(readMobileLandscapeSouthLayoutViewportPx())
      : true,
  );
  useEffect(() => {
    const measure = () => {
      setTuned(isMobileLandscapeSouthLayoutTuned(readMobileLandscapeSouthLayoutViewportPx()));
    };
    measure();
    window.addEventListener('resize', measure);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', measure);
    vv?.addEventListener('scroll', measure);
    return () => {
      window.removeEventListener('resize', measure);
      vv?.removeEventListener('resize', measure);
      vv?.removeEventListener('scroll', measure);
    };
  }, []);
  return tuned;
}
