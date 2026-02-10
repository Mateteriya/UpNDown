/**
 * Подсчёт очков по правилам Up&Down
 * @see TZ.md раздел 2.1.2
 */

/**
 * Вычисляет очки за раздачу для одного игрока
 */
export function calculateDealPoints(bid: number, taken: number): number {
  if (bid === 0 && taken === 0) {
    return 5;
  }
  if (bid === 0 && taken > 0) {
    // Заказ 0, перебор: +1 за каждую взятку
    return taken;
  }
  if (bid === taken) {
    // Точное попадание
    return 10 * bid;
  }
  if (taken < bid) {
    // Недобор
    return -10 * (bid - taken);
  }
  // Перебор (при заказе > 0)
  return taken;
}

/**
 * Восстанавливает количество взяток по заказу и очкам за раздачу (для статистики «точность заказов»).
 */
export function getTakenFromDealPoints(bid: number, points: number): number {
  if (bid === 0) return points === 5 ? 0 : points;
  if (points === 10 * bid) return bid;
  if (points < 0) return bid + points / 10;
  return points; // перебор
}
