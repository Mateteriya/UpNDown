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

  it('scales up when larger (e.g. 125% of reference)', () => {
    const w = TABLET_LAYOUT_REF_WIDTH_PX * 1.25;
    const h = TABLET_LAYOUT_REF_HEIGHT_PX * 1.25;
    expect(computeTabletViewportScale(w, h)).toBeCloseTo(1.25);
  });

  it('respects min and max floors', () => {
    expect(computeTabletViewportScale(200, 100)).toBe(TABLET_VIEWPORT_SCALE_MIN);
    expect(computeTabletViewportScale(3000, 2000)).toBe(TABLET_VIEWPORT_SCALE_MAX);
  });
});
