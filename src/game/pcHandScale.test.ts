import { describe, expect, it } from 'vitest';
import {
  nextPcHandScaleBoost,
  prevPcHandScaleBoost,
  pcHandScaleMultiplier,
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
  pcHandScaleMaxForSeats,
  isPcHandScaleBoost,
  resolvePcHandAdaptiveScale,
  PC_HAND_NATIVE_RECALIBRATE,
  TABLET_HAND_COMPACT,
} from './pcHandScale';

describe('pcHandScale', () => {
  it('increments with seat max (4p caps at 10)', () => {
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

  it('card multiplier matches boost percent', () => {
    expect(pcHandScaleMultiplier(0)).toBe(1);
    expect(pcHandScaleMultiplier(10)).toBe(1.1);
    expect(pcHandScaleMultiplier(40)).toBe(1.4);
  });

  it('adaptive hand base is recalibrated so 100% matches old native (−7% compact)', () => {
    expect(PC_HAND_NATIVE_RECALIBRATE).toBeCloseTo(1.4 * 0.93);
    expect(resolvePcHandAdaptiveScale(5)).toBeCloseTo(0.9 * 1.4 * 0.93);
    expect(resolvePcHandAdaptiveScale(12)).toBeCloseTo(0.76 * 1.4 * 0.93);
  });

  it('tablet hand compact stacks −5% × −5% × −3%', () => {
    expect(TABLET_HAND_COMPACT).toBeCloseTo(0.95 * 0.95 * 0.97);
  });

  it('4p felt shrinks; 3p felt grows softly', () => {
    expect(pcTableFeltScaleMultiplier(10, 4)).toBeLessThan(1);
    expect(pcTableFeltScaleMultiplier(10, 3)).toBeGreaterThan(1);
    expect(pcTableFeltScaleMultiplier(0, 4)).toBe(1);
  });

  it('lifts table only for 3p', () => {
    expect(pcTableLiftExtraPx(10, 4)).toBe(0);
    expect(pcTableLiftExtraPx(10, 3)).toBe(39);
    expect(pcTableLiftExtraPx(40, 3)).toBe(50);
  });

  it('4p hand is slightly compacted at 110%', () => {
    expect(pcFourSeatHandCompactMul(0)).toBe(1);
    expect(pcFourSeatHandCompactMul(10)).toBe(0.98);
    expect(pcFourSeatHandCompactMul(10)).toBeLessThan(1);
  });

  it('side panel push grows with boost on 3p', () => {
    expect(pcSidePanelPushPx(0, 3)).toBe(0);
    expect(pcSidePanelPushPx(20, 3)).toBeGreaterThan(pcSidePanelPushPx(10, 3));
  });

  it('extra south height: none on 4p, grows on 3p', () => {
    expect(pcHandScaleExtraHeightPx(0, 3)).toBe(0);
    expect(pcHandScaleExtraHeightPx(10, 4)).toBe(0);
    expect(pcHandScaleExtraHeightPx(30, 3)).toBeGreaterThan(pcHandScaleExtraHeightPx(20, 3));
    expect(pcHandScaleExtraHeightPx(40, 3)).toBeLessThan(160);
  });

  it('hand-to-panel gap: 4p shrinks, 3p grows', () => {
    expect(pcHandToPanelGapPx(0, 3)).toBe(0);
    expect(pcHandToPanelGapPx(10, 4)).toBeLessThan(0);
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
