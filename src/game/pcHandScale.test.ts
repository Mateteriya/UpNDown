import { describe, expect, it } from 'vitest';
import {
  nextPcHandScaleBoost,
  prevPcHandScaleBoost,
  pcHandScaleMultiplier,
  pcThreeHandScaleMultiplier,
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
  clampPcThreeHandScalePct,
  bumpPcFourHandScalePct,
  bumpPcThreeHandScalePct,
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
  PC_THREE_HAND_SCALE_PCT_DEFAULT,
  PC_THREE_HAND_SCALE_PCT_MAX,
  PC_THREE_HAND_SCALE_PCT_MIN,
  PC_THREE_HAND_SCALE_PCT_STEP,
  TABLET_HAND_COMPACT,
  TABLET_FOUR_HAND_ABS_AT_100,
  TABLET_FOUR_HAND_CARD_SIZE_MUL,
  TABLET_FOUR_HAND_BASE_BOOST_PX,
  TABLET_FOUR_HAND_SCALE_PCT_MAX,
  TABLET_FOUR_HAND_SCALE_PCT_STEP,
  TABLET_FOUR_HAND_COMPACT_PX,
  TABLET_FOUR_HAND_TO_PANEL_GAP_PX,
  TABLET_FOUR_TABLE_CARD_BASE_H,
  TABLET_FOUR_TABLE_CARD_COMPACT_PX,
  tabletFourHandScaleMinus1px,
  tabletFourHandScaleMultiplier,
  tabletFourHandBoostBasePx,
  tabletFourHandScaleFromUiPct,
  tabletFourTableCardBonusPx,
  tabletFourTableCardScaleMinus1px,
  tabletFourTableCardScaleWithTablePct,
  tabletThreeBidBtnScaleMul,
  tabletThreeHandGrowDownPx,
  TABLET_THREE_BID_BTN_SCALE_FOLLOW,
} from './pcHandScale';

