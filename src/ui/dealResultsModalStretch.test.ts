import { describe, expect, it } from 'vitest';
import {
  computeDealResultsModalBodyCapPx,
  computeMobileDealResultsTableLayout,
} from './dealResultsModalStretch';

describe('computeMobileDealResultsTableLayout landscape', () => {
  it('spreads columns across full landscape width on tuned 660x330', () => {
    const layout = computeMobileDealResultsTableLayout({
      width: 660,
      height: 330,
      isLandscape: true,
    });
    expect(layout.isNarrow).toBe(false);
    expect(layout.isLandscapeTuned).toBe(true);
    expect(layout.mobileBidCellWidth).toBeGreaterThanOrEqual(28);
    expect(layout.tableMinWidth).toBeGreaterThan(400);
    expect(layout.fontScale).toBeGreaterThanOrEqual(0.86);
  });
});

describe('computeDealResultsModalBodyCapPx', () => {
  it('uses a landscape tbody cap suited to landscape modal chrome', () => {
    const portrait = computeDealResultsModalBodyCapPx(330, false, 280);
    const landscape = computeDealResultsModalBodyCapPx(330, true, 280);
    expect(portrait).toBe(165);
    expect(landscape).toBe(172);
    expect(landscape).toBeGreaterThan(portrait);
  });
});
