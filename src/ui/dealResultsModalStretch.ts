/** Идёт тяга капсулы модалки «Результаты» — блокируем measure/setState и побочные эффекты. */
export const dealResultsModalResizingRef = { current: false };

const MOBILE_DEAL_RESULTS_DEAL_COL_DEFAULT = 18;
const MOBILE_DEAL_RESULTS_PLAYER_CELL_DEFAULT = 38;
/** Горизонтальные отступы модалки + рамка окна таблицы (px). */
const MOBILE_DEAL_RESULTS_TABLE_HPAD_PX = 18;
/** С 343px — прежняя вёрстка; ≤342px — компактный режим. */
const MOBILE_DEAL_RESULTS_NARROW_MAX_VW = 342;
const MOBILE_DEAL_RESULTS_REFERENCE_VW = MOBILE_DEAL_RESULTS_NARROW_MAX_VW + 1;

export type MobileDealResultsTableLayout = {
  dealCol: number;
  mobileBidCellWidth: number;
  mobileResultCellWidth: number;
  tableMinWidth: number;
  fontScale: number;
  /** true только при ширине viewport 342px и меньше */
  isNarrow: boolean;
};

export function readDealResultsLayoutViewportWidthPx(): number {
  if (typeof window === 'undefined') return MOBILE_DEAL_RESULTS_REFERENCE_VW;
  const vv = window.visualViewport;
  const w =
    vv != null && Number.isFinite(vv.width) && vv.width > 0 ? vv.width : window.innerWidth;
  return Math.max(280, Math.round(w));
}

/** Подгонка колонок моб. таблицы «Результаты» под ширину экрана (≈342…300px). */
export function computeMobileDealResultsTableLayout(
  viewportWidthPx: number,
): MobileDealResultsTableLayout {
  const vw = Math.max(280, Math.round(viewportWidthPx));
  const available = Math.max(252, vw - MOBILE_DEAL_RESULTS_TABLE_HPAD_PX);

  if (vw >= MOBILE_DEAL_RESULTS_REFERENCE_VW) {
    const mobileBidCellWidth = Math.max(28, MOBILE_DEAL_RESULTS_PLAYER_CELL_DEFAULT - 6);
    const mobileResultCellWidth = MOBILE_DEAL_RESULTS_PLAYER_CELL_DEFAULT + 6;
    return {
      dealCol: MOBILE_DEAL_RESULTS_DEAL_COL_DEFAULT,
      mobileBidCellWidth,
      mobileResultCellWidth,
      tableMinWidth:
        MOBILE_DEAL_RESULTS_DEAL_COL_DEFAULT +
        4 * (mobileBidCellWidth + mobileResultCellWidth),
      fontScale: 1,
      isNarrow: false,
    };
  }

  const dealCol = Math.max(
    12,
    Math.min(MOBILE_DEAL_RESULTS_DEAL_COL_DEFAULT, Math.round(available * 0.055)),
  );
  const perPlayerPair = Math.floor((available - dealCol) / 4);
  const mobileBidCellWidth = Math.max(18, Math.floor(perPlayerPair * 0.42));
  const mobileResultCellWidth = Math.max(22, perPlayerPair - mobileBidCellWidth);
  const tableMinWidth = dealCol + 4 * (mobileBidCellWidth + mobileResultCellWidth);
  const fontScale = Math.max(
    0.78,
    Math.min(1, available / (MOBILE_DEAL_RESULTS_NARROW_MAX_VW - MOBILE_DEAL_RESULTS_TABLE_HPAD_PX)),
  );

  return {
    dealCol,
    mobileBidCellWidth,
    mobileResultCellWidth,
    tableMinWidth: Math.min(tableMinWidth, available),
    fontScale,
    isNarrow: true,
  };
}

export function computeDealResultsMobileStretchMaxPx(
  tableBodyBasePx: number,
  tableBodyMaxPx: number,
): number {
  if (tableBodyBasePx <= 0 || tableBodyMaxPx <= 0) return 0;
  return Math.max(0, tableBodyMaxPx - tableBodyBasePx);
}

export function computeDealResultsModalStackMaxPx(viewportHeightPx: number): number {
  return Math.max(1, Math.round(viewportHeightPx - 6));
}

export function findDealResultsModalScroll(stack: HTMLElement | null): HTMLElement | null {
  return stack?.querySelector<HTMLElement>('.deal-results-table-body-scroll-pc--mobile-modal') ?? null;
}

export function readStretchCaps(stack: HTMLElement): { base: number; max: number } {
  const cs = getComputedStyle(stack);
  const base = parseFloat(cs.getPropertyValue('--deal-results-body-base-px'));
  const max = parseFloat(cs.getPropertyValue('--deal-results-body-max-px'));
  return {
    base: Number.isFinite(base) && base > 0 ? base : 160,
    max: Number.isFinite(max) && max > 0 ? max : 400,
  };
}

/** Фактический stretch: сначала CSS-var (то, что видит пользователь), иначе из layout. */
export function readDealResultsDomStretchPx(stack: HTMLElement): number {
  const fromVar = parseFloat(getComputedStyle(stack).getPropertyValue('--deal-results-stretch-px'));
  if (Number.isFinite(fromVar) && fromVar >= 0) {
    const { base, max } = readStretchCaps(stack);
    return Math.max(0, Math.min(max - base, Math.round(fromVar)));
  }
  const scroll = findDealResultsModalScroll(stack);
  if (!scroll) return 0;
  const { base, max } = readStretchCaps(stack);
  const bodyH = scroll.clientHeight;
  return Math.max(0, Math.min(max - base, Math.round(bodyH - base)));
}

/** Живое изменение высоты tbody за пальцем — только CSS-переменная на стеке. */
export function applyDealResultsStretchPx(stack: HTMLElement, stretchPx: number): void {
  const { base, max } = readStretchCaps(stack);
  const clamped = Math.max(0, Math.min(max - base, stretchPx));
  stack.style.setProperty('--deal-results-stretch-px', `${clamped}px`);
}

/** Класс умных стрелок (допуск 1px у максимума — Android/округление). */
export function dealResultsResizeHintClassName(stretchPx: number, stretchMaxPx: number): string {
  if (stretchMaxPx <= 0) {
    return 'game-mobile-short-south-resize-handle--hint-down-only';
  }
  const px = Math.max(0, Math.round(stretchPx));
  const max = Math.max(0, Math.round(stretchMaxPx));
  if (px <= 0) return 'game-mobile-short-south-resize-handle--hint-down-only';
  if (px >= max - 1) return 'game-mobile-short-south-resize-handle--hint-up-only';
  return 'game-mobile-short-south-resize-handle--hint-both';
}

export function updateDealResultsResizeHintClass(
  handle: HTMLElement,
  stretchPx: number,
  stretchMaxPx: number,
): void {
  handle.classList.remove(
    'game-mobile-short-south-resize-handle--hint-down-only',
    'game-mobile-short-south-resize-handle--hint-up-only',
    'game-mobile-short-south-resize-handle--hint-both',
  );
  handle.classList.add(dealResultsResizeHintClassName(stretchPx, stretchMaxPx));
}

