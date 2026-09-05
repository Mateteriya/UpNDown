/**
 * Блок «Фишки» в таблице результатов: переключение Середина / Точный заказ.
 */

import { useCallback, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DealResult } from '../game/GameEngine';
import {
  computePartySettlement,
  type SettlementMode,
  type SettlementOptions,
} from '../game/partySettlement';
import {
  readResultsChipView,
  writeResultsChipView,
  type ResultsChipView,
} from '../game/resultsChipView';
import { t, useT, type TFunc } from '../i18n';

export type { ResultsChipView };

function settlementModeLabel(mode: SettlementMode, tr: TFunc): string {
  if (mode === 'accuracy_bonus') return tr('settlement.accuracy');
  if (mode === 'vs_average') return tr('settlement.average');
  if (mode === 'prize_pool') return tr('settlement.prize');
  return tr('settlement.points');
}

function chipModeCompareRows(tr: TFunc) {
  return [
    {
      key: 'formula',
      label: tr('settlement.formula'),
      vs_average: tr('settlement.formulaAvg'),
      accuracy_bonus: tr('settlement.formulaAcc'),
    },
    {
      key: 'bonus',
      label: tr('settlement.bonus'),
      vs_average: tr('settlement.none'),
      accuracy_bonus: tr('settlement.bonusAcc'),
    },
    {
      key: 'sum',
      label: tr('settlement.chipSum'),
      vs_average: tr('settlement.sumAvg'),
      accuracy_bonus: tr('settlement.sumAcc'),
    },
  ] as const;
}

function chipModeNote(tr: TFunc): Record<ResultsChipView, { lead: string; rest: string }> {
  return {
    vs_average: {
      lead: tr('settlement.noteAvgLead'),
      rest: tr('settlement.noteAvgRest'),
    },
    accuracy_bonus: {
      lead: tr('settlement.noteAccLead'),
      rest: tr('settlement.noteAccRest'),
    },
  };
}

function chipModeFullDetails(tr: TFunc): Record<ResultsChipView, string[]> {
  return {
    vs_average: [tr('settlement.detailsAvg1'), tr('settlement.detailsAvg2'), tr('settlement.detailsAvg3')],
    accuracy_bonus: [
      tr('settlement.detailsAcc1'),
      tr('settlement.detailsAcc2'),
      tr('settlement.detailsAcc3'),
      tr('settlement.detailsAcc4'),
    ],
  };
}

export function ResultsChipModeHelpContent({ chipView }: { chipView: ResultsChipView }) {
  const tr = useT();
  const modes: ResultsChipView[] = ['vs_average', 'accuracy_bonus'];
  const [detailsOpen, setDetailsOpen] = useState(false);
  const modeNote = chipModeNote(tr)[chipView];
  const fullDetails = chipModeFullDetails(tr);
  const compareRows = chipModeCompareRows(tr);

  return (
    <div className="chip-mode-help-cosmos">
      <span className="chip-mode-help-cosmos__stars" aria-hidden />
      <header className="chip-mode-help-cosmos__header">
        <span className="chip-mode-help-cosmos__glyph" aria-hidden>
          ✦
        </span>
        <h3 className="chip-mode-help-cosmos__title">{tr('settlement.helpTitle')}</h3>
      </header>
      <p className="chip-mode-help-cosmos__intro">
        {tr('settlement.helpIntroBefore')}{' '}
        <span className="chip-mode-help-cosmos__intro-mode chip-mode-help-cosmos__intro-mode--average">
          «{tr('settlement.average')}»
        </span>{' '}
        {tr('settlement.helpClassic')} {tr('settlement.helpOr')}{' '}
        <span className="chip-mode-help-cosmos__intro-mode chip-mode-help-cosmos__intro-mode--accuracy">
          «{tr('settlement.accuracy')}»
        </span>{' '}
        {tr('settlement.helpClassicBonus')}
        {!detailsOpen ? (
          <>
            {' '}
            <button
              type="button"
              className="chip-mode-help-cosmos__more"
              aria-expanded={false}
              onClick={() => setDetailsOpen(true)}
            >
              {tr('settlement.helpMore')}
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
                <h4 className="chip-mode-help-cosmos__detail-title">{settlementModeLabel(mode, tr)}</h4>
                <ul className="chip-mode-help-cosmos__detail-list">
                  {fullDetails[mode].map((line) => (
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
            {tr('settlement.helpCollapse')}
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
      <div className="chip-mode-help-cosmos__compare" role="table" aria-label={tr('settlement.compareAria')}>
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
              <span className="chip-mode-help-cosmos__compare-coltitle">{settlementModeLabel(mode, tr)}</span>
              {mode === chipView ? (
                <span className="chip-mode-help-cosmos__compare-pick">{tr('settlement.selected')}</span>
              ) : null}
            </div>
          ))}
        </div>
        {compareRows.map((row) => (
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
      <p className="chip-mode-help-cosmos__footnote">{tr('settlement.ratingAlwaysPoints')}</p>
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
  const tr = useT();
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
      aria-label={tr('settlement.helpDialog')}
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
        {tr('common.understood')}
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
  const tr = useT();
  if (!open || typeof document === 'undefined') return null;

  return createPortal(
    <>
      <button
        type="button"
        className="chip-mode-help-scrim"
        aria-label={tr('settlement.closeHelp')}
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
  const tr = useT();
  const accuracyLabel = micro ? tr('settlement.accuracyShort') : tr('settlement.accuracy');
  const averageLabel = micro ? tr('settlement.averageShort') : tr('settlement.average');
  return (
    <div
      className={['cosmic-chip-toggle', 'cosmic-chip-toggle--phys', className].filter(Boolean).join(' ')}
      style={compact ? { marginTop: 0, marginBottom: 0 } : toggleWrapStyle}
      role="tablist"
      aria-label={tr('settlement.chipModesAria')}
    >
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'accuracy_bonus'}
        className={`cosmic-chip-toggle__btn${chipView === 'accuracy_bonus' ? ' cosmic-chip-toggle__btn--active' : ''}`}
        onClick={() => onChange('accuracy_bonus')}
        title={tr('settlement.accuracy')}
      >
        <span className="cosmic-chip-toggle__label">{accuracyLabel}</span>
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={chipView === 'vs_average'}
        className={`cosmic-chip-toggle__btn${chipView === 'vs_average' ? ' cosmic-chip-toggle__btn--active' : ''}`}
        onClick={() => onChange('vs_average')}
        title={tr('settlement.average')}
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
  const tr = useT();
  const [open, setOpen] = useState(false);
  const portalTarget = resolveChipModeHelpPortal(portalled);

  return (
    <div className={['results-chip-mode-help', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="deal-results-sticky-payout-veil-caption__help-btn"
        aria-label={tr('table.scoreModeHelp')}
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
    return t('settlement.footnoteAvg');
  }
  if (mode === 'accuracy_bonus') {
    return t('settlement.footnoteAcc');
  }
  if (mode === 'prize_pool') {
    return t('settlement.footnotePrize');
  }
  return null;
}

export function prizePoolRowExtra(buyIn: number | undefined, chips: number): string | undefined {
  if (buyIn == null) return undefined;
  const gross = Math.round((chips + buyIn) * 10) / 10;
  if (chips > 0) return t('settlement.buyInFromBank', { buyIn, gross, chips });
  if (chips < 0) return t('settlement.buyInLoss', { buyIn, chips });
  return t('settlement.buyInZero', { buyIn });
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
