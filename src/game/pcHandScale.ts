/**
 * ПК: пользовательский масштаб карт.
 * 3 игрока: UI 95%…125%, шаг 5% (100% = идеальный); стол поднимаем выше при увеличении карт.
 * 4 игрока: UI 94%…106% (±6 от новой «100%»);
 *   новая 100% = середина 98%…112% абсолюта (=105% старого);
 *   абс. ≈97%…≈112%; сукно чуть уменьшаем при увеличении (не поднимаем).
 * Мобильная вёрстка не использует эти настройки.
 */

/** @deprecated 3p перешёл на UI-проценты 95…125; оставлено для миграции/legacy. */
export const PC_HAND_SCALE_BOOSTS = [0, 10, 20, 30, 40] as const;
/** @deprecated см. PC_THREE_HAND_SCALE_PCT_* */
export type PcHandScaleBoost = (typeof PC_HAND_SCALE_BOOSTS)[number];

/** @deprecated 3p max теперь 125% UI (= +25). */
export const PC_HAND_SCALE_MAX_THREE: PcHandScaleBoost = 40;
/** @deprecated 4p перешёл на UI-проценты 94…106; оставлено для совместимости чтения. */
export const PC_HAND_SCALE_MAX_FOUR: PcHandScaleBoost = 10;

/** 4p: бывший компакт при 110% и новый потолок → середина = новая «100%». */
export const PC_FOUR_HAND_ABS_REF_LOW = 0.98;
export const PC_FOUR_HAND_ABS_REF_HIGH = 1.12;
/** Абсолютный множитель при UI 100%. */
export const PC_FOUR_HAND_ABS_AT_100 =
  (PC_FOUR_HAND_ABS_REF_LOW + PC_FOUR_HAND_ABS_REF_HIGH) / 2; /* 1.05 */

export const PC_FOUR_HAND_SCALE_PCT_MIN = 94; /* 100 − 6 */
export const PC_FOUR_HAND_SCALE_PCT_MAX = 106; /* 100 + 6 */
/** Планшет / mid · 4p: потолок шестерёнки карт выше, чем на ПК. */
export const TABLET_FOUR_HAND_SCALE_PCT_MAX = 200;
/** Потолок в storage/read — max(ПК, планшет), чтобы 130% не срезался при чтении. */
export const FOUR_HAND_SCALE_PCT_STORAGE_MAX = TABLET_FOUR_HAND_SCALE_PCT_MAX;
export const PC_FOUR_HAND_SCALE_PCT_DEFAULT = 100;
export const PC_FOUR_HAND_SCALE_PCT_STEP = 1;

/** 3p: идеал 100%; вниз до 95%, вверх до 125%, шаг 5%. */
export const PC_THREE_HAND_SCALE_PCT_MIN = 95;
export const PC_THREE_HAND_SCALE_PCT_MAX = 125;
export const PC_THREE_HAND_SCALE_PCT_DEFAULT = 100;
export const PC_THREE_HAND_SCALE_PCT_STEP = 5;

export const PC_HAND_SCALE_LS_KEY = 'updown_pc_hand_scale_boost';
export const PC_THREE_HAND_SCALE_LS_KEY = 'updown_pc_three_hand_scale_pct';
export const PC_FOUR_HAND_SCALE_LS_KEY = 'updown_pc_four_hand_scale_pct';
export const PC_TABLE_SETTINGS_OPEN_LS_KEY = 'updown_pc_table_settings_open';
export const PC_SCALE_WHEEL_ARMED_LS_KEY = 'updown_pc_scale_wheel_armed';

export type PcFourHandScalePct = number;
export type PcThreeHandScalePct = number;

export function isPcHandScaleBoost(v: unknown): v is PcHandScaleBoost {
  return typeof v === 'number' && (PC_HAND_SCALE_BOOSTS as readonly number[]).includes(v);
}

export function clampPcFourHandScalePct(
  pct: number,
  max: number = PC_FOUR_HAND_SCALE_PCT_MAX,
): PcFourHandScalePct {
  if (!Number.isFinite(pct)) return PC_FOUR_HAND_SCALE_PCT_DEFAULT;
  const rounded = Math.round(pct);
  const hi =
    Number.isFinite(max) && max >= PC_FOUR_HAND_SCALE_PCT_MIN
      ? max
      : PC_FOUR_HAND_SCALE_PCT_MAX;
  return Math.max(PC_FOUR_HAND_SCALE_PCT_MIN, Math.min(hi, rounded));
}

