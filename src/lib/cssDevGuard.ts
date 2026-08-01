/**
 * Dev-only: если Vite снова «съест» CSS меню (пустой inject),
 * на экране меню останется только каст без UI — делаем один hard reload.
 * Не трогает нормальный CSS HMR за столом (партия не должна сбрасываться).
 */
export function installCssDevGuard(): void {
  if (!import.meta.env.DEV) return
  if (typeof document === 'undefined') return

  const KEY = 'upnd-css-empty-guard'
  let scheduled = 0

  const probe = () => {
    const menu = document.querySelector('.menu-screen--pc-cinematic, .menu-screen')
    if (!menu) return

    const hasMenuCss = [...document.querySelectorAll('style')].some((el) => {
      const text = el.textContent ?? ''
      return (
        text.includes('.menu-screen__stack') ||
        text.includes('.menu-screen__pc-cast') ||
        text.includes('menu-screen--pc-cinematic')
      )
    })

    if (hasMenuCss) {
      try {
        sessionStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
      return
    }

    console.error('[cssDevGuard] Menu CSS missing after load/HMR — hard reload once')
    try {
      if (sessionStorage.getItem(KEY) === '1') return
      sessionStorage.setItem(KEY, '1')
    } catch {
      /* ignore */
    }
    location.reload()
  }

  const schedule = () => {
    window.clearTimeout(scheduled)
    scheduled = window.setTimeout(probe, 500)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedule, { once: true })
  } else {
    schedule()
  }
  window.setTimeout(schedule, 1200)

  if (import.meta.hot) {
    import.meta.hot.on('vite:afterUpdate', schedule)
    import.meta.hot.on('vite:full-reload', () => {
      try {
        sessionStorage.removeItem(KEY)
      } catch {
        /* ignore */
      }
    })
  }
}
