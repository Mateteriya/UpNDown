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
import { CosmogenesisDemoPage } from './ui/CosmogenesisDemoPage'
import { ModeLabelLabPage } from './ui/ModeLabelLabPage'
import { RulesLabPage } from './ui/RulesLabPage'
import { OrderStyleLabPage } from './ui/OrderStyleLabPage'
import './theme-standard.css'
import './theme-neon.css'
import './index.css'
import './styles/mobile-order-panel.css'
import './styles/mobile-hand-l-frame.css'
import './styles/menu-pc.css'
import './styles/menu-mode-labels.css'
import './styles/menu-guest-identity.css'
import './styles/menu-signed-identity.css'
import './styles/menu-brand-mark.css'
import './styles/lobby-online-legend.css'
import './styles/account-lk-pc.css'
import './styles/match-archive.css'
import './styles/leaderboard.css'
import './styles/lk-modals.css'
import './styles/support-donate.css'
import './styles/support-menu-button.css'
import './styles/rules-screen.css'
import './styles/rules-view.css'
import './styles/tableChatSideEarMobile.css'
import './styles/mobileLandscapeChatAffordance.css'
import { bootstrapLanPlayFromServer } from './lib/lanJoinLink'
import { installCssDevGuard } from './lib/cssDevGuard'
import { installPwaStaleRecovery, stripRecoveryQueryFromUrl } from './lib/pwaStaleRecovery'
import { warmOfflineAssetsIfOnline } from './lib/warmOfflineAssets'
import { installPwaInstallCapture } from './lib/pwaInstallPrompt'
import './styles/offline-ready-orb.css'
/* После всех CSS: ПК plasma — без наружного ореола рамки (не править это в index.css — HMR ломает файл). */
import './styles/plasma-badge-pc-no-outer-glow.css'
/* Канон панели Юга (ПК/планшет): размеры, имя, аватар — единственный источник правды. */
import './styles/user-south-panel.css'

installPwaStaleRecovery()
stripRecoveryQueryFromUrl()
installCssDevGuard()
installPwaInstallCapture()
warmOfflineAssetsIfOnline()
window.addEventListener('online', () => warmOfflineAssetsIfOnline())

// LAN: /play/ с порта сервера — WS + v2 до инициализации контекста
bootstrapLanPlayFromServer()

const path = typeof window !== 'undefined' ? window.location.pathname : ''
if (typeof window !== 'undefined' && (path === '/lk' || path.startsWith('/lk/'))) {
  window.location.replace('/#account')
}
const hashRoute =
  typeof window !== 'undefined' ? (window.location.hash || '').replace(/^#/, '').toLowerCase() : ''
const isDemo = path === '/demo' || path.startsWith('/demo/')
const isCardDarkLab = path === '/demo/cards-dark' || path.startsWith('/demo/cards-dark/')
const isDealTrackLab = path === '/deal-track-lab' || path.startsWith('/deal-track-lab/')
const isTotalColorLab = path === '/total-color-lab' || path.startsWith('/total-color-lab/')
const isOnlineUiLab = path === '/online-ui-lab' || path.startsWith('/online-ui-lab/')
const isScoringDemo = path === '/scoring-demo' || path.startsWith('/scoring-demo/')
const isCosmogenesisDemo =
  path === '/cosmogenesis-demo' ||
  path.startsWith('/cosmogenesis-demo/') ||
  path.endsWith('/cosmogenesis-demo.html') ||
  hashRoute === 'cosmogenesis-demo' ||
  hashRoute === 'cosmo'
const isModeLabelLab = path === '/mode-label-lab' || path.startsWith('/mode-label-lab/')
const isOrderStyleLab = path === '/order-style-lab' || path.startsWith('/order-style-lab/')
const isRulesLab = path === '/rules-lab' || path.startsWith('/rules-lab/')
// /mode-label-lab — локальная песочница меню; не прод-UI (не пушить как фичу меню)
const devModeAllowed = typeof window !== 'undefined' && sessionStorage.getItem('updown-devMode') === '1'

function DemoGuard({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if ((isDemo || isDealTrackLab || isTotalColorLab || isOnlineUiLab || isRulesLab) && !devModeAllowed)
      window.location.href = '/'
  }, [])
  if ((isDemo || isDealTrackLab || isTotalColorLab || isOnlineUiLab || isRulesLab) && !devModeAllowed) return null
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
    ) : isCosmogenesisDemo ? (
      <ThemeProvider>
        <CosmogenesisDemoPage onBack={() => (window.location.href = '/')} />
      </ThemeProvider>
    ) : isModeLabelLab ? (
      <ThemeProvider>
        <ModeLabelLabPage onBack={() => (window.location.href = '/')} />
      </ThemeProvider>
    ) : isOrderStyleLab ? (
      <ThemeProvider>
        <OrderStyleLabPage onBack={() => (window.location.href = '/')} />
      </ThemeProvider>
    ) : isRulesLab ? (
      <ThemeProvider>
        <DemoGuard>
          <RulesLabPage onBack={() => (window.location.href = '/')} />
        </DemoGuard>
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
