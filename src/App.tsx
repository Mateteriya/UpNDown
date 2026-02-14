/**
 * Up&Down — Главный экран (MVP)
 * @see TZ.md раздел 7.2
 */

import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { hasSavedGame, clearGameStateFromStorage, getPlayerProfile, savePlayerProfile, type PlayerProfile } from './game/persistence'
import { loadProfileFromSupabase, saveProfileToSupabase } from './lib/profileSync'
import { useAuth } from './contexts/AuthContext'
import MobileOverlapHint from './ui/MobileOverlapHint'
import { NameAvatarModal } from './ui/NameAvatarModal'
import { RatingModal } from './ui/RatingModal'
import { AuthModal } from './ui/AuthModal'
import { LobbyScreen } from './ui/LobbyScreen'

/** Ленивая загрузка экрана игры: уменьшает начальный бандл и ускоряет первый показ меню; экран игры подгружается при переходе. */
const GameTable = lazy(() => import('./ui/GameTable'))

const DEV_MODE_KEY = 'updown-devMode'
const DEFAULT_DISPLAY_NAME = 'Вы'

function App() {
  const { user, signOut, configured } = useAuth()
  const [screen, setScreen] = useState<'menu' | 'game'>(() => (hasSavedGame() ? 'game' : 'menu'))
  const [gameId, setGameId] = useState(1)
  const [devMode, setDevMode] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_MODE_KEY) === '1')
  const [profile, setProfile] = useState<PlayerProfile>(() => getPlayerProfile())
  const [showNameAvatarModal, setShowNameAvatarModal] = useState(false)
  const [nameAvatarMode, setNameAvatarMode] = useState<'first-run' | 'profile'>('profile')
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [screenLobby, setScreenLobby] = useState(false)
  const [showRegistrationSuccessModal, setShowRegistrationSuccessModal] = useState(false)
  const [showOAuthSuccessModal, setShowOAuthSuccessModal] = useState(false)

  useEffect(() => {
    setProfile(getPlayerProfile())
  }, [screen])

  // Модалки при возврате после авторизации
  useEffect(() => {
    if (!user) return
    const storage = typeof sessionStorage !== 'undefined' ? sessionStorage : null
    if (storage?.getItem('updown_from_email_confirm') === '1') {
      storage.removeItem('updown_from_email_confirm')
      setShowRegistrationSuccessModal(true)
    } else if (storage?.getItem('updown_from_oauth_redirect') === '1') {
      storage.removeItem('updown_from_oauth_redirect')
      setShowOAuthSuccessModal(true)
    }
  }, [user?.id])

  // Синхронизация профиля с Supabase при входе
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      const remote = await loadProfileFromSupabase(user.id)
      if (cancelled) return
      if (remote) {
        const merged: PlayerProfile = {
          displayName: remote.displayName,
          avatarDataUrl: remote.avatarDataUrl ?? null,
          profileId: remote.profileId ?? getPlayerProfile().profileId,
        }
        savePlayerProfile(merged)
        setProfile(merged)
      } else {
        const local = getPlayerProfile()
        await saveProfileToSupabase(user.id, local)
      }
    })()
    return () => { cancelled = true }
  }, [user?.id])

  const enableDevMode = useCallback(() => {
    sessionStorage.setItem(DEV_MODE_KEY, '1')
    setDevMode(true)
  }, [])

  const startGame = () => {
    setGameId(id => id + 1)
    setScreen('game')
  }

  const handleOfflineClick = () => {
    if (profile.displayName === DEFAULT_DISPLAY_NAME) {
      setNameAvatarMode('first-run')
      setShowNameAvatarModal(true)
      // Пока пользователь вводит имя — подгружаем чанк игры, чтобы к моменту «Сохранить» экран открылся быстрее
      import('./ui/GameTable')
    } else {
      startGame()
    }
  }

  const handleNameAvatarConfirm = useCallback((data: { displayName: string; avatarDataUrl?: string | null }) => {
    const current = getPlayerProfile()
    const next: PlayerProfile = {
      displayName: data.displayName,
      avatarDataUrl: data.avatarDataUrl ?? null,
      profileId: current.profileId,
    }
    savePlayerProfile(next)
    setProfile(next)
    setShowNameAvatarModal(false)
    if (user?.id) saveProfileToSupabase(user.id, next)
    if (nameAvatarMode === 'first-run') startGame()
  }, [nameAvatarMode, user?.id])

  const handleExit = () => {
    clearGameStateFromStorage()
    setScreen('menu')
  }

  const handleNewGame = () => {
    clearGameStateFromStorage()
    setGameId(id => id + 1)
  }

  return (
    <>
      {screen === 'menu' && !screenLobby && (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
          <h1
            style={{ fontSize: '2rem', marginBottom: '0.5rem', userSelect: 'none' }}
            onContextMenu={(e) => e.preventDefault()}
            onPointerDown={(e) => {
              if (e.button !== 0) return
              const target = e.currentTarget
              const t = window.setTimeout?.(() => { enableDevMode() }, 1200)
              const clear = () => { window.clearTimeout?.(t) }
              target.addEventListener('pointerup', clear, { once: true })
              target.addEventListener('pointerleave', clear, { once: true })
            }}
          >
            Up&Down
          </h1>
          <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
            Карточная игра на взятки
          </p>
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <button style={buttonStyle} onClick={() => setScreenLobby(true)}>
              Онлайн
            </button>
            <button style={buttonStyle} onClick={handleOfflineClick}>
              Офлайн против ИИ
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, background: 'transparent', borderColor: 'rgba(148,163,184,0.5)' }}
              onClick={() => { setNameAvatarMode('profile'); setShowNameAvatarModal(true) }}
            >
              Профиль (имя и фото)
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, background: 'transparent', borderColor: 'rgba(148,163,184,0.5)' }}
              onClick={() => setShowRatingModal(true)}
            >
              Ваш рейтинг
            </button>
            {user ? (
              <button
                type="button"
                style={{ ...buttonStyle, background: 'transparent', borderColor: 'rgba(148,163,184,0.5)' }}
                onClick={() => signOut()}
                title={user.email ?? undefined}
              >
                Выйти ({user.email?.split('@')[0] ?? 'аккаунт'})
              </button>
            ) : (
              <button
                type="button"
                style={{ ...buttonStyle, background: 'transparent', borderColor: 'rgba(148,163,184,0.5)' }}
                onClick={() => { setAuthMode('login'); setShowAuthModal(true) }}
              >
                Вход
              </button>
            )}
            {devMode && (
              <a href="/demo" style={{ ...buttonStyle, textDecoration: 'none', textAlign: 'center' }}>
                Демо карт (для разработчика)
              </a>
            )}
            <button disabled style={buttonStyle}>
              Турниры (скоро)
            </button>
            <button disabled style={buttonStyle}>
              Обучение (скоро)
            </button>
          </nav>
        </main>
      )}
      {showRatingModal && (
        <RatingModal
          onClose={() => setShowRatingModal(false)}
          playerAvatarDataUrl={profile.avatarDataUrl}
        />
      )}
      {showAuthModal && (
        <AuthModal
          mode={authMode}
          onClose={() => setShowAuthModal(false)}
          onSwitchMode={setAuthMode}
        />
      )}
      {showRegistrationSuccessModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowRegistrationSuccessModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="registration-success-title"
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(34,211,238,0.3)',
              padding: 32,
              maxWidth: 360,
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="registration-success-title" style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600, color: '#22d3ee' }}>
              Регистрация прошла успешно!
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: '#94a3b8' }}>
              Добро пожаловать в Up&Down. Теперь вы можете играть офлайн или войти на другом устройстве.
            </p>
            <button
              type="button"
              onClick={() => setShowRegistrationSuccessModal(false)}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid #22d3ee',
                background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              Отлично!
            </button>
          </div>
        </div>
      )}
      {showOAuthSuccessModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.7)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10000,
            padding: 20,
          }}
          onClick={(e) => e.target === e.currentTarget && setShowOAuthSuccessModal(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="oauth-success-title"
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(34,211,238,0.3)',
              padding: 32,
              maxWidth: 360,
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="oauth-success-title" style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600, color: '#22d3ee' }}>
              Всё супер!
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: '#94a3b8' }}>
              Вы успешно вошли в аккаунт. Добро пожаловать в Up&Down!
            </p>
            <button
              type="button"
              onClick={() => setShowOAuthSuccessModal(false)}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                fontWeight: 600,
                borderRadius: 8,
                border: '1px solid #22d3ee',
                background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
                color: '#f8fafc',
                cursor: 'pointer',
              }}
            >
              Отлично!
            </button>
          </div>
        </div>
      )}
      {screenLobby && (
        <LobbyScreen
          onBack={() => setScreenLobby(false)}
          playerName={profile.displayName}
        />
      )}
      {showNameAvatarModal && (
        <NameAvatarModal
          initialDisplayName={profile.displayName}
          initialAvatarDataUrl={profile.avatarDataUrl}
          title={nameAvatarMode === 'first-run' ? 'Как к вам обращаться?' : 'Профиль'}
          confirmLabel="Сохранить"
          onConfirm={handleNameAvatarConfirm}
          onCancel={nameAvatarMode === 'profile' ? () => setShowNameAvatarModal(false) : undefined}
        />
      )}
      {/* key={gameId} — полное пересоздание при новой партии */}
      <div style={{ display: screen === 'game' ? 'block' : 'none', position: 'fixed', inset: 0, overflow: 'hidden' }}>
        {gameId >= 1 && (
          <Suspense fallback={
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '1rem', background: '#0f172a', color: '#94a3b8' }}>
              <div style={{ width: 32, height: 32, border: '3px solid rgba(34,211,238,0.3)', borderTopColor: '#22d3ee', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} aria-hidden />
              <span style={{ fontSize: '1rem' }}>Загрузка игры...</span>
            </div>
          }>
            <GameTable
              key={gameId}
              gameId={gameId}
              playerDisplayName={profile.displayName}
              playerAvatarDataUrl={profile.avatarDataUrl}
              onExit={handleExit}
              onNewGame={handleNewGame}
            />
          </Suspense>
        )}
        <MobileOverlapHint />
      </div>
    </>
  )
}

const buttonStyle: React.CSSProperties = {
  padding: '1rem 1.5rem',
  fontSize: '1rem',
  borderRadius: '8px',
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  cursor: 'pointer',
  transition: 'background 0.2s',
}

export default App
