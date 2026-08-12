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

/** Запас скролла документа ≈ высота URL-бара — иначе при 100dvh/100vh = visible скроллить нечего. */
const CHROME_COLLAPSE_SCROLL_ROOM_PX = 100;

function readVisualViewportHeightPx(): number {
  const vv = window.visualViewport;
  if (vv != null && vv.height > 0) return Math.round(vv.height);
  return Math.round(window.innerHeight);
}

function shouldAidMobileBrowserChromeCollapse(): boolean {
  if (typeof window === 'undefined') return false;
  if (isAppStandaloneDisplayMode()) return false;
  if (isMobileBrowserFullscreenActive()) return false;
  /* Телефон / узкий viewport; не ПК с мышью */
  if (!window.matchMedia('(max-width: 1024px)').matches) return false;
  return true;
}

/**
 * Жест «подтянуть страницу вверх» → скрыть шапку браузера.
 * Современный Chrome часто даёт 100vh ≈ visible + overflow:hidden на корне стола —
 * document не скроллится и chrome не прячется. Держим min-height документа
 * выше visualViewport и на finger-up программно scroll'им window.
 */
export function installMobileBrowserChromeCollapseAid(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return () => {};

  let startY = 0;
  let startX = 0;
  let tracking = false;
  let armed = false;
  let lastAppliedScrollY = 0;

  const clearRoomStyles = () => {
    const html = document.documentElement;
    html.style.removeProperty('min-height');
    html.classList.remove('upd-chrome-collapse-aid');
    document.body.style.removeProperty('min-height');
    document.body.classList.remove('upd-chrome-collapse-aid');
  };

  const ensureScrollRoom = () => {
    if (!shouldAidMobileBrowserChromeCollapse()) {
      clearRoomStyles();
      return;
    }
    const visual = readVisualViewportHeightPx();
    const minH = `${visual + CHROME_COLLAPSE_SCROLL_ROOM_PX}px`;
    const html = document.documentElement;
    html.classList.add('upd-chrome-collapse-aid');
    html.style.minHeight = minH;
    document.body.classList.add('upd-chrome-collapse-aid');
    document.body.style.minHeight = minH;
  };

  const onTouchStart = (e: TouchEvent) => {
    if (!shouldAidMobileBrowserChromeCollapse() || e.touches.length !== 1) {
      tracking = false;
      armed = false;
      return;
    }
    const tgt = e.target;
    if (
      tgt instanceof Element &&
      tgt.closest(
        'input, textarea, select, [contenteditable="true"], .table-chat-side-ear, .table-chat-dock, .mobile-short-fullscreen-entry-btn',
      )
    ) {
      tracking = false;
      armed = false;
      return;
    }
    ensureScrollRoom();
    const t = e.touches[0];
    startY = t.clientY;
    startX = t.clientX;
    lastAppliedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
    tracking = true;
    armed = false;
  };

  const onTouchMove = (e: TouchEvent) => {
    if (!tracking || !shouldAidMobileBrowserChromeCollapse()) return;
    const t = e.touches[0];
    if (!t) return;
    const dyUp = startY - t.clientY; /* палец вверх → страница «вверх» → scroll вниз */
    const dx = t.clientX - startX;
    if (!armed) {
      if (Math.abs(dyUp) < 8 && Math.abs(dx) < 8) return;
      if (Math.abs(dx) >= Math.abs(dyUp) * 0.85) {
        tracking = false;
        return;
      }
      /* Только «подтянуть вверх»; вниз оставляем браузеру (pull-to-refresh / показать chrome) */
      if (dyUp < 10) return;
      armed = true;
      ensureScrollRoom();
    }
    if (dyUp <= 0) return;
    const room = CHROME_COLLAPSE_SCROLL_ROOM_PX;
    const cur = window.scrollY || document.documentElement.scrollTop || 0;
    const next = Math.min(room, Math.max(0, lastAppliedScrollY + Math.min(dyUp * 0.45, 28)));
    if (next !== cur) {
      window.scrollTo(0, next);
    }
  };

  const onTouchEnd = () => {
    if (!tracking && !armed) return;
    tracking = false;
    armed = false;
    if (!shouldAidMobileBrowserChromeCollapse()) return;
    /* После скрытия chrome visual растёт — оставляем 1px, чтобы часть WebKit не вернула шапку */
    window.requestAnimationFrame(() => {
      ensureScrollRoom();
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      if (y > 1) window.scrollTo(0, 1);
    });
  };

  const onViewportChange = () => {
    ensureScrollRoom();
  };

  ensureScrollRoom();
  document.documentElement.classList.add('upd-chrome-collapse-aid');

  const opts: AddEventListenerOptions = { capture: true, passive: true };
  window.addEventListener('touchstart', onTouchStart, opts);
  window.addEventListener('touchmove', onTouchMove, opts);
  window.addEventListener('touchend', onTouchEnd, opts);
  window.addEventListener('touchcancel', onTouchEnd, opts);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('orientationchange', onViewportChange);
  window.visualViewport?.addEventListener('resize', onViewportChange);
  window.visualViewport?.addEventListener('scroll', onViewportChange);

  return () => {
    window.removeEventListener('touchstart', onTouchStart, opts);
    window.removeEventListener('touchmove', onTouchMove, opts);
    window.removeEventListener('touchend', onTouchEnd, opts);
    window.removeEventListener('touchcancel', onTouchEnd, opts);
    window.removeEventListener('resize', onViewportChange);
    window.removeEventListener('orientationchange', onViewportChange);
    window.visualViewport?.removeEventListener('resize', onViewportChange);
    window.visualViewport?.removeEventListener('scroll', onViewportChange);
    clearRoomStyles();
  };
}
