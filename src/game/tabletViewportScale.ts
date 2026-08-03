/**
 * Планшет (ПК-шелл): эталон калибровки раскладки и пропорциональный масштаб.
 *
 * Настройки планшет-стола снимались на **1035×618** CSS-px.
 * На **меньшем** экране — мягкий `zoom` вниз (чтобы всё влезало).
 * На **большем** — НЕ увеличиваем (max = 1): иначе zoom>1 раздувает стол/панель Юга
 * и они зажимают руку по вертикали (наложения). Лишнее место остаётся полями.
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
