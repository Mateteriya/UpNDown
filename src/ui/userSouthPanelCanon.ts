/**
 * Канон панели пользователя · Юг (ПК / планшет / мобилка · имя).
 * Держать в синхроне с `src/styles/user-south-panel.css`.
 *
 * Режимы:
 *  · PC desktop 3p/4p — `!useTabletPcTableTuning`
 *  · Tablet shell 3p/4p — `useTabletPcTableTuning` (+ класс `.game-table-tablet-pc`)
 *  · Mobile viewport-mobile — плашка имени max 217px + fade/scroll при переполнении
 */

/**
 * ПК · лицо Юга: один размер на торгах и в розыгрыше
 * (чуть компактнее под форму «D» + рельс имени).
 */
export const USER_SOUTH_AVATAR_PC_BIDDING_PX = 64;
export const USER_SOUTH_AVATAR_PC_PLAY_PX = USER_SOUTH_AVATAR_PC_BIDDING_PX;
/** Планшет · тот же принцип */
export const USER_SOUTH_AVATAR_TABLET_BIDDING_PX = 54;
export const USER_SOUTH_AVATAR_TABLET_PLAY_PX = USER_SOUTH_AVATAR_TABLET_BIDDING_PX;

/**
 * ПК/планшет · ориентир под лицо + order-ring pad.
 * В CSS wrap = fit-content (обнимает chrome), чтобы плашка имени стыковалась без воздуха.
 */
export const USER_SOUTH_AVATAR_WRAP_PC_PX = 76;
export const USER_SOUTH_AVATAR_WRAP_TABLET_PX = 64;

/** ПК · компакт панели взяток (−8%), заказ 0 без scale */
export const USER_SOUTH_TRICKS_PANEL_SCALE = 0.92;

/** Длинное имя: порог символов для компактного кегля после заказа */
export const USER_SOUTH_NAME_LONG_CHARS = 9;

/** ПК/планшет: ширина вертикальной плашки имени */
export const USER_SOUTH_NAME_RAIL_WIDTH_PC_PX = 24;
export const USER_SOUTH_NAME_RAIL_WIDTH_TABLET_PX = 20;
/** Отступ левого края рельса (★+имя) от внутренней кромки панели / гирлянды */
export const USER_SOUTH_RAIL_PANEL_INSET_PC_PX = 10;
export const USER_SOUTH_RAIL_PANEL_INSET_TABLET_PX = 8;
/** @deprecated горизонтальный clamp — плашка теперь vertical-rail */
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_PC_PX = USER_SOUTH_NAME_RAIL_WIDTH_PC_PX;
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_TABLET_PX = USER_SOUTH_NAME_RAIL_WIDTH_TABLET_PX;
/** Моб. портрет · макс. ширина плашки имени (fade + scroll при переполнении) */
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_PX = 217;
/** Моб. landscape · уже панель — более жёсткий clamp */
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_LANDSCAPE_PX = 132;

/**
 * Имя >9 символов: полный кегль только на торгах до своего заказа;
 * после заказа (и в розыгрыше) — компакт, hover увеличивает.
 * ПК/планшет: рельс ★ над именем слева от аватара (правые кромки встык к chrome);
 * высота стека = аватар → слот не растёт; wrap fit-content.
 */
export function southNameLongCompact(opts: {
  name: string;
  hasPlacedBid: boolean;
}): boolean {
  return opts.name.trim().length > USER_SOUTH_NAME_LONG_CHARS && opts.hasPlacedBid;
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

/**
 * Вылет «умной» обводки слева за layout-кромку wrap (px).
 * Рельс ★+имя стыкуется снаружи: `right: calc(100% + outset)`.
 *  · idle name-badge: border 2 + ring ~1.5 ≈ 4px
 *  · ход: чуть толще ≈ 5px
 *  · order-ring: обод внутри layout → 0
 *  · scale(1.2): +10% ширины контента (вылет за layout-box)
 */
export function userSouthRailChromeOutsetPx(opts: {
  facePx: number;
  hasOrderRing: boolean;
  ringPadPx: number;
  hasScaleWrap: boolean;
  isYourTurn: boolean;
}): number {
  const { facePx, hasOrderRing, ringPadPx, hasScaleWrap, isYourTurn } = opts;
  const badgeOut = hasOrderRing ? 0 : isYourTurn ? 5 : 3;
  const contentW = Math.max(1, facePx + (hasOrderRing ? ringPadPx * 2 : 0));
  const scaleOut = hasScaleWrap ? Math.round(contentW * 0.1) : 0;
  const ringGlow = hasOrderRing ? 2 : 0;
  return badgeOut + scaleOut + ringGlow;
}
