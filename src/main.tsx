import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { CardsDemoPage } from './ui/CardsDemoPage'
import './index.css'

const path = typeof window !== 'undefined' ? window.location.pathname : ''
const isDemo = path === '/demo' || path.startsWith('/demo/')
const devModeAllowed = typeof window !== 'undefined' && sessionStorage.getItem('updown-devMode') === '1'

function DemoGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (isDemo && !devModeAllowed) window.location.href = '/'
  }, [])
  if (isDemo && !devModeAllowed) return null
  return <>{children}</>
}

// StrictMode отключён — двойной вызов эффектов ломал таймеры AI (зависания на 4й, 6й раздаче)
ReactDOM.createRoot(document.getElementById('root')!).render(
  isDemo ? (
    <DemoGuard>
      <CardsDemoPage onBack={() => (window.location.href = '/')} />
    </DemoGuard>
  ) : (
    <App />
  )
)
