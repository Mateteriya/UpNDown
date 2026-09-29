/**
 * Dev-only: если Vite «съел» CSS меню (пустой inject) —
 * на экране остаются огромные касты без кнопок. Делаем hard reload.
 */
export function installCssDevGuard(): void {
  if (!import.meta.env.DEV) return
  if (typeof document === 'undefined') return

  const KEY = 'upnd-css-empty-guard'
  const KEY_AT = 'upnd-css-empty-guard-at'
  const COOLDOWN_MS = 3000
  const RETRY_AFTER_MS = 12000
  let scheduled = 0

  const clearGuard = () => {
    try {
      sessionStorage.removeItem(KEY)
      sessionStorage.removeItem(KEY_AT)
    } catch {
      /* ignore */
    }
  }

  const hasMenuCssText = (): boolean => {
    for (const el of document.querySelectorAll('style')) {
      const text = el.textContent ?? ''
      if (
        text.includes('.menu-screen__stack') ||
        text.includes('.menu-screen__pc-cast') ||
        text.includes('menu-screen--pc-cinematic')
      ) {
        return true
      }
    }
    return false
  }

  const menuLayoutOk = (): boolean => {
    const menu = document.querySelector('.menu-screen--pc-cinematic, .menu-screen')
    if (!menu) return true
    const el = menu.querySelector('.menu-screen__stack, .menu-capsule, .menu-screen__drift')
    if (!el) return false
    const r = el.getBoundingClientRect()
    return r.width > 24 && r.height > 24
  }

  const probe = () => {
    if (hasMenuCssText() && menuLayoutOk()) {
      clearGuard()
      return
    }
    /* CSS text может быть в link/?direct — тогда смотрим только layout */
    if (!hasMenuCssText() && menuLayoutOk()) {
      clearGuard()
      return
    }
    if (menuLayoutOk()) {
      clearGuard()
      return
    }

    const now = Date.now()
    try {
      const already = sessionStorage.getItem(KEY) === '1'
      const at = Number(sessionStorage.getItem(KEY_AT) || '0')
      if (already && at && now - at < RETRY_AFTER_MS) return
      if (already && at && now - at < COOLDOWN_MS) return
      sessionStorage.setItem(KEY, '1')
      sessionStorage.setItem(KEY_AT, String(now))
    } catch {
      /* ignore */
    }

    console.error('[cssDevGuard] Menu layout broken (CSS missing) — hard reload')
    location.reload()
  }

  const schedule = () => {
    window.clearTimeout(scheduled)
    scheduled = window.setTimeout(probe, 600)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true })
  } else {
    schedule()
  }
  window.setTimeout(schedule, 1500)

  if (import.meta.hot) {
    import.meta.hot.on('vite:afterUpdate', () => {
      clearGuard()
      schedule()
    })
    import.meta.hot.on('vite:full-reload', clearGuard)
  }
}
