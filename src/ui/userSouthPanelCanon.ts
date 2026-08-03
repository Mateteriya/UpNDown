/**
 * Канон панели пользователя · Юг (ПК / планшетный шелл).
 * Держать в синхроне с `src/styles/user-south-panel.css`.
 * Мобилка (viewport-mobile) — сюда не относится.
 *
 * Режимы:
 *  · PC desktop 3p/4p — `!useTabletPcTableTuning`
 *  · Tablet shell 3p/4p — `useTabletPcTableTuning` (+ класс `.game-table-tablet-pc`)
 */

/** ПК · розыгрыш: лицо; кольцо заказа ×1.2 → визуально ~70 */
export const USER_SOUTH_AVATAR_PC_PLAY_PX = 58;
/** ПК · торги: без кольца — компенсируем до визуальных ~70 */
export const USER_SOUTH_AVATAR_PC_BIDDING_PX = 70;
/** Планшет · розыгрыш */
export const USER_SOUTH_AVATAR_TABLET_PLAY_PX = 38;
/** Планшет · торги */
export const USER_SOUTH_AVATAR_TABLET_BIDDING_PX = 54;

/** ПК · компакт панели взяток (−8%), заказ 0 без scale */
export const USER_SOUTH_TRICKS_PANEL_SCALE = 0.92;

/**
 * ПК desktop: укорочение имени по числу слотов взяток.
 * 1–6 — без среза; 7–9 → −3; 10+ → −5. Планшет — всегда 0.
 */
export function pcSouthNameCutChars(trickSlotCount: number, isTabletShell: boolean): number {
  if (isTabletShell) return 0;
  if (trickSlotCount >= 10) return 5;
  if (trickSlotCount >= 7) return 3;
  return 0;
}

export function userSouthAvatarSizePx(opts: {
  isTabletShell: boolean;
  isBidding: boolean;
}): number {
  const { isTabletShell, isBidding } = opts;
  if (isTabletShell) {
    return isBidding ? USER_SOUTH_AVATAR_TABLET_BIDDING_PX : USER_SOUTH_AVATAR_TABLET_PLAY_PX;
  }
  return isBidding ? USER_SOUTH_AVATAR_PC_BIDDING_PX : USER_SOUTH_AVATAR_PC_PLAY_PX;
}
