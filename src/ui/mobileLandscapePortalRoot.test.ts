import { describe, expect, it } from 'vitest';
import { buildMobileGamePortalRootClass } from './mobileLandscapePortalRoot';

describe('buildMobileGamePortalRootClass', () => {
  it('returns base only when not mobile', () => {
    expect(buildMobileGamePortalRootClass({ isMobile: false })).toBe('game-table-root');
  });

  it('adds landscape and south-tuned when requested', () => {
    expect(
      buildMobileGamePortalRootClass({
        isMobile: true,
        isMobileLandscape: true,
        southTuned: true,
      }),
    ).toBe(
      'game-table-root viewport-mobile viewport-mobile-landscape viewport-mobile-landscape-south-tuned',
    );
  });

  it('adds short viewport class without landscape', () => {
    expect(
      buildMobileGamePortalRootClass({
        isMobile: true,
        mobileViewportShort: true,
      }),
    ).toBe('game-table-root viewport-mobile viewport-mobile-short');
  });
});
