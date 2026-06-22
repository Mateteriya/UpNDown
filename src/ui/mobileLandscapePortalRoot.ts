/**
 * Классы корня для мобильных порталов на document.body.
 * Должны совпадать с классами game-table-root в GameTable, иначе landscape-CSS не применяется.
 */
export type MobileGamePortalRootClassOptions = {
  isMobile: boolean;
  isMobileLandscape?: boolean;
  southTuned?: boolean;
  mobileViewportShort?: boolean;
};

export function buildMobileGamePortalRootClass(opts: MobileGamePortalRootClassOptions): string {
  const parts = ['game-table-root'];
  if (!opts.isMobile) return parts.join(' ');
  parts.push('viewport-mobile');
  if (opts.isMobileLandscape) parts.push('viewport-mobile-landscape');
  if (opts.isMobileLandscape && opts.southTuned) parts.push('viewport-mobile-landscape-south-tuned');
  if (opts.mobileViewportShort) parts.push('viewport-mobile-short');
  return parts.join(' ');
}
