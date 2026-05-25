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

const LS_CHIP_VIEW = 'updown_results_chip_view';

export type ResultsChipView = 'accuracy_bonus' | 'vs_average';

function readStoredChipView(): ResultsChipView {
  try {
    const v = localStorage.getItem(LS_CHIP_VIEW);
    if (v === 'vs_average' || v === 'accuracy_bonus') return v;
  } catch {
    /* ignore */
  }
  return 'accuracy_bonus';
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

const toggleBtnStyle = (active: boolean): React.CSSProperties => ({
  fontSize: 12,
  fontWeight: 600,
  padding: '6px 12px',
  borderRadius: 8,
  border: active ? '1px solid rgba(167, 139, 250, 0.7)' : '1px solid rgba(148, 163, 184, 0.35)',
  background: active ? 'rgba(139, 92, 246, 0.22)' : 'rgba(30, 41, 59, 0.5)',
  color: active ? '#e9d5ff' : '#94a3b8',
  cursor: 'pointer',
  touchAction: 'manipulation',
});

export function useResultsChipView(): [ResultsChipView, (v: ResultsChipView) => void] {
  const [view, setView] = useState<ResultsChipView>(() => readStoredChipView());
  const set = useCallback((v: ResultsChipView) => {
    setView(v);
    try {
      localStorage.setItem(LS_CHIP_VIEW, v);
    } catch {
      /* ignore */
    }
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
}

export function DealResultsChipToggle({ chipView, onChange, compact }: DealResultsChipToggleProps) {
  return (
    <div
      style={{
        ...toggleWrapStyle,
        ...(compact ? { marginTop: 4, marginBottom: 2 } : {}),
      }}
      role="tablist"
      aria-label="Способ подсчёта фишек"
    >
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'accuracy_bonus'}
        style={toggleBtnStyle(chipView === 'accuracy_bonus')}
        onClick={() => onChange('accuracy_bonus')}
      >
        {SETTLEMENT_MODE_LABELS.accuracy_bonus}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'vs_average'}
        style={toggleBtnStyle(chipView === 'vs_average')}
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
