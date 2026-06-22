import { describe, expect, it } from 'vitest';
import {
  computeDealResultsModalBodyCapPx,
  computeMobileDealResultsTableLayout,
} from './dealResultsModalStretch';

describe('computeMobileDealResultsTableLayout landscape', () => {
  it('uses compact cells on tuned landscape 660x330', () => {
    const layout = computeMobileDealResultsTableLayout({
      width: 660,
      height: 330,
      isLandscape: true,
    });
    expect(layout.isNarrow).toBe(false);
    expect(layout.mobileBidCellWidth).toBeLessThan(32);
    expect(layout.fontScale).toBeGreaterThanOrEqual(0.86);
  });
});

describe('computeDealResultsModalBodyCapPx', () => {
  it('allocates more tbody height in landscape than portrait at same vh', () => {
    const portrait = computeDealResultsModalBodyCapPx(330, false, 280);
    const landscape = computeDealResultsModalBodyCapPx(330, true, 280);
    expect(landscape).toBeGreaterThan(portrait);
  });
});
