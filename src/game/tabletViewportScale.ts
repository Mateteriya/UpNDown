/**
 * Планшет (ПК-шелл): эталон калибровки раскладки и пропорциональный масштаб.
 *
 * Настройки планшет-стола снимались на **1035×618** CSS-px.
 * На другом размере — мягкий `zoom` корня в обе стороны
 * (без lock ширины/высоты: фиксированный 1035×618 обрезал стол).
 *
 * @see docs/TABLET-PC-LAYOUT-SCALE.md
 */

export const TABLET_LAYOUT_REF_WIDTH_PX = 1035;
export const TABLET_LAYOUT_REF_HEIGHT_PX = 618;

/** Нижний предел, чтобы на крошечных окнах UI оставался читаемым. */
export const TABLET_VIEWPORT_SCALE_MIN = 0.72;
/** Верхний предел — запас на крупные планшеты / DevTools. */
export const TABLET_VIEWPORT_SCALE_MAX = 1.45;

export function readTabletViewportSize(): { width: number; height: number } {
  if (typeof window === 'undefined') {
    return { width: TABLET_LAYOUT_REF_WIDTH_PX, height: TABLET_LAYOUT_REF_HEIGHT_PX };
  }
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
  };
}

/**
 * Коэффициент: min(w/1035, h/618), в коридоре [MIN…MAX].
 * На эталоне → ~1; меньше → <1; больше → >1.
 */
export function computeTabletViewportScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const sx = width / TABLET_LAYOUT_REF_WIDTH_PX;
  const sy = height / TABLET_LAYOUT_REF_HEIGHT_PX;
  const raw = Math.min(sx, sy);
  return Math.min(
    TABLET_VIEWPORT_SCALE_MAX,
    Math.max(TABLET_VIEWPORT_SCALE_MIN, raw),
  );
}

export function readTabletViewportScale(): number {
  const { width, height } = readTabletViewportSize();
  return computeTabletViewportScale(width, height);
}
