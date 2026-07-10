/**
 * После частых деплоев старый Service Worker может отдавать index.html со ссылками
 * на удалённые JS-чанки (lazy GameTable). Обычный F5 не помогает — SW перехватывает
 * навигацию. Один раз сбрасываем SW + Cache Storage и перезагружаем.
 */
const RELOAD_GUARD_KEY = 'updown-pwa-recovery-reload'

function isStaleChunkError(reason: unknown): boolean {
  const msg = String((reason as Error)?.message ?? reason ?? '')
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  )
}

async function clearPwaCaches(): Promise<void> {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* best effort */
  }
}

async function hardReloadAfterStaleCache(): Promise<boolean> {
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
    sessionStorage.removeItem(RELOAD_GUARD_KEY)
    return false
  }
  sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
  await clearPwaCaches()
  window.location.reload()
  return true
}

/** Явный сброс из UI (ErrorBoundary) — без ограничения «один раз за сессию». */
export async function resetPwaCacheAndReload(): Promise<void> {
  sessionStorage.removeItem(RELOAD_GUARD_KEY)
  await clearPwaCaches()
  window.location.reload()
}

export function installPwaStaleRecovery(): void {
  if (typeof window === 'undefined') return

  window.addEventListener('vite:preloadError', (ev) => {
    ev.preventDefault()
    void hardReloadAfterStaleCache()
  })

  window.addEventListener('unhandledrejection', (ev) => {
    if (!isStaleChunkError(ev.reason)) return
    ev.preventDefault()
    void hardReloadAfterStaleCache()
  })
}