describe('pcHandScale', () => {
  it('legacy boost increments with seat max (kept for migration helpers)', () => {
    expect(nextPcHandScaleBoost(0, 4)).toBe(10);
    expect(nextPcHandScaleBoost(10, 4)).toBe(10);
    expect(nextPcHandScaleBoost(0, 3)).toBe(10);
    expect(nextPcHandScaleBoost(30, 3)).toBe(40);
    expect(nextPcHandScaleBoost(40, 3)).toBe(40);
  });

  it('legacy boost decrements without wrapping below 0', () => {
    expect(prevPcHandScaleBoost(40)).toBe(30);
    expect(prevPcHandScaleBoost(10)).toBe(0);
    expect(prevPcHandScaleBoost(0)).toBe(0);
  });

  it('clamps legacy boost by seat count', () => {
    expect(pcHandScaleMaxForSeats(4)).toBe(10);
    expect(pcHandScaleMaxForSeats(3)).toBe(40);
    expect(clampPcHandScaleBoost(40, 4)).toBe(10);
    expect(clampPcHandScaleBoost(20, 3)).toBe(20);
  });

  it('legacy card multiplier matches boost percent', () => {
    expect(pcHandScaleMultiplier(0)).toBe(1);
    expect(pcHandScaleMultiplier(10)).toBe(1.1);
    expect(pcHandScaleMultiplier(40)).toBe(1.4);
  });

  it('3p: UI 95…125 step 5; 100% = 1.0', () => {
    expect(PC_THREE_HAND_SCALE_PCT_MIN).toBe(95);
    expect(PC_THREE_HAND_SCALE_PCT_MAX).toBe(125);
    expect(PC_THREE_HAND_SCALE_PCT_DEFAULT).toBe(100);
    expect(PC_THREE_HAND_SCALE_PCT_STEP).toBe(5);
    expect(pcThreeHandScaleMultiplier(100)).toBe(1);
    expect(pcThreeHandScaleMultiplier(95)).toBeCloseTo(0.95);
    expect(pcThreeHandScaleMultiplier(125)).toBeCloseTo(1.25);
    expect(clampPcThreeHandScalePct(94)).toBe(95);
    expect(clampPcThreeHandScalePct(126)).toBe(125);
    expect(clampPcThreeHandScalePct(107)).toBe(105);
    expect(clampPcThreeHandScalePct(108)).toBe(110);
    expect(bumpPcThreeHandScalePct(100, 1)).toBe(105);
    expect(bumpPcThreeHandScalePct(100, -1)).toBe(95);
    expect(bumpPcThreeHandScalePct(95, -1)).toBe(95);
    expect(bumpPcThreeHandScalePct(125, 1)).toBe(125);
  });

  it('tablet 3p: bid buttons follow only part of card scale; grow-down only when >100%', () => {
    expect(TABLET_THREE_BID_BTN_SCALE_FOLLOW).toBe(0.4);
    expect(tabletThreeBidBtnScaleMul(1)).toBe(1);
    expect(tabletThreeBidBtnScaleMul(1.25)).toBeCloseTo(1.1);
    expect(tabletThreeBidBtnScaleMul(0.95)).toBeCloseTo(0.98);
    expect(tabletThreeHandGrowDownPx(0.7, 100)).toBe(0);
    expect(tabletThreeHandGrowDownPx(0.7, 95)).toBe(0);
    expect(tabletThreeHandGrowDownPx(0.7, 125)).toBeGreaterThan(0);
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

  it('tablet 4p: UI 100% = abs 1.0 (без ПК-надбавки 1.05); потолок 200%', () => {
    expect(TABLET_FOUR_HAND_ABS_AT_100).toBe(1);
    expect(TABLET_FOUR_HAND_SCALE_PCT_MAX).toBe(200);
    expect(tabletFourHandScaleMultiplier(100)).toBe(1);
    expect(tabletFourHandScaleMultiplier(94)).toBeCloseTo(0.94);
    expect(tabletFourHandScaleMultiplier(106)).toBeCloseTo(1.06);
    expect(tabletFourHandScaleMultiplier(200)).toBeCloseTo(2);
    expect(clampPcFourHandScalePct(220, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(200);
    expect(bumpPcFourHandScalePct(195, 1, TABLET_FOUR_HAND_SCALE_PCT_STEP, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(200);
    expect(bumpPcFourHandScalePct(200, 1, TABLET_FOUR_HAND_SCALE_PCT_STEP, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(200);
    expect(tabletFourHandScaleMultiplier(100)).toBeLessThan(pcFourHandScaleMultiplier(100));
  });

  it('tablet 4p: ×0.85 +3px base; gear step 5% = ±5px height', () => {
    expect(TABLET_FOUR_HAND_CARD_SIZE_MUL).toBe(0.85);
    expect(TABLET_FOUR_HAND_BASE_BOOST_PX).toBe(3);
    expect(TABLET_FOUR_HAND_SCALE_PCT_STEP).toBe(5);
    expect(TABLET_FOUR_HAND_TO_PANEL_GAP_PX).toBe(8);
    const raw = resolvePcHandAdaptiveScale(9) * TABLET_HAND_COMPACT;
    const sized = tabletFourHandBoostBasePx(raw * TABLET_FOUR_HAND_CARD_SIZE_MUL);
    const h100 = 100 * sized;
    const h105 = 100 * tabletFourHandScaleFromUiPct(sized, 105);
    const h95 = 100 * tabletFourHandScaleFromUiPct(sized, 95);
    expect(h105 - h100).toBeCloseTo(5, 5);
    expect(h100 - h95).toBeCloseTo(5, 5);
    expect(bumpPcFourHandScalePct(100, 1, TABLET_FOUR_HAND_SCALE_PCT_STEP)).toBe(105);
    expect(bumpPcFourHandScalePct(100, -1, TABLET_FOUR_HAND_SCALE_PCT_STEP)).toBe(95);
    /* Off-grid (напр. после ПК step 1): следующий клик попадает на 100% */
    expect(bumpPcFourHandScalePct(99, 1, TABLET_FOUR_HAND_SCALE_PCT_STEP, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(100);
    expect(bumpPcFourHandScalePct(99, -1, TABLET_FOUR_HAND_SCALE_PCT_STEP, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(95);
    expect(bumpPcFourHandScalePct(101, -1, TABLET_FOUR_HAND_SCALE_PCT_STEP, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(100);
    expect(bumpPcFourHandScalePct(94, 1, TABLET_FOUR_HAND_SCALE_PCT_STEP, TABLET_FOUR_HAND_SCALE_PCT_MAX)).toBe(95);
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
    expect(pcTableFeltScaleMultiplier(110, 3)).toBeGreaterThan(1);
    expect(pcTableFeltScaleMultiplier(100, 3)).toBe(1);
    expect(pcTableFeltScaleMultiplier(95, 3)).toBe(1);
  });

  it('lifts table only for 3p above 100%', () => {
    expect(pcTableLiftExtraPx(110, 4)).toBe(0);
    expect(pcTableLiftExtraPx(110, 3)).toBe(39);
    expect(pcTableLiftExtraPx(125, 3)).toBe(40);
    expect(pcTableLiftExtraPx(95, 3)).toBe(0);
  });

  it('4p legacy compact mul is 1 (folded into abs scale)', () => {
    expect(pcFourSeatHandCompactMul(0)).toBe(1);
    expect(pcFourSeatHandCompactMul(10)).toBe(1);
  });

  it('side panel push grows with UI on 3p / with UI on 4p', () => {
    expect(pcSidePanelPushPx(100, 3)).toBe(0);
    expect(pcSidePanelPushPx(95, 3)).toBe(0);
    expect(pcSidePanelPushPx(120, 3)).toBeGreaterThan(pcSidePanelPushPx(110, 3));
    expect(pcSidePanelPushPx(100, 4)).toBe(0);
    expect(pcSidePanelPushPx(106, 4)).toBe(14);
  });

  it('extra south height: none on 4p, grows on 3p above 100%', () => {
    expect(pcHandScaleExtraHeightPx(100, 3)).toBe(0);
    expect(pcHandScaleExtraHeightPx(110, 4)).toBe(0);
    expect(pcHandScaleExtraHeightPx(120, 3)).toBeGreaterThan(pcHandScaleExtraHeightPx(110, 3));
    expect(pcHandScaleExtraHeightPx(125, 3)).toBeLessThan(160);
  });

  it('hand-to-panel gap: 4p shrinks above 100%, 3p grows', () => {
    expect(pcHandToPanelGapPx(100, 3)).toBe(0);
    expect(pcHandToPanelGapPx(106, 4)).toBeLessThan(0);
    expect(pcHandToPanelGapPx(100, 4)).toBe(0);
    expect(pcHandToPanelGapPx(120, 3)).toBeGreaterThan(pcHandToPanelGapPx(110, 3));
  });

  it('table clearance: 3p steps, 4p zero', () => {
    expect(pcHandTableClearancePx(100, 3)).toBe(0);
    expect(pcHandTableClearancePx(110, 3)).toBe(39);
    expect(pcHandTableClearancePx(110, 4)).toBe(0);
    expect(pcHandTableClearancePx(120, 3)).toBe(36);
    expect(pcHandTableClearancePx(125, 3)).toBe(40);
  });

  it('table up offset: 3p base higher than 4p', () => {
    expect(pcTableUpOffsetBasePx(4)).toBe(PC_TABLE_UP_OFFSET_BASE);
    expect(pcTableUpOffsetBasePx(3)).toBe(PC_TABLE_UP_OFFSET_BASE_THREE);
    expect(PC_TABLE_UP_OFFSET_BASE_THREE).toBeGreaterThan(PC_TABLE_UP_OFFSET_BASE);
    expect(pcTableUpOffsetTotalPx(100, 3)).toBe(PC_TABLE_UP_OFFSET_BASE_THREE);
    expect(pcTableUpOffsetTotalPx(100, 4)).toBe(PC_TABLE_UP_OFFSET_BASE);
    expect(pcTableUpOffsetTotalPx(110, 3)).toBe(PC_TABLE_UP_OFFSET_BASE_THREE + 39);
  });

  it('validates legacy boost values', () => {
    expect(isPcHandScaleBoost(20)).toBe(true);
    expect(isPcHandScaleBoost(15)).toBe(false);
  });
});
