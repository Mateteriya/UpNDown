/**
 * Блок «Фишки» в таблице результатов: переключение Середина / Точный заказ.
 */

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DealResult } from '../game/GameEngine';
import {
  computePartySettlement,
  SETTLEMENT_MODE_LABELS,
  type SettlementMode,
  type SettlementOptions,
} from '../game/partySettlement';
import {
  readResultsChipView,
  writeResultsChipView,
  type ResultsChipView,
} from '../game/resultsChipView';

export type { ResultsChipView };

const CHIP_MODE_COMPARE_ROWS: {
  key: string;
  label: string;
  vs_average: string;
  accuracy_bonus: string;
}[] = [
  {
    key: 'formula',
    label: 'Формула',
    vs_average: 'Ваши очки − среднее по столу',
    accuracy_bonus: 'Очки − среднее + бонус',
  },
  {
    key: 'bonus',
    label: 'Бонус',
    vs_average: 'Нет',
    accuracy_bonus: '+10 за раздачу, где заказ = взял',
  },
  {
    key: 'sum',
    label: 'Сумма фишек',
    vs_average: 'Всегда 0 — перераспределение',
    accuracy_bonus: 'Может быть ≠ 0',
  },
];

const CHIP_MODE_NOTE: Record<ResultsChipView, { lead: string; rest: string }> = {
  vs_average: {
    lead: 'Среднее по столу',
    rest: 'среднее арифметическое итоговых очков всех игроков за партию.',
  },
  accuracy_bonus: {
    lead: 'Точный заказ',
    rest: 'среднее арифметическое итоговых очков всех игроков за партию + бонус за каждый точный заказ (+10 фишек).',
  },
};

const CHIP_MODE_FULL_DETAILS: Record<ResultsChipView, string[]> = {
  vs_average: [
    'Считаем среднее арифметическое итоговых очков всех игроков за партию.',
    'Фишки игрока = его очки минус это среднее: кто выше среднего — в плюсе, кто ниже — в минусе.',
    'Сумма фишек по столу всегда равна нулю — это перераспределение между игроками, без «приза сверху».',
  ],
  accuracy_bonus: [
    'Считаем среднее арифметическое итоговых очков всех игроков за партию.',
    'Базовые фишки = очки игрока минус это среднее: кто выше среднего — в плюсе, кто ниже — в минусе.',
    'Дополнительно +10 фишек за каждую раздачу, где заказ совпал с количеством взятых взяток.',
    'Сумма фишек по столу может быть не нулевой — бонус за точность начисляется сверх перераспределения.',
  ],
};

