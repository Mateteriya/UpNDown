/** Режим фишек в UI таблицы Σ (два варианта; банк — отдельно, позже). */

export type ResultsChipView = 'accuracy_bonus' | 'vs_average';

export const RESULTS_CHIP_VIEW_LS = 'updown_results_chip_view';

export function readResultsChipView(): ResultsChipView {
  try {
    const v = localStorage.getItem(RESULTS_CHIP_VIEW_LS);
    if (v === 'vs_average' || v === 'accuracy_bonus') return v;
  } catch {
    /* ignore */
  }
  return 'accuracy_bonus';
}

export function writeResultsChipView(view: ResultsChipView): void {
  try {
    localStorage.setItem(RESULTS_CHIP_VIEW_LS, view);
  } catch {
    /* ignore */
  }
}