export function clampPcThreeHandScalePct(pct: number): PcThreeHandScalePct {
  if (!Number.isFinite(pct)) return PC_THREE_HAND_SCALE_PCT_DEFAULT;
  const stepped =
    Math.round(pct / PC_THREE_HAND_SCALE_PCT_STEP) * PC_THREE_HAND_SCALE_PCT_STEP;
  return Math.max(
    PC_THREE_HAND_SCALE_PCT_MIN,
    Math.min(PC_THREE_HAND_SCALE_PCT_MAX, stepped),
  );
}

export function pcHandScaleMaxForSeats(playerCount: 3 | 4): PcHandScaleBoost {
  return playerCount === 3 ? PC_HAND_SCALE_MAX_THREE : PC_HAND_SCALE_MAX_FOUR;
}

export function clampPcHandScaleBoost(
  boost: PcHandScaleBoost,
  playerCount: 3 | 4,
): PcHandScaleBoost {
  const max = pcHandScaleMaxForSeats(playerCount);
  return (boost > max ? max : boost) as PcHandScaleBoost;
}

/** Старый boost 0…40 → UI 100…125 (потолок новой шкалы). */
function migrateLegacyThreeBoostToPct(boost: number): PcThreeHandScalePct {
  if (!Number.isFinite(boost)) return PC_THREE_HAND_SCALE_PCT_DEFAULT;
  return clampPcThreeHandScalePct(PC_THREE_HAND_SCALE_PCT_DEFAULT + boost);
}

export function readPcHandScaleBoost(): PcHandScaleBoost {
  try {
    if (typeof localStorage === 'undefined') return 0;
    const raw = localStorage.getItem(PC_HAND_SCALE_LS_KEY);
    if (raw == null) return 0;
    const n = Number(raw);
    if (isPcHandScaleBoost(n)) return n;
  } catch {
    /* ignore */
  }
  return 0;
}

export function writePcHandScaleBoost(boost: PcHandScaleBoost): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PC_HAND_SCALE_LS_KEY, String(boost));
  } catch {
    /* ignore */
  }
}

export function readPcThreeHandScalePct(): PcThreeHandScalePct {
  try {
    if (typeof localStorage === 'undefined') return PC_THREE_HAND_SCALE_PCT_DEFAULT;
    const keyed = localStorage.getItem(PC_THREE_HAND_SCALE_LS_KEY);
    if (keyed != null) return clampPcThreeHandScalePct(Number(keyed));
    const legacy = localStorage.getItem(PC_HAND_SCALE_LS_KEY);
    if (legacy != null) return migrateLegacyThreeBoostToPct(Number(legacy));
  } catch {
    /* ignore */
  }
  return PC_THREE_HAND_SCALE_PCT_DEFAULT;
}

export function writePcThreeHandScalePct(pct: PcThreeHandScalePct): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      PC_THREE_HAND_SCALE_LS_KEY,
      String(clampPcThreeHandScalePct(pct)),
    );
  } catch {
    /* ignore */
  }
}

export function bumpPcThreeHandScalePct(
  current: PcThreeHandScalePct,
  dir: 1 | -1,
): PcThreeHandScalePct {
  return clampPcThreeHandScalePct(
    current + dir * PC_THREE_HAND_SCALE_PCT_STEP,
  );
}

/** Старый boost 0→100, 10→106 (макс. новой шкалы). */
function migrateLegacyFourBoostToPct(boost: number): PcFourHandScalePct {
  if (!Number.isFinite(boost) || boost <= 0) return PC_FOUR_HAND_SCALE_PCT_DEFAULT;
  if (boost >= 10) return PC_FOUR_HAND_SCALE_PCT_MAX;
  return clampPcFourHandScalePct(PC_FOUR_HAND_SCALE_PCT_DEFAULT + boost);
}

