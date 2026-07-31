/**
 * ПК: пользовательский масштаб карт.
 * 3 игрока: boost 0…40%, стол поднимаем выше при увеличении карт.
 * 4 игрока: максимум 110%; сукно чуть уменьшаем (не поднимаем);
 *   рука чуть компактнее + меньше зазор до панели, без роста высоты страницы.
 * Мобильная вёрстка не использует эти настройки.
 */

export const PC_HAND_SCALE_BOOSTS = [0, 10, 20, 30, 40] as const;
export type PcHandScaleBoost = (typeof PC_HAND_SCALE_BOOSTS)[number];

export const PC_HAND_SCALE_MAX_THREE: PcHandScaleBoost = 40;
export const PC_HAND_SCALE_MAX_FOUR: PcHandScaleBoost = 10;

export const PC_HAND_SCALE_LS_KEY = 'updown_pc_hand_scale_boost';
export const PC_TABLE_SETTINGS_OPEN_LS_KEY = 'updown_pc_table_settings_open';

export function isPcHandScaleBoost(v: unknown): v is PcHandScaleBoost {
  return typeof v === 'number' && (PC_HAND_SCALE_BOOSTS as readonly number[]).includes(v);
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

/** Множитель карт: рука и карты на сукне. */
export function pcHandScaleMultiplier(boost: PcHandScaleBoost): number {
  return 1 + boost / 100;
}

/**
 * Адаптивный base руки на ПК при 100%.
 * ×1.4 вернул прежний натив; ×0.93 — чуть компактнее по вкусу (≈−7%).
 */
export const PC_HAND_NATIVE_RECALIBRATE = 1.4 * 0.93;
/** Планшет: постоянный доп. компакт руки (−5% × −5% × −3%). */
export const TABLET_HAND_COMPACT = 0.95 * 0.95 * 0.97;

export function resolvePcHandAdaptiveScale(cardCount: number): number {
  const adaptive =
    cardCount >= 11 ? 0.76 : cardCount >= 9 ? 0.82 : cardCount >= 7 ? 0.88 : 0.9;
  return adaptive * PC_HAND_NATIVE_RECALIBRATE;
}

/**
 * 4p при boost: рука чуть компактнее, чтобы влезла между сукном и панелью
 * без подъёма стола и без роста высоты страницы.
 * 110%: ×0.98 (раньше 0.93) — заполняем зазор стол↔рука (~+5%).
 */
export function pcFourSeatHandCompactMul(boost: PcHandScaleBoost): number {
  if (boost <= 0) return 1;
  return 0.98;
}

/**
 * Сукно:
 * - 3 игрока: лёгкий рост;
 * - 4 игрока: уменьшаем (освобождаем вертикаль над рукой).
 */
export function pcTableFeltScaleMultiplier(
  boost: PcHandScaleBoost,
  playerCount: 3 | 4,
): number {
  if (boost <= 0) return 1;
  if (playerCount === 4) {
    return 1 - (boost * 0.45) / 100; // 10% → 0.955 (чуть меньше сжимать)
  }
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
  boost: PcHandScaleBoost,
  playerCount: 3 | 4,
): number {
  if (boost <= 0) return 0;
  if (playerCount === 4) {
    switch (boost) {
      case 10:
        return 14;
      default:
        return 14;
    }
  }
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
 * 4p при 110%: отрицательная — сжимаем зазор до панели пользователя.
 */
export function pcHandToPanelGapPx(
  boost: PcHandScaleBoost,
  playerCount: 3 | 4 = 4,
): number {
  if (playerCount === 4) {
    if (boost <= 0) return 0;
    return -12; /* 16−12 = 4px до панели */
  }
  switch (boost) {
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
