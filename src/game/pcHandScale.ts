/**
 * ПК: пользовательский масштаб карт.
 * 3 игрока: boost 0…40%, стол поднимаем выше при увеличении карт.
 * 4 игрока: UI 94%…106% (±6 от новой «100%»);
 *   новая 100% = середина 98%…112% абсолюта (=105% старого);
 *   абс. ≈97%…≈112%; сукно чуть уменьшаем при увеличении (не поднимаем).
 * Мобильная вёрстка не использует эти настройки.
 */

export const PC_HAND_SCALE_BOOSTS = [0, 10, 20, 30, 40] as const;
export type PcHandScaleBoost = (typeof PC_HAND_SCALE_BOOSTS)[number];

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
export const PC_FOUR_HAND_SCALE_PCT_DEFAULT = 100;
export const PC_FOUR_HAND_SCALE_PCT_STEP = 1;

export const PC_HAND_SCALE_LS_KEY = 'updown_pc_hand_scale_boost';
export const PC_FOUR_HAND_SCALE_LS_KEY = 'updown_pc_four_hand_scale_pct';
export const PC_TABLE_SETTINGS_OPEN_LS_KEY = 'updown_pc_table_settings_open';

export type PcFourHandScalePct = number;

export function isPcHandScaleBoost(v: unknown): v is PcHandScaleBoost {
  return typeof v === 'number' && (PC_HAND_SCALE_BOOSTS as readonly number[]).includes(v);
}

export function clampPcFourHandScalePct(pct: number): PcFourHandScalePct {
  if (!Number.isFinite(pct)) return PC_FOUR_HAND_SCALE_PCT_DEFAULT;
  const rounded = Math.round(pct);
  return Math.max(
    PC_FOUR_HAND_SCALE_PCT_MIN,
    Math.min(PC_FOUR_HAND_SCALE_PCT_MAX, rounded),
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
    if (keyed != null) return clampPcFourHandScalePct(Number(keyed));
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
    localStorage.setItem(PC_FOUR_HAND_SCALE_LS_KEY, String(clampPcFourHandScalePct(pct)));
  } catch {
    /* ignore */
  }
}

export function bumpPcFourHandScalePct(
  current: PcFourHandScalePct,
  dir: 1 | -1,
): PcFourHandScalePct {
  return clampPcFourHandScalePct(current + dir * PC_FOUR_HAND_SCALE_PCT_STEP);
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

export function prevPcHandScaleBoost(current: PcHandScaleBoost): PcHandScaleBoost {
  const i = PC_HAND_SCALE_BOOSTS.indexOf(current);
  if (i <= 0) return 0;
  return PC_HAND_SCALE_BOOSTS[i - 1]!;
}

/** Множитель карт (3p): рука и карты на сукне. */
export function pcHandScaleMultiplier(boost: PcHandScaleBoost): number {
  return 1 + boost / 100;
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
 */
export const TABLET_FOUR_HAND_ABS_AT_100 = 1;

export function tabletFourHandScaleMultiplier(uiPct: PcFourHandScalePct): number {
  const pct = clampPcFourHandScalePct(uiPct);
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
 * Планшет · 4p: высота карты (base 100×scale) на 2px меньше —
 * плашка руки сжимается вместе с контентом; пиксели уходят в зазор до панели Юга.
 */
export const TABLET_FOUR_HAND_CARD_BASE_H = 100;
/** Сколько px высоты карты отдаём в зазор рука↔панель (накопительно). */
export const TABLET_FOUR_HAND_COMPACT_PX = 2;
export const TABLET_FOUR_HAND_TO_PANEL_GAP_PX = 6 + TABLET_FOUR_HAND_COMPACT_PX; /* было 6 */

/** scale после −N px по высоте карты (только планшет 4p). */
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
 * - 3 игрока: лёгкий рост;
 * - 4 игрока: уменьшаем при UI > 100% (освобождаем вертикаль над рукой).
 */
export function pcTableFeltScaleMultiplier(
  boostOrFourPct: number,
  playerCount: 3 | 4,
): number {
  if (playerCount === 4) {
    const pct = clampPcFourHandScalePct(boostOrFourPct);
    const above = Math.max(0, pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT);
    if (above <= 0) return 1;
    /* при +6% UI ≈ прежний 0.955 при старых 110% */
    return 1 - (above * 0.045) / 6;
  }
  const boost = boostOrFourPct as PcHandScaleBoost;
  if (boost <= 0) return 1;
  return 1 + (boost * 0.35) / 100;
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
  boost: PcHandScaleBoost,
  playerCount: 3 | 4,
): number {
  return pcTableUpOffsetBasePx(playerCount) + pcHandTableClearancePx(boost, playerCount);
}

/**
 * Доп. подъём стола (px к базе). Только 3p при boost > 0.
 */
export function pcTableLiftExtraPx(
  boost: PcHandScaleBoost,
  playerCount: 3 | 4 = 4,
): number {
  return pcHandTableClearancePx(boost, playerCount);
}

/** Сдвиг боковых панелей Запад/Восток от стола (px). */
export function pcSidePanelPushPx(
  boostOrFourPct: number,
  playerCount: 3 | 4,
): number {
  if (playerCount === 4) {
    const pct = clampPcFourHandScalePct(boostOrFourPct);
    const above = Math.max(0, pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT);
    if (above <= 0) return 0;
    return Math.round((14 * above) / 6);
  }
  const boost = boostOrFourPct as PcHandScaleBoost;
  if (boost <= 0) return 0;
  switch (boost) {
    case 10:
      return 14;
    case 20:
      return 22;
    case 30:
      return 30;
    case 40:
      return 40;
    default:
      return 0;
  }
}

/**
 * Добавка к marginBottom рамки руки (поверх базы 16px на ПК).
 * 4p при UI > 100%: отрицательная — сжимаем зазор до панели пользователя.
 */
export function pcHandToPanelGapPx(
  boostOrFourPct: number,
  playerCount: 3 | 4 = 4,
): number {
  if (playerCount === 4) {
    const pct = clampPcFourHandScalePct(boostOrFourPct);
    const above = Math.max(0, pct - PC_FOUR_HAND_SCALE_PCT_DEFAULT);
    if (above <= 0) return 0;
    return Math.round((-12 * above) / 6);
  }
  switch (boostOrFourPct as PcHandScaleBoost) {
    case 10:
      return 6;
    case 20:
      return 12;
    case 30:
      return 18;
    case 40:
      return 24;
    default:
      return 0;
  }
}

/**
 * Зазор рука ↔ сукно через подъём стола.
 * 4p: 0 (стол не поднимаем — только уменьшаем сукно + компактная рука).
 * 3p: 110→39, 120→36, 130→42, 140→50.
 */
export function pcHandTableClearancePx(
  boost: PcHandScaleBoost,
  playerCount: 3 | 4 = 4,
): number {
  if (playerCount === 4) return 0;
  switch (boost) {
    case 10:
      return 39;
    case 20:
      return 36;
    case 30:
      return 42;
    case 40:
      return 50;
    default:
      return 0;
  }
}

/**
 * Доп. высота полосы Юга + spacer.
 * 4p: 0 — не расширять страницу по высоте.
 */
export function pcHandScaleExtraHeightPx(
  boost: PcHandScaleBoost,
  playerCount: 3 | 4,
): number {
  if (boost <= 0) return 0;
  if (playerCount === 4) return 0;
  switch (boost) {
    case 10:
      return 40;
    case 20:
      return 56;
    case 30:
      return 72;
    case 40:
      return 90;
    default:
      return 0;
  }
}
