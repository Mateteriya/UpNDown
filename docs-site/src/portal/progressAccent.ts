/** Неон-подсветка границ: зелёный → циан → золото → сирень по мере роста %. */
export type ProgressAccent = 'green' | 'cyan' | 'gold' | 'violet';

/**
 * ≥76% — почти всё сделано (зелёный)
 * 51–75% — немного меньше, чем всё (циан)
 * 26–50% — половина или меньше (золото)
 * ≤25% — четверть или меньше (сирень)
 */
export function progressToAccent(pct: number): ProgressAccent {
  const p = Math.min(100, Math.max(0, pct));
  if (p >= 76) return 'green';
  if (p >= 51) return 'cyan';
  if (p >= 26) return 'gold';
  return 'violet';
}
