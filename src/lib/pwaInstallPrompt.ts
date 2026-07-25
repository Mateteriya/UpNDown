/**
 * Установка PWA / ярлыка на домашний экран.
 * beforeinstallprompt — Chrome/Edge/Android; iOS — только подсказка Share → На экран «Домой».
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  });
}

function isStandaloneDisplay(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return true;
  } catch {
    /* ignore */
  }
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

/** Вызвать один раз при старте приложения (main.tsx). */
export function installPwaInstallCapture(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify();
  });
}

export function subscribePwaInstallAvailability(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export type PwaInstallKind = 'prompt' | 'ios-tip' | 'installed' | 'unavailable';

export function getPwaInstallKind(): PwaInstallKind {
  if (typeof window === 'undefined') return 'unavailable';
  if (isStandaloneDisplay()) return 'installed';
  if (deferred) return 'prompt';
  if (isIos()) return 'ios-tip';
  return 'unavailable';
}

export function canNativePwaInstall(): boolean {
  return getPwaInstallKind() === 'prompt';
}

/** Системный диалог «Установить приложение». */
export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  try {
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    deferred = null;
    notify();
    return outcome;
  } catch {
    deferred = null;
    notify();
    return 'unavailable';
  }
}

export function getIosAddToHomeTip(): string {
  return 'В Safari: «Поделиться» → «На экран „Домой“» — появится ярлык как у приложения.';
}
