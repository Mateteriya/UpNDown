import { describe, expect, it } from 'vitest';
import {
  nextPcHandScaleBoost,
  prevPcHandScaleBoost,
  pcHandScaleMultiplier,
  pcFourHandScaleMultiplier,
  pcHandScaleExtraHeightPx,
  pcTableFeltScaleMultiplier,
  pcTableLiftExtraPx,
  pcSidePanelPushPx,
  pcHandToPanelGapPx,
  pcHandTableClearancePx,
  pcTableUpOffsetBasePx,
  pcTableUpOffsetTotalPx,
  PC_TABLE_UP_OFFSET_BASE,
  PC_TABLE_UP_OFFSET_BASE_THREE,
  pcFourSeatHandCompactMul,
  clampPcHandScaleBoost,
  clampPcFourHandScalePct,
  bumpPcFourHandScalePct,
  pcHandScaleMaxForSeats,
  isPcHandScaleBoost,
  resolvePcHandAdaptiveScale,
  PC_HAND_NATIVE_RECALIBRATE,
  PC_FOUR_HAND_ABS_AT_100,
  PC_FOUR_HAND_ABS_REF_HIGH,
  PC_FOUR_HAND_ABS_REF_LOW,
  PC_FOUR_HAND_SCALE_PCT_DEFAULT,
  PC_FOUR_HAND_SCALE_PCT_MAX,
  PC_FOUR_HAND_SCALE_PCT_MIN,
  TABLET_HAND_COMPACT,
  TABLET_FOUR_HAND_ABS_AT_100,
  TABLET_FOUR_HAND_COMPACT_PX,
  TABLET_FOUR_HAND_TO_PANEL_GAP_PX,
  TABLET_FOUR_TABLE_CARD_BASE_H,
  TABLET_FOUR_TABLE_CARD_COMPACT_PX,
  tabletFourHandScaleMinus1px,
  tabletFourHandScaleMultiplier,
  tabletFourTableCardBonusPx,
  tabletFourTableCardScaleMinus1px,
  tabletFourTableCardScaleWithTablePct,
} from './pcHandScale';