export function readPcFourHandScalePct(): PcFourHandScalePct {
  try {
    if (typeof localStorage === 'undefined') return PC_FOUR_HAND_SCALE_PCT_DEFAULT;
    const keyed = localStorage.getItem(PC_FOUR_HAND_SCALE_LS_KEY);
    if (keyed != null) {
      return clampPcFourHandScalePct(Number(keyed), FOUR_HAND_SCALE_PCT_STORAGE_MAX);
    }
    const legacy = localStorage.getItem(PC_HAND_SCALE_LS_KEY);
    if (legacy != null) return migrateLegacyFourBoostToPct(Number(legacy));
  } catch {
    /* ignore */
  }
  return PC_FOUR_HAND_SCALE_PCT_DEFAULT;
}

export function writePcFourHandScalePct(pct: PcFourHandScalePct): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(
      PC_FOUR_HAND_SCALE_LS_KEY,
      String(clampPcFourHandScalePct(pct, FOUR_HAND_SCALE_PCT_STORAGE_MAX)),
    );
  } catch {
    /* ignore */
  }
}

export function bumpPcFourHandScalePct(
  current: PcFourHandScalePct,
  dir: 1 | -1,
  step: number = PC_FOUR_HAND_SCALE_PCT_STEP,
  max: number = PC_FOUR_HAND_SCALE_PCT_MAX,
): PcFourHandScalePct {
  const s = Number.isFinite(step) && step > 0 ? step : PC_FOUR_HAND_SCALE_PCT_STEP;
  const base = PC_FOUR_HAND_SCALE_PCT_DEFAULT;
  let next: number;
  if (s <= 1) {
    next = current + dir * s;
  } else if (dir > 0) {
    /* Сетка …95,100,105… — 100% всегда достижим (шаг 5 с min 94 иначе давал 94→99→104). */
    const k = Math.floor((current - base) / s) + 1;
    next = base + k * s;
  } else {
    const k = Math.ceil((current - base) / s) - 1;
    next = base + k * s;
  }
  return clampPcFourHandScalePct(next, max);
}

