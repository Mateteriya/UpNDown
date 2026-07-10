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

export function canRequestMobileBrowserFullscreen(): boolean {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };
  return !!(el.requestFullscreen || el.webkitRequestFullscreen);
}

/** По тапу пользователя: Android Chrome и часть браузеров — полноэкран без UI. iOS Safari часто откажет — тогда только scroll-immersive. */
export async function requestMobileBrowserFullscreen(): Promise<boolean> {
  if (typeof document === 'undefined') return false;
  const el = document.documentElement as HTMLElement & {
    requestFullscreen?: () => Promise<void>;
    webkitRequestFullscreen?: () => Promise<void>;
  };
  try {
    if (el.requestFullscreen) {
      await el.requestFullscreen();
      return true;
    }
    if (el.webkitRequestFullscreen) {
      await el.webkitRequestFullscreen();
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
  } catch {
    /* ignore */
  }
}
