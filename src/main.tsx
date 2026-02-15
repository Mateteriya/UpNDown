// Сохраняем флаги «пришли по ссылке» до того, как Supabase очистит hash
if (typeof window !== 'undefined' && window.location.hash) {
  const h = window.location.hash
  if (h.includes('type=signup')) sessionStorage.setItem('updown_from_email_confirm', '1')
  else if (h.includes('access_token')) sessionStorage.setItem('updown_from_oauth_redirect', '1')
}

import React, { useEffect } from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AuthProvider } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { ErrorBoundary } from './ui/ErrorBoundary'
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
  <ErrorBoundary>
    {isDemo ? (
      <ThemeProvider>
        <DemoGuard>
          <CardsDemoPage onBack={() => (window.location.href = '/')} />
        </DemoGuard>
      </ThemeProvider>
    ) : (
      <AuthProvider>
        <ThemeProvider>
          <App />
        </ThemeProvider>
      </AuthProvider>
    )}
  </ErrorBoundary>
)
