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
import { OnlineGameProvider } from './contexts/OnlineGameContext'
import { ErrorBoundary } from './ui/ErrorBoundary'
import { CardsDemoPage } from './ui/CardsDemoPage'
import { CardDarkLabPage } from './ui/CardDarkLabPage'
import { DealTrackLabPage } from './ui/DealTrackLabPage'
import { TotalColorLabPage } from './ui/TotalColorLabPage'
import { OnlineUiLabPage } from './ui/OnlineUiLabPage'
import { ScoringDemoPage } from './ui/ScoringDemoPage'
import './theme-standard.css'
import './theme-neon.css'
import './index.css'
import './styles/tableChatSideEarMobile.css'

const path = typeof window !== 'undefined' ? window.location.pathname : ''
const isDemo = path === '/demo' || path.startsWith('/demo/')
const isCardDarkLab = path === '/demo/cards-dark' || path.startsWith('/demo/cards-dark/')
const isDealTrackLab = path === '/deal-track-lab' || path.startsWith('/deal-track-lab/')
const isTotalColorLab = path === '/total-color-lab' || path.startsWith('/total-color-lab/')
const isOnlineUiLab = path === '/online-ui-lab' || path.startsWith('/online-ui-lab/')
const isScoringDemo = path === '/scoring-demo' || path.startsWith('/scoring-demo/')
const devModeAllowed = typeof window !== 'undefined' && sessionStorage.getItem('updown-devMode') === '1'

function DemoGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ((isDemo || isDealTrackLab || isTotalColorLab || isOnlineUiLab) && !devModeAllowed) window.location.href = '/'
  }, [])
  if ((isDemo || isDealTrackLab || isTotalColorLab || isOnlineUiLab) && !devModeAllowed) return null
  return <>{children}</>
}

// StrictMode отключён — двойной вызов эффектов ломал таймеры AI (зависания на 4й, 6й раздаче)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    {isDemo ? (
      <ThemeProvider>
        <DemoGuard>
          {isCardDarkLab ? (
            <CardDarkLabPage onBack={() => (window.location.href = '/demo')} />
          ) : (
            <CardsDemoPage onBack={() => (window.location.href = '/')} />
          )}
        </DemoGuard>
      </ThemeProvider>
    ) : isDealTrackLab ? (
      <ThemeProvider>
        <DemoGuard>
          <DealTrackLabPage onBack={() => (window.location.href = '/')} />
        </DemoGuard>
      </ThemeProvider>
    ) : isTotalColorLab ? (
      <ThemeProvider>
        <DemoGuard>
          <TotalColorLabPage onBack={() => (window.location.href = '/')} />
        </DemoGuard>
      </ThemeProvider>
    ) : isOnlineUiLab ? (
      <ThemeProvider>
        <DemoGuard>
          <OnlineUiLabPage onBack={() => (window.location.href = '/')} />
        </DemoGuard>
      </ThemeProvider>
    ) : isScoringDemo ? (
      <ThemeProvider>
        <ScoringDemoPage onBack={() => (window.location.href = '/')} />
      </ThemeProvider>
    ) : (
      <AuthProvider>
        <OnlineGameProvider>
          <ThemeProvider>
            <App />
          </ThemeProvider>
        </OnlineGameProvider>
      </AuthProvider>
    )}
  </ErrorBoundary>
)
