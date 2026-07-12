import { describe, expect, it } from 'vitest';
import {
  capMobileLandscapeNorthPanelWidthPx,
  estimateMobileLandscapeNorthColumnWidthPx,
  isMobileLandscapeSouthLayoutTuned,
  MOBILE_LANDSCAPE_SOUTH_PANEL_FIXED_REFERENCE_W_PX,
  MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX,
  MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX,
  mobileLandscapeSouthPanelFixedWidthPxWhenTuned,
} from './mobileLandscapeSouthLayout';

describe('isMobileLandscapeSouthLayoutTuned', () => {
  it('true at reference 660×330', () => {
    expect(
      isMobileLandscapeSouthLayoutTuned({
        width: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX,
        height: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX,
      }),
    ).toBe(true);
  });

  it('true at 660×329 (Edge/DevTools height off by 1px)', () => {
    expect(
      isMobileLandscapeSouthLayoutTuned({
        width: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX,
        height: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX - 1,
      }),
    ).toBe(true);
  });

  it('true above reference', () => {
    expect(isMobileLandscapeSouthLayoutTuned({ width: 800, height: 400 })).toBe(true);
  });

  it('false when width below minimum', () => {
    expect(
      isMobileLandscapeSouthLayoutTuned({
        width: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX - 1,
        height: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX,
      }),
    ).toBe(false);
  });

  it('false when height below minimum with tolerance', () => {
    expect(
      isMobileLandscapeSouthLayoutTuned({
        width: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_WIDTH_PX,
        height: MOBILE_LANDSCAPE_SOUTH_TUNED_MIN_HEIGHT_PX - 2,
      }),
    ).toBe(false);
  });
});

describe('mobileLandscapeSouthPanelFixedWidthPxWhenTuned', () => {
  it('returns reference panel width when tuned', () => {
    expect(
      mobileLandscapeSouthPanelFixedWidthPxWhenTuned({
        width: 660,
        height: 330,
      }),
    ).toBe(MOBILE_LANDSCAPE_SOUTH_PANEL_FIXED_REFERENCE_W_PX);
  });

  it('returns null below tuned threshold', () => {
    expect(
      mobileLandscapeSouthPanelFixedWidthPxWhenTuned({
        width: 640,
        height: 330,
      }),
    ).toBeNull();
  });
});

describe('estimateMobileLandscapeNorthColumnWidthPx', () => {
  it('matches landscape table-col formula (660px wide)', () => {
    expect(estimateMobileLandscapeNorthColumnWidthPx(660)).toBe(322);
  });

  it('narrows on short-VH landscape width (540px)', () => {
    expect(estimateMobileLandscapeNorthColumnWidthPx(540)).toBe(226);
  });
});

describe('capMobileLandscapeNorthPanelWidthPx', () => {
  it('keeps ideal width when column is wide enough', () => {
    expect(capMobileLandscapeNorthPanelWidthPx(660, 248)).toBe(248);
  });

  it('caps panel to column on narrow landscape', () => {
    expect(capMobileLandscapeNorthPanelWidthPx(540, 248)).toBe(224);
  });
});
