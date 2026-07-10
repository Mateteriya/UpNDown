/**
 * После частых деплоев старый Service Worker может отдавать index.html со ссылками
 * на удалённые JS-чанки (lazy GameTable). Обычный F5/reload() не помогает — SW
 * перехватывает навигацию. Сбрасываем SW + Cache Storage и делаем replace() с cache-bust.
 */
const RELOAD_GUARD_KEY = 'updown-pwa-recovery-reload'
const RECOVER_QUERY_KEY = '_updown_recover'
const CACHE_CLEAR_TIMEOUT_MS = 5000

declare global {
  interface Window {
    __updownHardReload?: (clearCache?: boolean) => void
  }
}

function isStaleChunkError(reason: unknown): boolean {
  const msg = String((reason as Error)?.message ?? reason ?? '')
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Importing a module script failed/i.test(msg) ||
    /error loading dynamically imported module/i.test(msg)
  )
}

function hardNavigateReload(): void {
  const url = new URL(window.location.href)
  url.searchParams.set(RECOVER_QUERY_KEY, String(Date.now()))
  window.location.replace(url.toString())
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

async function clearPwaCachesWithTimeout(): Promise<void> {
  await Promise.race([
    clearPwaCaches(),
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, CACHE_CLEAR_TIMEOUT_MS)
    }),
  ])
}

async function hardReloadAfterStaleCache(): Promise<boolean> {
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
    return false
  }
  sessionStorage.setItem(RELOAD_GUARD_KEY, '1')
  await clearPwaCachesWithTimeout()
  hardNavigateReload()
  return true
}

/** Обычное обновление с обходом кэша навигации (без сброса SW). */
export function hardReloadPage(): void {
  sessionStorage.removeItem(RELOAD_GUARD_KEY)
  hardNavigateReload()
}

/** Явный сброс из UI (ErrorBoundary) — без ограничения «один раз за сессию». */
export async function resetPwaCacheAndReload(): Promise<void> {
  sessionStorage.removeItem(RELOAD_GUARD_KEY)
  await clearPwaCachesWithTimeout()
  hardNavigateReload()
}

/** Убрать cache-bust из адресной строки после успешной загрузки. */
export function stripRecoveryQueryFromUrl(): void {
  const url = new URL(window.location.href)
  if (!url.searchParams.has(RECOVER_QUERY_KEY)) return
  url.searchParams.delete(RECOVER_QUERY_KEY)
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState(window.history.state, '', next)
}

/**
 * Синхронный хук для index.html — работает даже если React не поднялся.
 * Дублирует логику сброса без импорта бандла.
 */
export function installWindowHardReloadHook(): void {
  if (typeof window === 'undefined') return
  window.__updownHardReload = (clearCache = false) => {
    sessionStorage.removeItem(RELOAD_GUARD_KEY)
    if (!clearCache) {
      hardNavigateReload()
      return
    }
    void clearPwaCachesWithTimeout().finally(() => {
      hardNavigateReload()
    })
  }
}

export function installPwaStaleRecovery(): void {
  if (typeof window === 'undefined') return

  installWindowHardReloadHook()

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
