/**
 * Канон панели пользователя · Юг (ПК / планшет / мобилка · имя).
 * Держать в синхроне с `src/styles/user-south-panel.css`.
 *
 * Режимы:
 *  · PC desktop 3p/4p — `!useTabletPcTableTuning`
 *  · Tablet shell 3p/4p — `useTabletPcTableTuning` (+ класс `.game-table-tablet-pc`)
 *  · Mobile viewport-mobile — плашка имени max 217px + fade/scroll при переполнении
 */

/** ПК · розыгрыш: лицо ≈ слот панели (без тёмного зазора) */
export const USER_SOUTH_AVATAR_PC_PLAY_PX = 66;
/** ПК · торги: без кольца — чуть крупнее слота */
export const USER_SOUTH_AVATAR_PC_BIDDING_PX = 70;
/** Планшет · розыгрыш */
export const USER_SOUTH_AVATAR_TABLET_PLAY_PX = 50;
/** Планшет · торги */
export const USER_SOUTH_AVATAR_TABLET_BIDDING_PX = 58;

/** ПК · компакт панели взяток (−8%), заказ 0 без scale */
export const USER_SOUTH_TRICKS_PANEL_SCALE = 0.92;

/** Длинное имя: порог символов для компактного кегля после заказа */
export const USER_SOUTH_NAME_LONG_CHARS = 9;

/** Розыгрыш: макс. ширина плашки имени (ellipsis + fade если не влезает) */
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_PC_PX = 180;
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_TABLET_PX = 155;
/** Моб. портрет · макс. ширина плашки имени (fade + scroll при переполнении) */
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_PX = 217;
/** Моб. landscape · уже панель — более жёсткий clamp */
export const USER_SOUTH_NAME_PLAY_PLAQUE_MAX_MOBILE_LANDSCAPE_PX = 132;

/**
 * Имя >9 символов: полный кегль (19 ПК / 17 планшет) только на торгах до своего заказа;
 * после заказа (и в розыгрыше) — компакт (14 / 12), hover увеличивает.
 * Розыгрыш: clamp ширины (180 ПК / 155 планшет), тонкий обод;
 * при переполнении — космический фиолетовый fade со «звёздочками» и автопрокрутка (~9–11 с); hover — полное имя.
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
