/** Идёт тяга капсулы модалки «Результаты» — блокируем measure/setState и побочные эффекты. */
export const dealResultsModalResizingRef = { current: false };

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
