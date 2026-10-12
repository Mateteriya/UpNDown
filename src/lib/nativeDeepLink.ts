/**
 * Deep link из установленного клиента (Capacitor / custom scheme).
 * Холодный старт уже читается через applyLanJoinParamsFromUrl();
 * здесь — повторное открытие приложения по updown://join?code=
 */

export type NativeJoinListener = (url: string) => void;

type AppPlugin = {
  addListener: (
    event: 'appUrlOpen',
    cb: (data: { url: string }) => void,
  ) => Promise<{ remove: () => Promise<void> }> | { remove: () => Promise<void> };
  getLaunchUrl?: () => Promise<{ url?: string } | undefined>;
};

/**
 * Подписаться на URL, которыми ОС открывает приложение.
 * Без @capacitor/app — только CustomEvent `updown:appUrlOpen` (для тестов/PWA).
 */
export function subscribeNativeJoinUrls(onUrl: NativeJoinListener): () => void {
  const cleanups: Array<() => void> = [];

  const onCustom = (ev: Event) => {
    const detail = (ev as CustomEvent<{ url?: string }>).detail;
    if (detail?.url) onUrl(detail.url);
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('updown:appUrlOpen', onCustom as EventListener);
    cleanups.push(() => window.removeEventListener('updown:appUrlOpen', onCustom as EventListener));
  }

  void (async () => {
    try {
      const { App } = await import('@capacitor/app');
      const plugin = App as unknown as AppPlugin;
      if (!plugin?.addListener) return;

      try {
        const launch = await plugin.getLaunchUrl?.();
        if (launch?.url) onUrl(launch.url);
      } catch {
        /* ignore */
      }

      const handle = await plugin.addListener('appUrlOpen', ({ url }) => {
        if (url) onUrl(url);
      });
      cleanups.push(() => {
        void Promise.resolve(handle.remove()).catch(() => {});
      });
    } catch {
      /* Web / без native — ок; CustomEvent всё ещё работает. */
    }
  })();

  return () => {
    for (const c of cleanups) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
  };
}
