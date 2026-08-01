import { describe, expect, it } from 'vitest';
import {
  bumpTabletTableScalePct,
  clampTabletTableScalePct,
  defaultTabletTableScalePct,
  tabletTableHeightMul,
  tabletTableSideGapTight,
  tabletTableWidthMul,
  TABLET_FOUR_BASE_HEIGHT_MUL,
  TABLET_FOUR_BASE_WIDTH_MUL,
  TABLET_TABLE_SCALE_PCT_DEFAULT,
  TABLET_TABLE_SCALE_PCT_MAX,
  TABLET_TABLE_SCALE_PCT_MIN,
} from './tabletTableScale';

describe('tabletTableScale', () => {
  it('clamps to 93…108 any integer', () => {
    expect(clampTabletTableScalePct(100)).toBe(100);
    expect(clampTabletTableScalePct(92)).toBe(93);
    expect(clampTabletTableScalePct(109)).toBe(108);
    expect(clampTabletTableScalePct(97)).toBe(97);
    expect(clampTabletTableScalePct(104.4)).toBe(104);
  });

  it('bumps by 1%', () => {
    expect(bumpTabletTableScalePct(100, 1)).toBe(101);
    expect(bumpTabletTableScalePct(108, 1)).toBe(108);
    expect(bumpTabletTableScalePct(100, -1)).toBe(99);
    expect(bumpTabletTableScalePct(93, -1)).toBe(93);
  });

  it('treats 100% as 4p baseline', () => {
    expect(defaultTabletTableScalePct(4)).toBe(TABLET_TABLE_SCALE_PCT_DEFAULT);
    expect(tabletTableHeightMul(100, 4)).toBeCloseTo(TABLET_FOUR_BASE_HEIGHT_MUL);
    expect(tabletTableWidthMul(100, 4)).toBeCloseTo(TABLET_FOUR_BASE_WIDTH_MUL);
    expect(tabletTableHeightMul(TABLET_TABLE_SCALE_PCT_MIN, 4)).toBeCloseTo(
      TABLET_FOUR_BASE_HEIGHT_MUL * 0.93,
    );
    expect(tabletTableHeightMul(TABLET_TABLE_SCALE_PCT_MAX, 4)).toBeCloseTo(
      TABLET_FOUR_BASE_HEIGHT_MUL * 1.08,
    );
  });

  it('3p baseline is 1.0 at 100%', () => {
    expect(tabletTableHeightMul(100, 3)).toBe(1);
    expect(tabletTableWidthMul(108, 3)).toBeCloseTo(1.08);
  });

  it('tightens side gaps at 107–108%', () => {
    expect(tabletTableSideGapTight(106)).toBe(false);
    expect(tabletTableSideGapTight(107)).toBe(true);
    expect(tabletTableSideGapTight(108)).toBe(true);
  });
});
