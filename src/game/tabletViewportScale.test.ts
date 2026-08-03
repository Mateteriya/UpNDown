import { describe, expect, it } from 'vitest';
import {
  computeTabletViewportScale,
  TABLET_LAYOUT_REF_HEIGHT_PX,
  TABLET_LAYOUT_REF_WIDTH_PX,
  TABLET_VIEWPORT_SCALE_MAX,
  TABLET_VIEWPORT_SCALE_MIN,
} from './tabletViewportScale';

describe('tabletViewportScale', () => {
  it('is ~1 on reference', () => {
    expect(
      computeTabletViewportScale(TABLET_LAYOUT_REF_WIDTH_PX, TABLET_LAYOUT_REF_HEIGHT_PX),
    ).toBeCloseTo(1);
  });

  it('scales down when smaller', () => {
    expect(computeTabletViewportScale(900, 618)).toBeCloseTo(900 / 1035);
    expect(computeTabletViewportScale(1035, 500)).toBeCloseTo(500 / 618);
  });

  it('does not scale up when larger than reference (keeps fit, no hand crush)', () => {
    const w = TABLET_LAYOUT_REF_WIDTH_PX * 1.25;
    const h = TABLET_LAYOUT_REF_HEIGHT_PX * 1.25;
    expect(computeTabletViewportScale(w, h)).toBe(1);
    expect(TABLET_VIEWPORT_SCALE_MAX).toBe(1);
  });

  it('respects min floor and max=1 ceiling', () => {
    expect(computeTabletViewportScale(200, 100)).toBe(TABLET_VIEWPORT_SCALE_MIN);
    expect(computeTabletViewportScale(3000, 2000)).toBe(TABLET_VIEWPORT_SCALE_MAX);
    expect(computeTabletViewportScale(3000, 2000)).toBe(1);
  });
});
