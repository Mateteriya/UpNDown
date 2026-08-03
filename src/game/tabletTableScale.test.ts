import { describe, expect, it } from 'vitest';
import {
  bumpTabletTableScalePct,
  clampTabletTableScalePct,
  defaultTabletTableScalePct,
  pcDesktopTableScaleMul,
  tabletTableHeightMul,
  tabletTableSideGapTight,
  tabletTableWidthMul,
  TABLET_FOUR_BASE_HEIGHT_MUL,
  TABLET_FOUR_BASE_WIDTH_MUL,
  TABLET_FOUR_HEIGHT_SCALE_GAIN,
  TABLET_FOUR_TABLE_SCALE_PCT_STEP,
  TABLET_FOUR_WIDTH_SCALE_FOLLOW,
  TABLET_TABLE_SCALE_PCT_DEFAULT,
  TABLET_TABLE_SCALE_PCT_MAX,
  TABLET_TABLE_SCALE_PCT_MIN,
  TABLET_TABLE_SCALE_PCT_STEP,
} from './tabletTableScale';

describe('tabletTableScale', () => {
  it('clamps to 93…108 any integer', () => {
    expect(clampTabletTableScalePct(100)).toBe(100);
    expect(clampTabletTableScalePct(92)).toBe(93);
    expect(clampTabletTableScalePct(109)).toBe(108);
    expect(clampTabletTableScalePct(97)).toBe(97);
    expect(clampTabletTableScalePct(104.4)).toBe(104);
  });

  it('bumps by default 1%; tablet 4p step 4%', () => {
    expect(TABLET_TABLE_SCALE_PCT_STEP).toBe(1);
    expect(TABLET_FOUR_TABLE_SCALE_PCT_STEP).toBe(4);
    expect(bumpTabletTableScalePct(100, 1)).toBe(101);
    expect(bumpTabletTableScalePct(108, 1)).toBe(108);
    expect(bumpTabletTableScalePct(100, -1)).toBe(99);
    expect(bumpTabletTableScalePct(93, -1)).toBe(93);
    expect(bumpTabletTableScalePct(100, 1, TABLET_FOUR_TABLE_SCALE_PCT_STEP)).toBe(104);
    expect(bumpTabletTableScalePct(104, 1, TABLET_FOUR_TABLE_SCALE_PCT_STEP)).toBe(108);
    expect(bumpTabletTableScalePct(108, 1, TABLET_FOUR_TABLE_SCALE_PCT_STEP)).toBe(108);
    expect(bumpTabletTableScalePct(100, -1, TABLET_FOUR_TABLE_SCALE_PCT_STEP)).toBe(96);
  });

  it('treats 100% as 4p baseline; height bold, width almost flat', () => {
    expect(defaultTabletTableScalePct(4)).toBe(TABLET_TABLE_SCALE_PCT_DEFAULT);
    expect(tabletTableHeightMul(100, 4)).toBeCloseTo(TABLET_FOUR_BASE_HEIGHT_MUL);
    expect(tabletTableWidthMul(100, 4)).toBeCloseTo(TABLET_FOUR_BASE_WIDTH_MUL);
    expect(TABLET_FOUR_HEIGHT_SCALE_GAIN).toBe(2.5);
    expect(TABLET_FOUR_WIDTH_SCALE_FOLLOW).toBe(0.12);

    const at108H = tabletTableHeightMul(108, 4);
    const at108W = tabletTableWidthMul(108, 4);
    expect(at108H).toBeCloseTo(
      TABLET_FOUR_BASE_HEIGHT_MUL * (1 + 0.08 * TABLET_FOUR_HEIGHT_SCALE_GAIN),
    );
    expect(at108W).toBeCloseTo(
      TABLET_FOUR_BASE_WIDTH_MUL * (1 + 0.08 * TABLET_FOUR_WIDTH_SCALE_FOLLOW),
    );
    /* ширина едва растёт; высота заметно сильнее линейного pct */
    expect(at108W / TABLET_FOUR_BASE_WIDTH_MUL).toBeLessThan(1.02);
    expect(at108H / TABLET_FOUR_BASE_HEIGHT_MUL).toBeGreaterThan(1.15);

    expect(tabletTableHeightMul(TABLET_TABLE_SCALE_PCT_MIN, 4)).toBeCloseTo(
      TABLET_FOUR_BASE_HEIGHT_MUL * (1 + -0.07 * TABLET_FOUR_HEIGHT_SCALE_GAIN),
    );
  });

  it('3p baseline is 1.0 at 100%; width still follows pct', () => {
    expect(tabletTableHeightMul(100, 3)).toBe(1);
    expect(tabletTableWidthMul(108, 3)).toBeCloseTo(1.08);
  });

  it('tightens side gaps at 107–108%', () => {
    expect(tabletTableSideGapTight(106)).toBe(false);
    expect(tabletTableSideGapTight(107)).toBe(true);
    expect(tabletTableSideGapTight(108)).toBe(true);
  });

  it('PC desktop 4p uses pct/100 without tablet 1.25 base', () => {
    expect(pcDesktopTableScaleMul(100)).toBe(1);
    expect(pcDesktopTableScaleMul(93)).toBeCloseTo(0.93);
    expect(pcDesktopTableScaleMul(108)).toBeCloseTo(1.08);
  });

  it('4p top-anchor mul stays at 100% base so height growth goes down', () => {
    /* GameTable держит marginTop на TABLET_FOUR_BASE_HEIGHT_MUL, а не на текущем HMul */
    const at100 = tabletTableHeightMul(100, 4);
    const at108 = tabletTableHeightMul(108, 4);
    expect(at100).toBe(TABLET_FOUR_BASE_HEIGHT_MUL);
    expect(at108).toBeGreaterThan(at100);
    expect(TABLET_FOUR_BASE_HEIGHT_MUL).toBe(1.25);
  });
});
