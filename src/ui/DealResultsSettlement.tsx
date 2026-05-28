/**
 * Блок «Фишки» в таблице результатов: переключение Середина / Точный заказ.
 */

import { useCallback, useMemo, useState } from 'react';
import type { DealResult } from '../game/GameEngine';
import {
  computePartySettlement,
  SETTLEMENT_MODE_LABELS,
  type SettlementMode,
} from '../game/partySettlement';
import {
  readResultsChipView,
  writeResultsChipView,
  type ResultsChipView,
} from '../game/resultsChipView';

export type { ResultsChipView };

export const RESULTS_CHIP_MODE_HELP: Record<ResultsChipView, string> = {
  vs_average:
    'Выбор режима подсчёта выигрыша.\n\n«Середина стола»: считаем среднее итоговых очков по всем игрокам и сравниваем каждого с этим средним. Кто выше — в плюсе, кто ниже — в минусе. Сумма фишек по столу = 0 (это перераспределение, без «приза сверху»).',
  accuracy_bonus:
    'Выбор режима подсчёта выигрыша.\n\n«Точный заказ»: сначала считаем как «Середина стола», затем добавляем +10 фишек за каждую раздачу, где заказ = взял. Это небольшой бонус за точность, поэтому сумма фишек по столу может быть не нулевой.',
};

export function cycleResultsChipView(view: ResultsChipView): ResultsChipView {
  return view === 'accuracy_bonus' ? 'vs_average' : 'accuracy_bonus';
}

const toggleWrapStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  flexWrap: 'wrap',
  marginTop: 8,
  marginBottom: 4,
};

export function useResultsChipView(): [ResultsChipView, (v: ResultsChipView) => void] {
  const [view, setView] = useState<ResultsChipView>(() => readResultsChipView());
  const set = useCallback((v: ResultsChipView) => {
    setView(v);
    writeResultsChipView(v);
  }, []);
  return [view, set];
}

export function usePartySettlement(
  dealHistory: DealResult[],
  playerCount: number,
  chipView: ResultsChipView
) {
  return useMemo(
    () => computePartySettlement(dealHistory, playerCount as 3 | 4, chipView),
    [dealHistory, playerCount, chipView]
  );
}

export function chipColor(chips: number): string {
  if (chips > 0) return '#4ade80';
  if (chips < 0) return '#f87171';
  return '#e2e8f0';
}

interface DealResultsChipToggleProps {
  chipView: ResultsChipView;
  onChange: (v: ResultsChipView) => void;
  compact?: boolean;
  className?: string;
}

export function DealResultsChipToggle({ chipView, onChange, compact, className }: DealResultsChipToggleProps) {
  return (
    <div
      className={['cosmic-chip-toggle', 'cosmic-chip-toggle--phys', className].filter(Boolean).join(' ')}
      style={compact ? { marginTop: 0, marginBottom: 0 } : toggleWrapStyle}
      role="tablist"
      aria-label="Способ подсчёта фишек"
    >
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'accuracy_bonus'}
        className={`cosmic-chip-toggle__btn${chipView === 'accuracy_bonus' ? ' cosmic-chip-toggle__btn--active' : ''}`}
        onClick={() => onChange('accuracy_bonus')}
      >
        {SETTLEMENT_MODE_LABELS.accuracy_bonus}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'vs_average'}
        className={`cosmic-chip-toggle__btn${chipView === 'vs_average' ? ' cosmic-chip-toggle__btn--active' : ''}`}
        onClick={() => onChange('vs_average')}
      >
        {SETTLEMENT_MODE_LABELS.vs_average}
      </button>
    </div>
  );
}

export function settlementFootnote(mode: SettlementMode, sumChips?: number): string | null {
  if (mode === 'vs_average' && sumChips === 0) {
    return 'Сумма фишек = 0: перераспределение между игроками.';
  }
  if (mode === 'accuracy_bonus') {
    return 'Бонус +10 за каждую раздачу с точным заказом.';
  }
  return null;
}
