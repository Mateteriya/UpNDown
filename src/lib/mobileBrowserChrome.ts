/** PWA / «Добавить на главный экран» — без адресной строки браузера. */
export function isAppStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  if (nav.standalone) return true;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    window.matchMedia('(display-mode: fullscreen)').matches
  );
}

type FullscreenCapableElement = HTMLElement & {
  requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
  webkitRequestFullscreen?: () => Promise<void>;
};

/** Нижний «мёртвый» зазор: системная шторка Android, жестовая панель и т.п. (не safe-area). */
export function computeMobileViewportBottomGapPx(): number {
  if (typeof window === 'undefined') return 0;
  const vv = window.visualViewport;
  if (vv == null) return 0;
  const gap = window.innerHeight - vv.height - vv.offsetTop;
  if (!Number.isFinite(gap)) return 0;
  return Math.max(0, Math.round(gap));
}

let safeAreaBottomProbe: HTMLDivElement | null = null;

/** env(safe-area-inset-bottom) — home indicator iOS и часть Android. */
export function readSafeAreaInsetBottomPx(): number {
  if (typeof document === 'undefined') return 0;
  try {
    if (!safeAreaBottomProbe) {
      const el = document.createElement('div');
      el.style.cssText =
        'position:fixed;left:0;bottom:0;width:0;height:0;padding-bottom:env(safe-area-inset-bottom,0px);visibility:hidden;pointer-events:none;';
      safeAreaBottomProbe = el;
    }
    if (!safeAreaBottomProbe.isConnected) document.documentElement.appendChild(safeAreaBottomProbe);
    return safeAreaBottomProbe.offsetHeight || 0;
  } catch {
    return 0;
  }
}

/**
 * Суммарный отступ снизу: перекрытие visualViewport + safe-area + эвристика для PWA,
 * где шторка Android иногда не отражается в gap.
 */
export function computeMobileBottomObstructionInsetPx(options?: {
  standaloneDisplay?: boolean;
  /** Доп. запас над краем (px). */
  marginPx?: number;
}): number {
  const standalone = options?.standaloneDisplay ?? isAppStandaloneDisplayMode();
  const margin = options?.marginPx ?? 12;
  const vvGap = computeMobileViewportBottomGapPx();
  const safeBottom = readSafeAreaInsetBottomPx();
  /** Sony/Samsung PWA: gap=0, но 3-кнопочная панель ~48–56px. */
  const heuristicNav = standalone ? 52 : vvGap > 0 ? 0 : 28;
  return margin + Math.max(vvGap, safeBottom, heuristicNav);
}

export function readMobileVisibleViewportBottomPx(): number {
  const vv = window.visualViewport;
  if (vv != null) return vv.offsetTop + vv.height;
  return window.innerHeight;
}

export function syncMobileViewportBottomInsetCssVar(): void {
  if (typeof document === 'undefined') return;
  const gap = computeMobileViewportBottomGapPx();
  document.documentElement.style.setProperty('--mobile-viewport-bottom-gap', `${gap}px`);
}

let viewportBottomInsetTrackingInstalled = false;

/** Следим за visualViewport — поднимаем нижний UI над системной шторкой Sony/Samsung и др. */
export function installMobileViewportBottomInsetTracking(): () => void {
  if (typeof window === 'undefined' || viewportBottomInsetTrackingInstalled) {
    return () => {};
  }
  viewportBottomInsetTrackingInstalled = true;

  const upd = () => syncMobileViewportBottomInsetCssVar();
  upd();
  window.addEventListener('resize', upd);
  window.addEventListener('orientationchange', upd);
  window.visualViewport?.addEventListener('resize', upd);
  window.visualViewport?.addEventListener('scroll', upd);
  document.addEventListener('visibilitychange', upd);

  return () => {
    viewportBottomInsetTrackingInstalled = false;
    window.removeEventListener('resize', upd);
    window.removeEventListener('orientationchange', upd);
    window.visualViewport?.removeEventListener('resize', upd);
    window.visualViewport?.removeEventListener('scroll', upd);
    document.removeEventListener('visibilitychange', upd);
    document.documentElement.style.removeProperty('--mobile-viewport-bottom-gap');
  };
}

export function canRequestMobileBrowserFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FullscreenCapableElement;
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

let userPrefersBrowserFullscreen = false;

export function setMobileBrowserFullscreenPreference(active: boolean): void {
  userPrefersBrowserFullscreen = active;
}

/** По тапу пользователя: Android Chrome — полноэкран; navigationUI hide где поддерживается. */
export async function requestMobileBrowserFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as FullscreenCapableElement;
  try {
    if (el.requestFullscreen) {
      try {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } catch {
        await el.requestFullscreen();
      }
      userPrefersBrowserFullscreen = true;
      syncMobileViewportBottomInsetCssVar();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
      userPrefersBrowserFullscreen = true;
      syncMobileViewportBottomInsetCssVar();
      return true;
    }
  } catch {
    /* отказ пользователя или не поддерживается */
  }
  return false;
}

export function isMobileBrowserFullscreenActive(): boolean {
  if (typeof document === 'undefined') return false;
  return !!document.fullscreenElement;
}

export async function exitMobileBrowserFullscreen(): Promise<void> {
  if (typeof document === 'undefined' || !document.fullscreenElement) return;
  try {
    await document.exitFullscreen?.();
    userPrefersBrowserFullscreen = false;
    syncMobileViewportBottomInsetCssVar();
  } catch {
    /* ignore */
  }
}

/** После сворачивания браузера Android часто показывает системную шторку — пробуем вернуть fullscreen. */
export function installMobileBrowserFullscreenResume(): () => void {
  if (typeof document === 'undefined') return () => {};

  const onVisible = () => {
    if (document.visibilityState !== 'visible') return;
    syncMobileViewportBottomInsetCssVar();
    if (!userPrefersBrowserFullscreen || isMobileBrowserFullscreenActive()) return;
    void requestMobileBrowserFullscreen();
  };

  const onFullscreenChange = () => {
    const active = isMobileBrowserFullscreenActive();
    if (!active && userPrefersBrowserFullscreen && document.visibilityState === 'visible') {
      window.setTimeout(() => {
        if (userPrefersBrowserFullscreen && !isMobileBrowserFullscreenActive()) {
          void requestMobileBrowserFullscreen();
        }
      }, 120);
    }
    syncMobileViewportBottomInsetCssVar();
  };

  document.addEventListener('visibilitychange', onVisible);
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    document.removeEventListener('webkitfullscreenchange', onFullscreenChange as EventListener);
  };
}
