import { describe, expect, it } from 'vitest';

/** Зеркало контракта mobileHandNeedsLFrame (комфортный нахлёст, не max-stack). */

const MOBILE_L_HAND_FROM_LEN = 10;
const MOBILE_HAND_CARD_BODY_W = Math.round(52 * 0.72);
const MOBILE_SOUTH_STRIP_INSET_PX = 6;
const MOBILE_TABLE_INNER_PAD_X_PX = 6;
const MOBILE_HAND_FRAME_EXTRA_INLINE_PX = 2;
const MOBILE_HAND_9_OVERLAP_BASE_PX = 5;

function needsLFrame(vw: number, handLen: number, slotPadding = 0, tierOverlap = 5): boolean {
  if (handLen < MOBILE_L_HAND_FROM_LEN) return false;
  const inset = MOBILE_SOUTH_STRIP_INSET_PX;
  const gutter = inset * 4 + MOBILE_HAND_FRAME_EXTRA_INLINE_PX * 2 + 2 + MOBILE_TABLE_INNER_PAD_X_PX;
  const inner = Math.max(48, vw - gutter);
  const slotOuter = MOBILE_HAND_CARD_BODY_W + 2 * slotPadding;
  const comfortO = Math.min(
    Math.max(tierOverlap, MOBILE_HAND_9_OVERLAP_BASE_PX),
    Math.max(0, Math.floor(slotOuter * 0.35)),
  );
  const rowW = handLen * slotOuter - (handLen - 1) * comfortO;
  return rowW > inner + 0.5;
}

describe('mobile L-hand eligibility (comfort-overlap)', () => {
  it('does not split when ≥10 cards fit on a wide DevTools mobile pane', () => {
    expect(needsLFrame(520, 11)).toBe(false);
    expect(needsLFrame(480, 10)).toBe(false);
  });

  it('splits on a phone-narrow width when 11+ cards exceed comfort row', () => {
    expect(needsLFrame(360, 11)).toBe(true);
    expect(needsLFrame(390, 12)).toBe(true);
  });

  it('never splits below 10 cards', () => {
    expect(needsLFrame(320, 9)).toBe(false);
    expect(needsLFrame(520, 9)).toBe(false);
  });
});
