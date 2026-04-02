/**
 * Сбор данных для обучения ИИ и персональных профилей.
 * Логируем исходы раздач по игроку (profileId); на основе этого строится
 * персональный ИИ и улучшается общая эвристика.
 * @see docs/PERSONAL-AI-CONCEPT.md
 */

const AI_LEARNING_KEY_PREFIX = 'updown_ai_deals_';
const MAX_RECORDS_PER_PROFILE = 500;

export interface DealOutcomeRecord {
  dealNumber: number;
  tricksInDeal: number;
  trump: boolean;
  bid: number;
  taken: number;
  points: number;
  /** Точное попадание: заказ = взятки */
  hit: boolean;
  ts: number;
}

function getStorageKey(profileId: string): string {
  return AI_LEARNING_KEY_PREFIX + profileId;
}

function loadRecords(profileId: string): DealOutcomeRecord[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(getStorageKey(profileId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r): r is DealOutcomeRecord =>
        r &&
        typeof r === 'object' &&
        typeof (r as DealOutcomeRecord).dealNumber === 'number' &&
        typeof (r as DealOutcomeRecord).tricksInDeal === 'number' &&
        typeof (r as DealOutcomeRecord).bid === 'number' &&
        typeof (r as DealOutcomeRecord).taken === 'number' &&
        typeof (r as DealOutcomeRecord).points === 'number' &&
        typeof (r as DealOutcomeRecord).hit === 'boolean'
    );
  } catch {
    return [];
  }
}

function saveRecords(profileId: string, records: DealOutcomeRecord[]): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const capped = records.slice(-MAX_RECORDS_PER_PROFILE);
    localStorage.setItem(getStorageKey(profileId), JSON.stringify(capped));
  } catch {
    /* ignore */
  }
}

/** Записать исход раздачи для одного игрока (вызывать при завершении раздачи). */
export function logDealOutcome(
  profileId: string,
  dealNumber: number,
  tricksInDeal: number,
  trump: boolean,
  bid: number,
  taken: number,
  points: number
): void {
  if (!profileId) return;
  const hit = bid === taken;
  const records = loadRecords(profileId);
  records.push({
    dealNumber,
    tricksInDeal,
    trump,
    bid,
    taken,
    points,
    hit,
    ts: Date.now(),
  });
  saveRecords(profileId, records);
}

/** Все записи по профилю (для построения персонального ИИ). */
export function getDealOutcomes(profileId: string): DealOutcomeRecord[] {
  return loadRecords(profileId);
}
