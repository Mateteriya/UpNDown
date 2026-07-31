/**
 * Единые тайминги online v2 / host-automation / UI interstitial раздачи.
 * Клиент и сервер должны импортировать отсюда — иначе снова разъедутся.
 */

/** Карты полной взятки остаются на столе до completeTrick. */
export const TRICK_COMPLETE_HOLD_MS = 2000;

/**
 * Последняя взятка раздачи (allPlayed): дальше сразу interstitial со сбором в слот —
 * чуть короче hold, чтобы не дублировать длинную паузу на столе.
 */
export const TRICK_COMPLETE_HOLD_LAST_DEAL_MS = 1000;

/** Hold до completeTrick: обычная взятка vs последняя в раздаче. */
export function trickCompleteHoldMs(allPlayed: boolean | undefined | null): number {
  return allPlayed ? TRICK_COMPLETE_HOLD_LAST_DEAL_MS : TRICK_COMPLETE_HOLD_MS;
}

/**
 * После deal-complete до startNextDeal.
 * Должно покрывать клиентский interstitial
 * (reveal → slots → winner → totals → collapse) + запас на сеть/тик (online v2).
 * Сумма фаз UI ≈ 6.35s; держим ≥9s, чтобы оверлей не обрывался сервером.
 */
export const DEAL_COMPLETE_HOLD_MS = 9000;

/** Пауза перед ходом/заказом ИИ после любого commit — чтобы люди успели увидеть чужую карту. */
export const AI_MOVE_DELAY_MS = 650;

/**
 * Только стол: лица последней взятки, без оверлея.
 * Пауза «карты лежат», чтобы успеть прочитать взятку.
 */
export const LAST_TRICK_REVEAL_MS = 450;

/**
 * Фаза полёта карт к слоту победителя (ещё без оверлея результатов).
 * Должна быть ≥ LAST_TRICK_COLLECT_MS (+ небольшой хвост, чтобы не обрывать).
 */
export const LAST_TRICK_CARDS_PAUSE_MS = 2150;

/** Длительность анимации полёта карт последней взятки к слоту победителя. */
export const LAST_TRICK_COLLECT_MS = 2000;

/** Оверлей результатов + «Последняя взятка» (эхо): пауза до акцента «Итого». */
export const LAST_TRICK_WINNER_PAUSE_MS = 2000;

/** Акцент на «Итого» (running-total) до схлопывания — короче, чтобы раньше вызвать полёт в Σ. */
export const DEAL_RESULTS_TOTALS_ACCENT_MS = 1000;

/** Схлопывание таблицы результатов в кнопку. */
export const DEAL_RESULTS_COLLAPSING_MS = 750;