/** Панель «Настройки» на столе ПК: по умолчанию свёрнута. */
export function readPcTableSettingsOpen(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(PC_TABLE_SETTINGS_OPEN_LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePcTableSettingsOpen(open: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PC_TABLE_SETTINGS_OPEN_LS_KEY, open ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** Регулировка масштаба карт скроллом: помнить выбор между открытиями капсулы. */
export function readPcScaleWheelArmed(): boolean {
  try {
    if (typeof localStorage === 'undefined') return false;
    return localStorage.getItem(PC_SCALE_WHEEL_ARMED_LS_KEY) === '1';
  } catch {
    return false;
  }
}

export function writePcScaleWheelArmed(armed: boolean): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(PC_SCALE_WHEEL_ARMED_LS_KEY, armed ? '1' : '0');
  } catch {
    /* ignore */
  }
}

/** @deprecated 3p — bumpPcThreeHandScalePct */
export function nextPcHandScaleBoost(
  current: PcHandScaleBoost,
  playerCount: 3 | 4 = 4,
): PcHandScaleBoost {
  const max = pcHandScaleMaxForSeats(playerCount);
  const i = PC_HAND_SCALE_BOOSTS.indexOf(current);
  if (i < 0) return 0;
  if (i >= PC_HAND_SCALE_BOOSTS.length - 1) return clampPcHandScaleBoost(current, playerCount);
  const next = PC_HAND_SCALE_BOOSTS[i + 1]!;
  return next > max ? clampPcHandScaleBoost(current, playerCount) : next;
}

/** @deprecated 3p — bumpPcThreeHandScalePct */
export function prevPcHandScaleBoost(current: PcHandScaleBoost): PcHandScaleBoost {
  const i = PC_HAND_SCALE_BOOSTS.indexOf(current);
  if (i <= 0) return 0;
  return PC_HAND_SCALE_BOOSTS[i - 1]!;
}

/** @deprecated 3p — pcThreeHandScaleMultiplier */
export function pcHandScaleMultiplier(boost: PcHandScaleBoost): number {
  return 1 + boost / 100;
}

/** Множитель карт (3p): рука и карты на сукне; UI 100% → 1.0. */
export function pcThreeHandScaleMultiplier(uiPct: PcThreeHandScalePct): number {
  return clampPcThreeHandScalePct(uiPct) / 100;
}

/**
 * Планшет · 3p: цифры заказа на столе растут слабее руки (≈40% от дельты UI).
 * 125% карт → ~110% кнопок; 95% → ~98%.
 */
export const TABLET_THREE_BID_BTN_SCALE_FOLLOW = 0.4;

export function tabletThreeBidBtnScaleMul(cardScaleMul: number): number {
  if (!(cardScaleMul > 0) || !Number.isFinite(cardScaleMul)) return 1;
  return 1 + (cardScaleMul - 1) * TABLET_THREE_BID_BTN_SCALE_FOLLOW;
}

/**
 * Планшет · 3p: сдвиг руки вниз при UI > 100%, чтобы рост шёл к панели Юга, а не к столу.
 * (верх карты остаётся на месте «100%»; лишняя высота уходит вниз.)
 */
export const TABLET_THREE_HAND_CARD_BASE_H = 100;
export const TABLET_THREE_HAND_CARD_MARGIN = 4;

export function tabletThreeHandGrowDownPx(
  handScaleAt100: number,
  uiPct: PcThreeHandScalePct,
): number {
  const mul = pcThreeHandScaleMultiplier(uiPct);
  if (!(mul > 1) || !(handScaleAt100 > 0)) return 0;
  const h100 =
    Math.round(TABLET_THREE_HAND_CARD_BASE_H * handScaleAt100) +
    2 * Math.round(TABLET_THREE_HAND_CARD_MARGIN * handScaleAt100);
  const hNow =
    Math.round(TABLET_THREE_HAND_CARD_BASE_H * handScaleAt100 * mul) +
    2 * Math.round(TABLET_THREE_HAND_CARD_MARGIN * handScaleAt100 * mul);
  return Math.max(0, hNow - h100);
}

/**
 * 4p ПК: абсолютный множитель карт.
 * UI 100% → 1.05; UI 94% → ≈0.987; UI 106% → ≈1.113.
 */
export function pcFourHandScaleMultiplier(uiPct: PcFourHandScalePct): number {
  const pct = clampPcFourHandScalePct(uiPct);
  return PC_FOUR_HAND_ABS_AT_100 * (pct / 100);
}

/**
 * Планшет · 4p: UI 100% = компактный base без ПК-надбавки +5%.
 * (На ПК «100%» = abs 1.05; на планшете это делало руку заметно крупнее калибровки.)
 * Планшет · 3p: `pcThreeHandScaleMultiplier` (95…125%, шаг 5%).
 */
export const TABLET_FOUR_HAND_ABS_AT_100 = 1;

export function tabletFourHandScaleMultiplier(uiPct: PcFourHandScalePct): number {
  const pct = clampPcFourHandScalePct(uiPct, TABLET_FOUR_HAND_SCALE_PCT_MAX);
  return TABLET_FOUR_HAND_ABS_AT_100 * (pct / 100);
}

/**
 * Адаптивный base руки на ПК при 100%.
 * ×1.4 вернул прежний натив; ×0.93 — чуть компактнее по вкусу (≈−7%).
 */
export const PC_HAND_NATIVE_RECALIBRATE = 1.4 * 0.93;
/** Планшет: постоянный доп. компакт руки (−5% × −5% × −3%). */
export const TABLET_HAND_COMPACT = 0.95 * 0.95 * 0.97;

/**
 * Планшет · 4p: размер карт руки = сырой scale × этот множитель × (база +boost) × UI.
 * Без CSS `zoom` (Safari/WebView его игнорирует).
 */
export const TABLET_FOUR_HAND_CARD_SIZE_MUL = 0.85;
/** Планшет · 4p: +N px к базовой высоте карты (после SIZE_MUL). */
export const TABLET_FOUR_HAND_BASE_BOOST_PX = 3;
/**
 * Планшет · 4p: шаг шестерёнки UI%.
 * 1 UI% ≈ 1px высоты → шаг 5% = ±5px за клик.
 */
export const TABLET_FOUR_HAND_SCALE_PCT_STEP = 5;

/** Зазор рука↔панель Юга на планшете · 4p (CSS margin-bottom). */
export const TABLET_FOUR_HAND_TO_PANEL_GAP_PX = 8;

/** @deprecated для руки; оставлено для карт на сукне (см. tabletFourTableCard*). */
export const TABLET_FOUR_HAND_CARD_BASE_H = 100;
export const TABLET_FOUR_HAND_COMPACT_PX = 2;

/** +boostPx к высоте (base 100×scale). */
export function tabletFourHandBoostBasePx(
  scale: number,
  boostPx = TABLET_FOUR_HAND_BASE_BOOST_PX,
  baseHeight = TABLET_FOUR_HAND_CARD_BASE_H,
): number {
  const h = baseHeight * scale;
  if (!(h > 0) || boostPx === 0) return scale;
  return scale * ((h + boostPx) / h);
}

/**
 * Планшет · 4p: UI% → scale.
 * 100% = baseScaleAt100; каждый ±1 UI% = ±1px высоты (шаг кнопки 2% → ±2px).
 */
export function tabletFourHandScaleFromUiPct(
  baseScaleAt100: number,
  uiPct: PcFourHandScalePct,
  baseHeight = TABLET_FOUR_HAND_CARD_BASE_H,
): number {
  const pct = clampPcFourHandScalePct(uiPct, TABLET_FOUR_HAND_SCALE_PCT_MAX);
  const h100 = baseHeight * baseScaleAt100;
  const h = Math.max(1, h100 + (pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT));
  return h / baseHeight;
}

/** scale после −N px по высоте (карты на сукне и утилиты). */
export function tabletFourHandScaleMinus1px(
  scale: number,
  baseHeight = TABLET_FOUR_HAND_CARD_BASE_H,
  compactPx = TABLET_FOUR_HAND_COMPACT_PX,
): number {
  const h = baseHeight * scale;
  if (!(h > compactPx) || compactPx <= 0) return scale;
  return scale * ((h - compactPx) / h);
}

/** Планшет · 4p: карты на сукне (compact 52×76) −2px по высоте при столе 100% (не мобила). */
export const TABLET_FOUR_TABLE_CARD_BASE_H = 76;
export const TABLET_FOUR_TABLE_CARD_COMPACT_PX = 2;

export function tabletFourTableCardScaleMinus1px(scale: number): number {
  return tabletFourHandScaleMinus1px(
    scale,
    TABLET_FOUR_TABLE_CARD_BASE_H,
    TABLET_FOUR_TABLE_CARD_COMPACT_PX,
  );
}

/**
 * Планшет · 4p: смещение высоты карт на сукне относительно «сырого» scale
 * (поверх базового −2px при 100%):
 * - 103% → +1px; 104…108% → ещё +1px (+2);
 * - 99…98% → −1px; 97…96% → ещё −1px (−2); 95…94% (и ниже) → ещё −1px (−3).
 */
export function tabletFourTableCardBonusPx(tableScalePct: number): number {
  const pct = Math.round(tableScalePct);
  if (pct >= 104) return 2;
  if (pct >= 103) return 1;
  if (pct <= 95) return -3;
  if (pct <= 97) return -2;
  if (pct <= 99) return -1;
  return 0;
}

/** Итоговый scale: базовый компакт −2px + бонус/штраф от масштаба стола. */
export function tabletFourTableCardScaleWithTablePct(
  scale: number,
  tableScalePct: number,
): number {
  const deltaPx = -TABLET_FOUR_TABLE_CARD_COMPACT_PX + tabletFourTableCardBonusPx(tableScalePct);
  const h = TABLET_FOUR_TABLE_CARD_BASE_H * scale;
  if (deltaPx === 0) return scale;
  if (deltaPx < 0 && !(h > -deltaPx)) return scale;
  return scale * ((h + deltaPx) / h);
}

export function resolvePcHandAdaptiveScale(cardCount: number): number {
  const adaptive =
    cardCount >= 11 ? 0.76 : cardCount >= 9 ? 0.82 : cardCount >= 7 ? 0.88 : 0.9;
  return adaptive * PC_HAND_NATIVE_RECALIBRATE;
}

/**
 * @deprecated Компакт 0.98 вшит в новую шкалу 4p (середина 98…112).
 * Оставлено как 1 — не умножать повторно.
 */
export function pcFourSeatHandCompactMul(_boostOrPct?: number): number {
  return 1;
}

/**
 * Сукно:
 * - 3 игрока: лёгкий рост при UI > 100%;
 * - 4 игрока: уменьшаем при UI > 100% (освобождаем вертикаль над рукой).
 */
export function pcTableFeltScaleMultiplier(
  boostOrSeatPct: number,
  playerCount: 3 | 4,
): number {
  if (playerCount === 4) {
    const pct = clampPcFourHandScalePct(boostOrSeatPct);
    const above = Math.max(0, pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT);
    if (above <= 0) return 1;
    /* при +6% UI ≈ прежний 0.955 при старых 110% */
    return 1 - (above * 0.045) / 6;
  }
  const pct = clampPcThreeHandScalePct(boostOrSeatPct);
  const above = Math.max(0, pct - PC_THREE_HAND_SCALE_PCT_DEFAULT);
  if (above <= 0) return 1;
  return 1 + (above * 0.35) / 100;
}

/** Базовый подъём блока стола (translateY), px — 4p и CSS fallback. */
export const PC_TABLE_UP_OFFSET_BASE = 149;
/** 3p ПК: изначальное (100%) положение сукна выше на 32px. */
export const PC_TABLE_UP_OFFSET_BASE_THREE = 181;

export function pcTableUpOffsetBasePx(playerCount: 3 | 4): number {
  return playerCount === 3 ? PC_TABLE_UP_OFFSET_BASE_THREE : PC_TABLE_UP_OFFSET_BASE;
}

/** Итоговый подъём стола: база + clearance от масштаба. */
export function pcTableUpOffsetTotalPx(
  threePctOrBoost: number,
  playerCount: 3 | 4,
): number {
  return pcTableUpOffsetBasePx(playerCount) + pcHandTableClearancePx(threePctOrBoost, playerCount);
}

/**
 * Доп. подъём стола (px к базе). Только 3p при UI > 100%.
 */
export function pcTableLiftExtraPx(
  threePctOrBoost: number,
  playerCount: 3 | 4 = 4,
): number {
  return pcHandTableClearancePx(threePctOrBoost, playerCount);
}

/** Сдвиг боковых панелей Запад/Восток от стола (px). */
export function pcSidePanelPushPx(
  boostOrSeatPct: number,
  playerCount: 3 | 4,
): number {
  if (playerCount === 4) {
    const pct = clampPcFourHandScalePct(boostOrSeatPct);
    const above = Math.max(0, pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT);
    if (above <= 0) return 0;
    return Math.round((14 * above) / 6);
  }
  switch (clampPcThreeHandScalePct(boostOrSeatPct)) {
    case 105:
      return 7;
    case 110:
      return 14;
    case 115:
      return 18;
    case 120:
      return 22;
    case 125:
      return 26;
    default:
      return 0;
  }
}

/**
 * Добавка к marginBottom рамки руки (поверх базы 16px на ПК).
 * 4p при UI > 100%: отрицательная — сжимаем зазор до панели пользователя.
 */
export function pcHandToPanelGapPx(
  boostOrSeatPct: number,
  playerCount: 3 | 4 = 4,
): number {
  if (playerCount === 4) {
    const pct = clampPcFourHandScalePct(boostOrSeatPct);
    const above = Math.max(0, pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT);
    if (above <= 0) return 0;
    return Math.round((-12 * above) / 6);
  }
  switch (clampPcThreeHandScalePct(boostOrSeatPct)) {
    case 105:
      return 3;
    case 110:
      return 6;
    case 115:
      return 9;
    case 120:
      return 12;
    case 125:
      return 15;
    default:
      return 0;
  }
}

/**
 * Зазор рука ↔ сукно через подъём стола.
 * 4p: 0 (стол не поднимаем — только уменьшаем сукно + компактная рука).
 * 3p: ступени от UI 105…125 (бывш. 110→39 … 140→50).
 */
export function pcHandTableClearancePx(
  threePctOrBoost: number,
  playerCount: 3 | 4 = 4,
): number {
  if (playerCount === 4) return 0;
  switch (clampPcThreeHandScalePct(threePctOrBoost)) {
    case 105:
      return 20;
    case 110:
      return 39;
    case 115:
      return 37;
    case 120:
      return 36;
    case 125:
      return 40;
    default:
      return 0;
  }
}

/**
 * Доп. высота полосы Юга + spacer.
 * 4p: 0 — не расширять страницу по высоте.
 */
export function pcHandScaleExtraHeightPx(
  threePctOrBoost: number,
  playerCount: 3 | 4,
): number {
  if (playerCount === 4) return 0;
  switch (clampPcThreeHandScalePct(threePctOrBoost)) {
    case 105:
      return 20;
    case 110:
      return 40;
    case 115:
      return 48;
    case 120:
      return 56;
    case 125:
      return 64;
    default:
      return 0;
  }
}
