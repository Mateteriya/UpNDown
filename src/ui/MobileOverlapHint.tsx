/**
 * Подсказка при тесноте на мобильном в браузере:
 * когда высота viewport мала (шапка браузера съедает место), один раз показываем
 * «Потяните вниз, чтобы увидеть все элементы».
 */

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'updown-overlap-hint-shown'
const MOBILE_MAX_WIDTH = 600
/** Порог высоты: если видимая высота меньше — считаем, что шапка браузера съедает место и показываем подсказку */
const TIGHT_VIEWPORT_MAX_HEIGHT = 520

export default function MobileOverlapHint() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const check = () => {
      const isMobile = window.innerWidth < MOBILE_MAX_WIDTH
      const height = window.visualViewport?.height ?? window.innerHeight
      const isTight = height < TIGHT_VIEWPORT_MAX_HEIGHT
      const alreadyShown = sessionStorage.getItem(STORAGE_KEY) === '1'

      if (isMobile && isTight && !alreadyShown) {
        setVisible(true)
      } else {
        setVisible(false)
      }
    }

    const t = setTimeout(check, 400)
    check()
    window.visualViewport?.addEventListener('resize', check)
    window.addEventListener('resize', check)
    return () => {
      clearTimeout(t)
      window.visualViewport?.removeEventListener('resize', check)
      window.removeEventListener('resize', check)
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const t = setTimeout(() => {
      sessionStorage.setItem(STORAGE_KEY, '1')
      setVisible(false)
    }, 5000)
    return () => clearTimeout(t)
  }, [visible])

  const dismiss = () => {
    sessionStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      onClick={dismiss}
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 10000,
        padding: '10px 14px',
        background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.97) 0%, rgba(15, 23, 42, 0.99) 100%)',
        borderTop: '1px solid rgba(34, 211, 238, 0.4)',
        boxShadow: '0 -4px 20px rgba(0,0,0,0.3)',
        color: '#e2e8f0',
        fontSize: 13,
        textAlign: 'center',
        cursor: 'pointer',
      }}
    >
      <span style={{ opacity: 0.9 }}>Потяните вниз, чтобы увидеть все элементы</span>
      <div style={{ marginTop: 4, fontSize: 18 }}>↓</div>
    </div>
  )
}
