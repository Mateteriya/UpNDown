/**
 * Up&Down — Главный экран (MVP)
 * @see TZ.md раздел 7.2
 */

import { useState, useCallback, useEffect, lazy, Suspense } from 'react'
import { hasSavedGame, clearGameStateFromStorage, getPlayerProfile, savePlayerProfile, type PlayerProfile } from './game/persistence'
import { loadProfileFromSupabase, saveProfileToSupabase } from './lib/profileSync'
import { useAuth } from './contexts/AuthContext'
import { useTheme } from './contexts/ThemeContext'
import { useOnlineGame, loadOnlineSession } from './contexts/OnlineGameContext'
import MobileOverlapHint from './ui/MobileOverlapHint'
import { HistoryModal } from './ui/HistoryModal'
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
  const { theme, toggleTheme } = useTheme()
  const online = useOnlineGame()
  const [screen, setScreen] = useState<'menu' | 'game'>('menu')
  const [gameId, setGameId] = useState(1)
  const [devMode, setDevMode] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_MODE_KEY) === '1')
  const [profile, setProfile] = useState<PlayerProfile>(() => getPlayerProfile())
  const [showNameAvatarModal, setShowNameAvatarModal] = useState(false)
  const [nameAvatarMode, setNameAvatarMode] = useState<'first-run' | 'profile' | 'new-account'>('profile')
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [screenLobby, setScreenLobby] = useState(false)
  const [showRegistrationSuccessModal, setShowRegistrationSuccessModal] = useState(false)
  const [showOAuthSuccessModal, setShowOAuthSuccessModal] = useState(false)
  const [roomFinishedMessage, setRoomFinishedMessage] = useState<string | null>(null)

  useEffect(() => {
    setProfile(getPlayerProfile())
  }, [screen])

  // После обновления страницы: если восстановилась онлайн-партия — открыть экран игры
  useEffect(() => {
    if (screen !== 'menu') return;
    let suppress = false
    try { suppress = sessionStorage.getItem(SUPPRESS_AUTO_OPEN_KEY) === '1' } catch { suppress = false }
    if (suppress) return;
    if (online.status === 'playing' && online.roomId) {
      setScreen('game')
    }
  }, [online.status, online.roomId, screen])

  useEffect(() => {
    if (!roomFinishedMessage) return
    const t = setTimeout(() => setRoomFinishedMessage(null), 4000)
    return () => clearTimeout(t)
  }, [roomFinishedMessage])

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

  // Синхронизация профиля с Supabase при входе (имя/ник жёстко привязаны к аккаунту/почте)
  useEffect(() => {
    if (!user?.id) return
    const PENDING_NAME_KEY_PREFIX = 'updown_pending_name_'
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
        // Новый пользователь: имя при регистрации по email сохранено в sessionStorage; иначе — запросим в модалке
        const emailKey = user.email?.toLowerCase().trim()
        const pendingName = emailKey && typeof sessionStorage !== 'undefined'
          ? sessionStorage.getItem(PENDING_NAME_KEY_PREFIX + emailKey)
          : null
        if (pendingName != null && pendingName.trim()) {
          const defaultProfile: PlayerProfile = {
            displayName: pendingName.trim().slice(0, 17),
            avatarDataUrl: null,
            profileId: getPlayerProfile().profileId,
          }
          await saveProfileToSupabase(user.id, defaultProfile)
          savePlayerProfile(defaultProfile)
          setProfile(defaultProfile)
          try {
            sessionStorage.removeItem(PENDING_NAME_KEY_PREFIX + emailKey)
          } catch {
            /* ignore */
          }
        } else {
          // OAuth или вход без регистрации — имя не задано, показываем модалку «Задайте имя для этого аккаунта»
          setNameAvatarMode('new-account')
          setShowNameAvatarModal(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, user?.email])

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
      if (online.status !== 'idle') {
        online.leaveRoom().finally(() => startGame())
      } else {
        startGame()
      }
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
    if (nameAvatarMode === 'new-account') setNameAvatarMode('profile')
  }, [nameAvatarMode, user?.id])

  const SUPPRESS_AUTO_OPEN_KEY = 'updown_suppress_auto_open'
  const handleExit = () => {
    try {
      sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1')
    } catch { /* ignore */ }
    clearGameStateFromStorage()
    setScreen('menu')
  }

  const canResumeOffline = hasSavedGame()
  const canResumeOnline = loadOnlineSession() !== null

  const handleResumeOffline = useCallback(() => {
    if (online.status !== 'idle') {
      online.leaveRoom().finally(() => setScreen('game'))
    } else {
      setScreen('game')
    }
  }, [online.status, online.leaveRoom])

  const handleResumeOnline = useCallback(async () => {
    if (!user) return
    try { sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY) } catch { /* ignore */ }
    const r = await online.tryRestoreSession()
    if (r.roomFinished) {
      setRoomFinishedMessage('Партия уже завершена.')
      return
    }
    if (r.needReclaim) {
      return
    }
    if (r.ok) setScreen('game')
  }, [user, online])

  const handleConfirmReclaim = useCallback(async () => {
    const ok = await online.confirmReclaim()
    if (ok) setScreen('game')
  }, [online])

  const handleDismissReclaim = useCallback(() => {
    online.dismissReclaim()
  }, [online])

  const handleNewGame = () => {
    clearGameStateFromStorage()
    setGameId(id => id + 1)
  }

  // Управление историей браузера: #menu ↔ #game и popstate
  useEffect(() => {
    const applyHash = () => {
      const h = window.location.hash || '#menu'
      if (h === '#menu') {
        try { sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1') } catch { /* ignore */ }
        setScreen('menu')
      } else if (h === '#game') {
        try { sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY) } catch { /* ignore */ }
        setScreen('game')
      }
    }
    window.addEventListener('popstate', applyHash)
    return () => window.removeEventListener('popstate', applyHash)
  }, [])
  useEffect(() => {
    const targetHash = screen === 'game' ? '#game' : '#menu'
    if (window.location.hash !== targetHash) {
      history.pushState({ screen }, '', targetHash)
    }
    if (screen === 'menu') {
      try { sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1') } catch { /* ignore */ }
    }
  }, [screen])

  return (
    <>
      {screen === 'menu' && !screenLobby && (
        <main style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto', position: 'relative' }}>
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === 'neon' ? 'Стандарт' : 'Неоновая'}
            aria-label={theme === 'neon' ? 'Переключить на стандартную тему' : 'Переключить на неоновую тему'}
            style={{
              position: 'absolute',
              top: '1rem',
              right: '1rem',
              width: 40,
              height: 40,
              padding: 0,
              borderRadius: 8,
              border: '1px solid #334155',
              background: theme === 'neon' ? '#1e293b' : '#f1f5f9',
              color: theme === 'neon' ? '#94a3b8' : '#64748b',
              cursor: 'pointer',
              fontSize: 18,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {theme === 'neon' ? '☀' : '🌙'}
          </button>
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
            {canResumeOffline && (
              <button
                type="button"
                style={{ ...buttonStyle, borderColor: 'rgba(34,211,238,0.6)', background: 'rgba(34,211,238,0.15)' }}
                onClick={handleResumeOffline}
              >
                Продолжить офлайн-партию
              </button>
            )}
            {canResumeOnline && (
              <button
                type="button"
                style={{ ...buttonStyle, borderColor: 'rgba(34,211,238,0.6)', background: 'rgba(34,211,238,0.15)' }}
                onClick={handleResumeOnline}
              >
                Продолжить онлайн-партию
              </button>
            )}
            <button style={buttonStyle} onClick={() => setScreenLobby(true)}>
              Онлайн
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, background: 'transparent', borderColor: 'rgba(148,163,184,0.5)' }}
              onClick={() => setShowHistoryModal(true)}
            >
              История
            </button>
            <button style={buttonStyle} onClick={handleOfflineClick}>
              Офлайн против ИИ
            </button>
            <button
              type="button"
              style={{ ...buttonStyle, background: 'transparent', borderColor: 'rgba(148,163,184,0.5)' }}
              onClick={() => { setNameAvatarMode('profile'); setShowNameAvatarModal(true) }}
            >
              Изменить профиль (имя и фото)
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
      {showHistoryModal && (
        <HistoryModal
          onClose={() => setShowHistoryModal(false)}
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
      {online.pendingReclaimOffer && (
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
          role="dialog"
          aria-modal="true"
          aria-labelledby="reclaim-title"
        >
          <div
            style={{
              background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
              borderRadius: 16,
              border: '1px solid rgba(34,211,238,0.3)',
              padding: 32,
              maxWidth: 400,
              textAlign: 'center',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <p id="reclaim-title" style={{ margin: '0 0 12px', fontSize: 20, fontWeight: 600, color: '#22d3ee' }}>
              Вернуться в партию?
            </p>
            <p style={{ margin: '0 0 24px', fontSize: 15, color: '#94a3b8', lineHeight: 1.5 }}>
              Пока вы отсутствовали, за вас играл ИИ. Если вы вернётесь, ваши результаты будут включать и ходы ИИ.
              Если откажетесь — партия не будет учитываться в вашем личном рейтинге, но сохранится в истории как незавершённая.
            </p>
            <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={handleConfirmReclaim}
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
                Продолжить игру
              </button>
              <button
                type="button"
                onClick={handleDismissReclaim}
                style={{
                  padding: '12px 24px',
                  fontSize: 16,
                  borderRadius: 8,
                  border: '1px solid #64748b',
                  background: 'transparent',
                  color: '#94a3b8',
                  cursor: 'pointer',
                }}
              >
                Не продолжать
              </button>
            </div>
          </div>
        </div>
      )}
      {roomFinishedMessage && (
        <div
          role="status"
          style={{
            position: 'fixed',
            bottom: 24,
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '12px 20px',
            borderRadius: 8,
            background: '#1e293b',
            border: '1px solid rgba(34,211,238,0.3)',
            color: '#f8fafc',
            zIndex: 10001,
            fontSize: 14,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          {roomFinishedMessage}
        </div>
      )}
      {screenLobby && (
        <LobbyScreen
          onBack={() => setScreenLobby(false)}
          playerName={profile.displayName}
          onGoToGame={() => {
            setScreenLobby(false);
            setGameId(id => id + 1);
            setScreen('game');
          }}
        />
      )}
      {showNameAvatarModal && (
        <NameAvatarModal
          initialDisplayName={nameAvatarMode === 'new-account' ? (user?.email?.split('@')[0] ?? '') : profile.displayName}
          initialAvatarDataUrl={profile.avatarDataUrl}
          title={
            nameAvatarMode === 'first-run'
              ? 'Как к вам обращаться?'
              : nameAvatarMode === 'new-account'
                ? 'Задайте имя для этого аккаунта (привязывается к почте)'
                : 'Профиль'
          }
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