describe('pcHandScale', () => {
  it('increments with seat max (3p to 140; 4p legacy boost still caps at 10)', () => {
    expect(nextPcHandScaleBoost(0, 4)).toBe(10);
    expect(nextPcHandScaleBoost(10, 4)).toBe(10);
    expect(nextPcHandScaleBoost(0, 3)).toBe(10);
    expect(nextPcHandScaleBoost(30, 3)).toBe(40);
    expect(nextPcHandScaleBoost(40, 3)).toBe(40);
  });

  it('decrements without wrapping below 0', () => {
    expect(prevPcHandScaleBoost(40)).toBe(30);
    expect(prevPcHandScaleBoost(10)).toBe(0);
    expect(prevPcHandScaleBoost(0)).toBe(0);
  });

  it('clamps boost by seat count', () => {
    expect(pcHandScaleMaxForSeats(4)).toBe(10);
    expect(pcHandScaleMaxForSeats(3)).toBe(40);
    expect(clampPcHandScaleBoost(40, 4)).toBe(10);
    expect(clampPcHandScaleBoost(20, 3)).toBe(20);
  });

  it('card multiplier matches boost percent (3p)', () => {
    expect(pcHandScaleMultiplier(0)).toBe(1);
    expect(pcHandScaleMultiplier(10)).toBe(1.1);
    expect(pcHandScaleMultiplier(40)).toBe(1.4);
  });

  it('4p: new 100% is midpoint of 98%…112%; UI ±6% → ≈97%…≈112% abs', () => {
    expect(PC_FOUR_HAND_ABS_AT_100).toBeCloseTo(
      (PC_FOUR_HAND_ABS_REF_LOW + PC_FOUR_HAND_ABS_REF_HIGH) / 2,
    );
    expect(PC_FOUR_HAND_ABS_AT_100).toBeCloseTo(1.05);
    expect(PC_FOUR_HAND_SCALE_PCT_MIN).toBe(94);
    expect(PC_FOUR_HAND_SCALE_PCT_MAX).toBe(106);
    expect(pcFourHandScaleMultiplier(100)).toBeCloseTo(1.05);
    expect(pcFourHandScaleMultiplier(94)).toBeCloseTo(1.05 * 0.94);
    expect(pcFourHandScaleMultiplier(106)).toBeCloseTo(1.05 * 1.06);
    expect(pcFourHandScaleMultiplier(94)).toBeCloseTo(0.987, 3);
    expect(pcFourHandScaleMultiplier(106)).toBeCloseTo(1.113, 3);
  });

  it('4p UI pct clamps and bumps by 1%', () => {
    expect(clampPcFourHandScalePct(93)).toBe(94);
    expect(clampPcFourHandScalePct(107)).toBe(106);
    expect(bumpPcFourHandScalePct(100, 1)).toBe(101);
    expect(bumpPcFourHandScalePct(106, 1)).toBe(106);
    expect(bumpPcFourHandScalePct(94, -1)).toBe(94);
    expect(bumpPcFourHandScalePct(PC_FOUR_HAND_SCALE_PCT_DEFAULT, -1)).toBe(99);
  });

  it('adaptive hand base is recalibrated so 100% matches old native (−7% compact)', () => {
    expect(PC_HAND_NATIVE_RECALIBRATE).toBeCloseTo(1.4 * 0.93);
    expect(resolvePcHandAdaptiveScale(5)).toBeCloseTo(0.9 * 1.4 * 0.93);
    expect(resolvePcHandAdaptiveScale(12)).toBeCloseTo(0.76 * 1.4 * 0.93);
  });

  it('tablet hand compact stacks −5% × −5% × −3%', () => {
    expect(TABLET_HAND_COMPACT).toBeCloseTo(0.95 * 0.95 * 0.97);
  });

  it('tablet 4p: UI 100% = abs 1.0 (без ПК-надбавки 1.05)', () => {
    expect(TABLET_FOUR_HAND_ABS_AT_100).toBe(1);
    expect(tabletFourHandScaleMultiplier(100)).toBe(1);
    expect(tabletFourHandScaleMultiplier(94)).toBeCloseTo(0.94);
    expect(tabletFourHandScaleMultiplier(106)).toBeCloseTo(1.06);
    expect(tabletFourHandScaleMultiplier(100)).toBeLessThan(pcFourHandScaleMultiplier(100));
  });

  it('tablet 4p: −2px card height → gap to south panel is 8px', () => {
    expect(TABLET_FOUR_HAND_COMPACT_PX).toBe(2);
    expect(TABLET_FOUR_HAND_TO_PANEL_GAP_PX).toBe(8);
    const scale = (1 / (1.3 * 1.1)) * TABLET_HAND_COMPACT;
    const before = 100 * scale;
    const after = 100 * tabletFourHandScaleMinus1px(scale);
    expect(before - after).toBeCloseTo(TABLET_FOUR_HAND_COMPACT_PX, 5);
  });

  it('tablet 4p: table cards −2px height at 100% (compact base 76)', () => {
    expect(TABLET_FOUR_TABLE_CARD_BASE_H).toBe(76);
    expect(TABLET_FOUR_TABLE_CARD_COMPACT_PX).toBe(2);
    const scale = 1.18;
    const before = TABLET_FOUR_TABLE_CARD_BASE_H * scale;
    const after = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleMinus1px(scale);
    expect(before - after).toBeCloseTo(2, 5);
  });

  it('tablet 4p: table cards follow table scale up/down steps', () => {
    expect(tabletFourTableCardBonusPx(100)).toBe(0);
    expect(tabletFourTableCardBonusPx(103)).toBe(1);
    expect(tabletFourTableCardBonusPx(104)).toBe(2);
    expect(tabletFourTableCardBonusPx(108)).toBe(2);
    expect(tabletFourTableCardBonusPx(99)).toBe(-1);
    expect(tabletFourTableCardBonusPx(98)).toBe(-1);
    expect(tabletFourTableCardBonusPx(97)).toBe(-2);
    expect(tabletFourTableCardBonusPx(96)).toBe(-2);
    expect(tabletFourTableCardBonusPx(95)).toBe(-3);
    expect(tabletFourTableCardBonusPx(94)).toBe(-3);
    const scale = 1.18;
    const baseH = TABLET_FOUR_TABLE_CARD_BASE_H * scale;
    const at100 = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleWithTablePct(scale, 100);
    const at103 = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleWithTablePct(scale, 103);
    const at104 = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleWithTablePct(scale, 104);
    const at99 = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleWithTablePct(scale, 99);
    const at96 = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleWithTablePct(scale, 96);
    const at94 = TABLET_FOUR_TABLE_CARD_BASE_H * tabletFourTableCardScaleWithTablePct(scale, 94);
    expect(baseH - at100).toBeCloseTo(2, 5);
    expect(baseH - at103).toBeCloseTo(1, 5);
    expect(baseH - at104).toBeCloseTo(0, 5);
    expect(baseH - at99).toBeCloseTo(3, 5);
    expect(baseH - at96).toBeCloseTo(4, 5);
    expect(baseH - at94).toBeCloseTo(5, 5);
  });

  it('4p felt shrinks above 100% UI; 3p felt grows softly', () => {
    expect(pcTableFeltScaleMultiplier(106, 4)).toBeLessThan(1);
    expect(pcTableFeltScaleMultiplier(100, 4)).toBe(1);
    expect(pcTableFeltScaleMultiplier(94, 4)).toBe(1);
    expect(pcTableFeltScaleMultiplier(10, 3)).toBeGreaterThan(1);
    expect(pcTableFeltScaleMultiplier(0, 3)).toBe(1);
  });

  it('lifts table only for 3p', () => {
    expect(pcTableLiftExtraPx(10, 4)).toBe(0);
    expect(pcTableLiftExtraPx(10, 3)).toBe(39);
    expect(pcTableLiftExtraPx(40, 3)).toBe(50);
  });

  it('4p legacy compact mul is 1 (folded into abs scale)', () => {
    expect(pcFourSeatHandCompactMul(0)).toBe(1);
    expect(pcFourSeatHandCompactMul(10)).toBe(1);
  });

  it('side panel push grows with boost on 3p / with UI on 4p', () => {
    expect(pcSidePanelPushPx(0, 3)).toBe(0);
    expect(pcSidePanelPushPx(20, 3)).toBeGreaterThan(pcSidePanelPushPx(10, 3));
    expect(pcSidePanelPushPx(100, 4)).toBe(0);
    expect(pcSidePanelPushPx(106, 4)).toBe(14);
  });

  it('extra south height: none on 4p, grows on 3p', () => {
    expect(pcHandScaleExtraHeightPx(0, 3)).toBe(0);
    expect(pcHandScaleExtraHeightPx(10, 4)).toBe(0);
    expect(pcHandScaleExtraHeightPx(30, 3)).toBeGreaterThan(pcHandScaleExtraHeightPx(20, 3));
    expect(pcHandScaleExtraHeightPx(40, 3)).toBeLessThan(160);
  });

  it('hand-to-panel gap: 4p shrinks above 100%, 3p grows', () => {
    expect(pcHandToPanelGapPx(0, 3)).toBe(0);
    expect(pcHandToPanelGapPx(106, 4)).toBeLessThan(0);
    expect(pcHandToPanelGapPx(100, 4)).toBe(0);
    expect(pcHandToPanelGapPx(20, 3)).toBeGreaterThan(pcHandToPanelGapPx(10, 3));
  });

  it('table clearance: 3p steps, 4p zero', () => {
    expect(pcHandTableClearancePx(0, 3)).toBe(0);
    expect(pcHandTableClearancePx(10, 3)).toBe(39);
    expect(pcHandTableClearancePx(10, 4)).toBe(0);
    expect(pcHandTableClearancePx(20, 3)).toBe(36);
    expect(pcHandTableClearancePx(30, 3)).toBe(42);
    expect(pcHandTableClearancePx(40, 3)).toBe(50);
  });

  it('table up offset: 3p base higher than 4p', () => {
    expect(pcTableUpOffsetBasePx(4)).toBe(PC_TABLE_UP_OFFSET_BASE);
    expect(pcTableUpOffsetBasePx(3)).toBe(PC_TABLE_UP_OFFSET_BASE_THREE);
    expect(PC_TABLE_UP_OFFSET_BASE_THREE).toBeGreaterThan(PC_TABLE_UP_OFFSET_BASE);
    expect(pcTableUpOffsetTotalPx(0, 3)).toBe(PC_TABLE_UP_OFFSET_BASE_THREE);
    expect(pcTableUpOffsetTotalPx(0, 4)).toBe(PC_TABLE_UP_OFFSET_BASE);
    expect(pcTableUpOffsetTotalPx(10, 3)).toBe(PC_TABLE_UP_OFFSET_BASE_THREE + 39);
  });

  it('validates boost values', () => {
    expect(isPcHandScaleBoost(20)).toBe(true);
    expect(isPcHandScaleBoost(15)).toBe(false);
  });
});