export function ResultsChipModeHelpContent({ chipView }: { chipView: ResultsChipView }) {
  const modes: ResultsChipView[] = ['vs_average', 'accuracy_bonus'];
  const [detailsOpen, setDetailsOpen] = useState(false);
  const modeNote = CHIP_MODE_NOTE[chipView];

  return (
    <div className="chip-mode-help-cosmos">
      <span className="chip-mode-help-cosmos__stars" aria-hidden />
      <header className="chip-mode-help-cosmos__header">
        <span className="chip-mode-help-cosmos__glyph" aria-hidden>
          ✦
        </span>
        <h3 className="chip-mode-help-cosmos__title">Режимы подсчёта фишек</h3>
      </header>
      <p className="chip-mode-help-cosmos__intro">
        Можно выбрать варианты подсчёта фишек:{' '}
        <span className="chip-mode-help-cosmos__intro-mode chip-mode-help-cosmos__intro-mode--average">
          «Середина стола»
        </span>{' '}
        (классика) или{' '}
        <span className="chip-mode-help-cosmos__intro-mode chip-mode-help-cosmos__intro-mode--accuracy">
          «Точный заказ»
        </span>{' '}
        (классика + бонус за чёткость).
        {!detailsOpen ? (
          <>
            {' '}
            <button
              type="button"
              className="chip-mode-help-cosmos__more"
              aria-expanded={false}
              onClick={() => setDetailsOpen(true)}
            >
              Подробнее…
            </button>
          </>
        ) : null}
      </p>
      {detailsOpen ? (
        <div className="chip-mode-help-cosmos__details-wrap">
          <div className="chip-mode-help-cosmos__details">
            {modes.map((mode) => (
              <section
                key={mode}
                className={[
                  'chip-mode-help-cosmos__detail-card',
                  mode === chipView ? 'chip-mode-help-cosmos__detail-card--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                <h4 className="chip-mode-help-cosmos__detail-title">{SETTLEMENT_MODE_LABELS[mode]}</h4>
                <ul className="chip-mode-help-cosmos__detail-list">
                  {CHIP_MODE_FULL_DETAILS[mode].map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
          <button
            type="button"
            className="chip-mode-help-cosmos__collapse"
            aria-expanded
            onClick={() => setDetailsOpen(false)}
          >
            <span className="chip-mode-help-cosmos__collapse-icon" aria-hidden>
              ▲
            </span>
            Свернуть подробности
          </button>
        </div>
      ) : null}
      <p className="chip-mode-help-cosmos__middle-note">
        <span className="chip-mode-help-cosmos__middle-dot" aria-hidden />
        <span>
          <strong className="chip-mode-help-cosmos__middle-lead">{modeNote.lead}</strong>
          <span className="chip-mode-help-cosmos__middle-rest"> — {modeNote.rest}</span>
        </span>
      </p>
      <div className="chip-mode-help-cosmos__compare" role="table" aria-label="Сравнение режимов подсчёта">
        <div className="chip-mode-help-cosmos__compare-head" role="row">
          <span className="chip-mode-help-cosmos__compare-corner" role="columnheader" aria-hidden />
          {modes.map((mode) => (
            <div
              key={mode}
              role="columnheader"
              className={[
                'chip-mode-help-cosmos__compare-colhead',
                mode === chipView ? 'chip-mode-help-cosmos__compare-colhead--active' : '',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <span className="chip-mode-help-cosmos__compare-coltitle">{SETTLEMENT_MODE_LABELS[mode]}</span>
              {mode === chipView ? (
                <span className="chip-mode-help-cosmos__compare-pick">выбрано</span>
              ) : null}
            </div>
          ))}
        </div>
        {CHIP_MODE_COMPARE_ROWS.map((row) => (
          <div key={row.key} className="chip-mode-help-cosmos__compare-row" role="row">
            <span className="chip-mode-help-cosmos__compare-label" role="rowheader">
              {row.label}
            </span>
            {modes.map((mode) => (
              <div
                key={mode}
                role="cell"
                className={[
                  'chip-mode-help-cosmos__compare-cell',
                  mode === chipView ? 'chip-mode-help-cosmos__compare-cell--active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
              >
                {row[mode]}
              </div>
            ))}
          </div>
        ))}
      </div>
      <p className="chip-mode-help-cosmos__footnote">Рейтинг партии — всегда по очкам, не по фишкам.</p>
    </div>
  );
}

export type ChipModeHelpPortalTarget = 'game-over' | 'results-mobile';

function resolveChipModeHelpPortal(
  portalled?: boolean | ChipModeHelpPortalTarget,
): ChipModeHelpPortalTarget | false {
  if (portalled === true) return 'game-over';
  if (portalled === 'game-over' || portalled === 'results-mobile') return portalled;
  return false;
}

function chipModeHelpPortalRoot(target: ChipModeHelpPortalTarget): Element {
  if (target === 'game-over') {
    return document.querySelector('.game-over-dialog') ?? document.body;
  }
  return document.querySelector('.deal-results-modal-overlay-mobile') ?? document.body;
}

function chipModeHelpPortalPanelClass(target: ChipModeHelpPortalTarget): string {
  return target === 'game-over'
    ? 'deal-results-sticky-payout-veil-help--game-over'
    : 'deal-results-sticky-payout-veil-help--results-mobile';
}

export function ResultsChipModeHelpPanel({
  chipView,
  onClose,
  portalled,
}: {
  chipView: ResultsChipView;
  onClose: () => void;
  portalled?: boolean | ChipModeHelpPortalTarget;
}) {
  const portalTarget = resolveChipModeHelpPortal(portalled);
  return (
    <div
      className={[
        'deal-results-sticky-payout-veil-help',
        'deal-results-sticky-payout-veil-help--chip-modes',
        portalTarget ? chipModeHelpPortalPanelClass(portalTarget) : '',
      ]
        .filter(Boolean)
        .join(' ')}
      role="dialog"
      aria-label="Пояснение режимов подсчёта"
      onClick={(e) => e.stopPropagation()}
    >
      <ResultsChipModeHelpContent chipView={chipView} />
      <button
        type="button"
        className="deal-results-sticky-payout-veil-help__ok chip-mode-help-cosmos__ok"
        onClick={(e) => {
          e.stopPropagation();
          onClose();
        }}
      >
        Понятно
      </button>
    </div>
  );
}

export function ResultsChipModeHelpOverlay({
  chipView,
  open,
  onClose,
  portalled,
}: {
  chipView: ResultsChipView;
  open: boolean;
  onClose: () => void;
  portalled: ChipModeHelpPortalTarget;
}) {
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className="chip-mode-help-scrim"
        aria-label="Закрыть пояснение"
        onClick={onClose}
      />
      <ResultsChipModeHelpPanel chipView={chipView} portalled={portalled} onClose={onClose} />
    </>,
    chipModeHelpPortalRoot(portalled),
  );
}

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
  /** Ультра-компактные подписи кнопок (моб. итоги партии) */
  micro?: boolean;
  className?: string;
}

export function DealResultsChipToggle({ chipView, onChange, compact, micro, className }: DealResultsChipToggleProps) {
  const accuracyLabel = micro ? 'Точный' : SETTLEMENT_MODE_LABELS.accuracy_bonus;
  const averageLabel = micro ? 'Середина' : SETTLEMENT_MODE_LABELS.vs_average;
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
        title={SETTLEMENT_MODE_LABELS.accuracy_bonus}
      >
        <span className="cosmic-chip-toggle__label">{accuracyLabel}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'vs_average'}
        className={`cosmic-chip-toggle__btn${chipView === 'vs_average' ? ' cosmic-chip-toggle__btn--active' : ''}`}
        onClick={() => onChange('vs_average')}
        title={SETTLEMENT_MODE_LABELS.vs_average}
      >
        <span className="cosmic-chip-toggle__label">{averageLabel}</span>
      </button>
    </div>
  );
}

/** «?» в кружочке — как в модалке «Результаты» */
export function ResultsChipModeHelpButton({
  chipView,
  className,
  portalled,
}: {
  chipView: ResultsChipView;
  className?: string;
  /** Поверх модалки (не обрезается overflow) */
  portalled?: boolean | ChipModeHelpPortalTarget;
}) {
  const [open, setOpen] = useState(false);
  const portalTarget = resolveChipModeHelpPortal(portalled);

  return (
    <div className={['results-chip-mode-help', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="deal-results-sticky-payout-veil-caption__help-btn"
        aria-label="Пояснение режимов подсчёта выигрыша"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        ?
      </button>
      {portalTarget ? (
        <ResultsChipModeHelpOverlay
          chipView={chipView}
          open={open}
          portalled={portalTarget}
          onClose={() => setOpen(false)}
        />
      ) : open ? (
        <ResultsChipModeHelpPanel chipView={chipView} onClose={() => setOpen(false)} />
      ) : null}
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
  if (mode === 'prize_pool') {
    return 'Банк делится по местам (очки). Взнос демо — без списания баланса.';
  }
  return null;
}

export function prizePoolRowExtra(buyIn: number | undefined, chips: number): string | undefined {
  if (buyIn == null) return undefined;
  const gross = Math.round((chips + buyIn) * 10) / 10;
  if (chips > 0) return `взнос ${buyIn} → из банка ${gross} → +${chips}`;
  if (chips < 0) return `взнос ${buyIn} → ${chips}`;
  return `взнос ${buyIn} → 0`;
}

export function usePartySettlementWithMode(
  dealHistory: DealResult[],
  playerCount: number,
  mode: SettlementMode,
  opts?: SettlementOptions,
) {
  return useMemo(
    () => computePartySettlement(dealHistory, playerCount as 3 | 4, mode, opts),
    [dealHistory, playerCount, mode, opts?.buyIn, opts?.stake, opts?.accuracyBonus],
  );
}
