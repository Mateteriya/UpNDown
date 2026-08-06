/**
 * Планшет (ПК-шелл): эталон калибровки раскладки и пропорциональный масштаб.
 *
 * Настройки планшет-стола снимались на **1035×618** CSS-px.
 * На **меньшем** экране — мягкий `zoom` вниз (чтобы всё влезало).
 * На **большем** — НЕ увеличиваем (max = 1): иначе zoom>1 раздувает стол/панель Юга
 * и они зажимают руку по вертикали (наложения). Лишнее место остаётся полями.
 *
 * Полоса **900–1024**: тот же планшет-шелл, дополнительно ×0.94 (~−6%).
 *
 * @see docs/TABLET-PC-LAYOUT-SCALE.md
 */

export const TABLET_LAYOUT_REF_WIDTH_PX = 1035;
export const TABLET_LAYOUT_REF_HEIGHT_PX = 618;

/** Нижний предел, чтобы на крошечных окнах UI оставался читаемым. */
export const TABLET_VIEWPORT_SCALE_MIN = 0.72;
/**
 * Верхний предел = 1: эталон и крупнее — без upscale.
 * Раньше 1.45 раздувал layout и сжимал руку между столом и панелью Юга.
 */
export const TABLET_VIEWPORT_SCALE_MAX = 1;

/** 900–1024: полный планшет, уменьшенный на ~6%. */
export const TABLET_NARROW_BAND_MIN_WIDTH_PX = 900;
export const TABLET_NARROW_BAND_MAX_WIDTH_PX = 1024;
export const TABLET_NARROW_BAND_SCALE = 0.94;

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
 * Коэффициент: min(w/1035, h/618), в коридоре [MIN…1].
 * Эталон и больше → 1; меньше → пропорционально вниз (не ниже MIN).
 * 900–1024 → дополнительно × TABLET_NARROW_BAND_SCALE.
 */
export function computeTabletViewportScale(width: number, height: number): number {
  if (!(width > 0) || !(height > 0)) return 1;
  const sx = width / TABLET_LAYOUT_REF_WIDTH_PX;
  const sy = height / TABLET_LAYOUT_REF_HEIGHT_PX;
  const raw = Math.min(sx, sy);
  let scale = Math.min(
    TABLET_VIEWPORT_SCALE_MAX,
    Math.max(TABLET_VIEWPORT_SCALE_MIN, raw),
  );
  if (
    width >= TABLET_NARROW_BAND_MIN_WIDTH_PX &&
    width <= TABLET_NARROW_BAND_MAX_WIDTH_PX
  ) {
    scale = Math.max(TABLET_VIEWPORT_SCALE_MIN, scale * TABLET_NARROW_BAND_SCALE);
  }
  return scale;
}

export function readTabletViewportScale(): number {
  const { width, height } = readTabletViewportSize();
  return computeTabletViewportScale(width, height);
}
