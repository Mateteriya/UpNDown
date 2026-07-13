/**
 * Up&Down — Главный экран (MVP)
 * @see TZ.md раздел 7.2
 */

import { useState, useCallback, useEffect, useRef, lazy, Suspense } from 'react'
import { hasSavedGame, clearGameStateFromStorage, getPlayerProfile, savePlayerProfile, type PlayerProfile } from './game/persistence'
import { loadProfileFromSupabase, saveProfileToSupabase } from './lib/profileSync'
import { useAuth } from './contexts/AuthContext'
import { useOnlineGame } from './contexts/useOnlineGame'
import { loadOnlineSession, markLobbyUiOpen, wasLobbyUiOpen, SUPPRESS_AUTO_OPEN_KEY } from './lib/onlineSession'
import { loadLastOnlineParty } from './lib/lastOnlineParty'
import { isWsOnlineTransport } from './lib/onlineTransport'
import {
  consumeAvatarCameraPending,
  consumePendingAvatarDraft,
  mergeStoredAvatarIntoProfile,
} from './lib/profileAvatarSave'
import MobileOverlapHint from './ui/MobileOverlapHint'
import { HistoryModal } from './ui/HistoryModal'
import { NameAvatarModal } from './ui/NameAvatarModal'
import TrainingScreen from './ui/TrainingScreen'
import { RatingModal } from './ui/RatingModal'
import { AuthModal } from './ui/AuthModal'
import { applyLanJoinParamsFromUrl } from './lib/lanJoinLink'
import { LobbyScreen } from './ui/LobbyScreen'
import { OfflineResumeChoiceModal } from './ui/OfflineResumeChoiceModal'
import { AccountLkPage } from './ui/AccountLkPage'
import { MainMenuScreen } from './ui/MainMenuScreen'
import { ACCOUNT_ROUTE_HASH, isAccountRouteHash } from './lib/accountRoute'

/** Ленивая загрузка экрана игры: уменьшает начальный бандл и ускоряет первый показ меню; экран игры подгружается при переходе. */
const GameTable = lazy(() => import('./ui/GameTable'))

const DEV_MODE_KEY = 'updown-devMode'
const DEFAULT_DISPLAY_NAME = 'Вы'

function readInitialScreen(): 'menu' | 'game' | 'training' | 'account' {
  if (typeof window === 'undefined') return 'menu'
  const h = (window.location.hash || '#menu').trim().toLowerCase()
  if (h === '#game') return 'game'
  if (h === '#training') return 'training'
  if (isAccountRouteHash(h)) return 'account'
  return 'menu'
}

function App() {
  const { user, signOut, configured, loading: authLoading } = useAuth()
  const online = useOnlineGame()
  // Не открывать стол по одному лишь sessionStorage: до applyRoomData roomId пустой —
  // GameTable успевал поднять офлайн-партию с ИИ и перекрывал лобби (fixed без z-index).
  // После F5 с #game не затирать хеш в меню: начальный экран совпадает с location.hash.
  const [screen, setScreen] = useState<'menu' | 'game' | 'training' | 'account'>(() => readInitialScreen())
  const didAutoOpenLobbyRef = useRef(false)
  const hadOnlineRoomRef = useRef(false)
  /** Уже показывали «Задайте имя для этого аккаунта» этому user.id в сессии — не дёргать setShow снова при повторном срабатывании эффекта. */
  const newAccountGatePromptedRef = useRef<string | null>(null)
  const [gameId, setGameId] = useState(1)
  const [devMode, setDevMode] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_MODE_KEY) === '1')
  const [profile, setProfile] = useState<PlayerProfile>(() => getPlayerProfile())
  const [showNameAvatarModal, setShowNameAvatarModal] = useState(false)
  const [nameAvatarMode, setNameAvatarMode] = useState<'first-run' | 'profile' | 'new-account'>('profile')
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [showOfflineChoiceModal, setShowOfflineChoiceModal] = useState(false)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
  const [screenLobby, setScreenLobby] = useState(() => {
    if (typeof window === 'undefined') return false
    const { code } = applyLanJoinParamsFromUrl()
    return !!code
  })
  const [urlJoinCode, setUrlJoinCode] = useState(() => {
    if (typeof window === 'undefined') return null
    const { code } = applyLanJoinParamsFromUrl()
    return code
  })
  const [urlLanAutojoin] = useState(() => {
    if (typeof window === 'undefined') return false
    return applyLanJoinParamsFromUrl().autojoin === true
  })
  const [showRegistrationSuccessModal, setShowRegistrationSuccessModal] = useState(false)
  const [showOAuthSuccessModal, setShowOAuthSuccessModal] = useState(false)
  const [roomFinishedMessage, setRoomFinishedMessage] = useState<string | null>(null)
  const [onlineResumeMessage, setOnlineResumeMessage] = useState<string | null>(null)

  useEffect(() => {
    setProfile(getPlayerProfile())
  }, [screen])

  /** После нативной камеры вкладка часто перезагружается — подтянуть аватар и комнату. */
  useEffect(() => {
    mergeStoredAvatarIntoProfile()
    const pendingAvatar = consumePendingAvatarDraft()
    if (pendingAvatar) {
      setProfile((p) => ({ ...p, avatarDataUrl: pendingAvatar }))
    } else {
      setProfile(getPlayerProfile())
    }
    if (consumeAvatarCameraPending()) {
      if (isWsOnlineTransport()) void online.tryRestoreSession()
      setNameAvatarMode('profile')
      setShowNameAvatarModal(true)
    }
  }, [])

  // После обновления: восстановить экран (игра или лобби); в меню — только если вышли из онлайн (не сбрасывать при открытии офлайн-игры).
  // Не сбрасывать didAutoOpenLobbyRef при каждом тике с roomId — иначе waiting снова открывает лобби и перекрывает стол после «Войти в игру» / восстановления.
  useEffect(() => {
    if (online.userLeftTemporarily === true) return
    if (online.roomId) {
      hadOnlineRoomRef.current = true
      if (online.status === 'playing' || online.status === 'finished') {
        // После «Выйти»: leaveRoom может ещё не очистить roomId; handleExit ставит #menu + SUPPRESS.
        // Иначе этот эффект снова открывает стол — кажется, что «ничего не происходит».
        try {
          if (screen === 'menu' && sessionStorage.getItem(SUPPRESS_AUTO_OPEN_KEY) === '1') return
        } catch {
          /* ignore */
        }
        setScreen('game')
      } else if (
        online.status === 'waiting' &&
        screen !== 'game' &&
        !screenLobby &&
        !didAutoOpenLobbyRef.current
      ) {
        didAutoOpenLobbyRef.current = true
        try {
          sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY)
        } catch {
          /* ignore */
        }
        setScreenLobby(true)
      } else if (online.status === 'waiting' && wasLobbyUiOpen() && screen !== 'game' && !screenLobby) {
        setScreenLobby(true)
      }
      return
    }
    didAutoOpenLobbyRef.current = false
    const mayStillRestore =
      isWsOnlineTransport() && (loadOnlineSession() !== null || loadLastOnlineParty() !== null)
    if (
      online.status === 'idle' &&
      screen === 'game' &&
      !loadOnlineSession() &&
      !mayStillRestore &&
      hadOnlineRoomRef.current
    ) {
      setScreen('menu')
    }
    hadOnlineRoomRef.current = false
  }, [online.status, online.roomId, screen, online.userLeftTemporarily])

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

  // Синхронизация профиля с Supabase при входе (имя/ник жёстко привязаны к аккаунту/почте).
  // Зависимости [user?.id, user?.email ?? '']: у сессии email иногда кратко undefined → снова строка; без ?? эффект дублируется и модалка «Задайте имя…» всплывает снова.
  useEffect(() => {
    if (!user?.id) {
      newAccountGatePromptedRef.current = null
      return
    }
    const userEmailNorm = (user.email ?? '').trim().toLowerCase()
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
        const emailKey = userEmailNorm || undefined
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
          // Уже есть локальное имя (офлайн / до входа) — отправим в Supabase и не дёргаем модалку повторно
          const local = getPlayerProfile()
          const localName = local.displayName?.trim()
          if (localName && localName !== DEFAULT_DISPLAY_NAME) {
            const merged: PlayerProfile = {
              displayName: localName.slice(0, 17),
              avatarDataUrl: local.avatarDataUrl ?? null,
              profileId: local.profileId,
            }
            await saveProfileToSupabase(user.id, merged)
            savePlayerProfile(merged)
            setProfile(merged)
            return
          }
          // OAuth или вход без регистрации — имя не задано, показываем модалку «Задайте имя для этого аккаунта»
          if (newAccountGatePromptedRef.current === user.id) return
          newAccountGatePromptedRef.current = user.id
          setNameAvatarMode('new-account')
          setShowNameAvatarModal(true)
        }
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, user?.email ?? ''])

  const enableDevMode = useCallback(() => {
    sessionStorage.setItem(DEV_MODE_KEY, '1')
    setDevMode(true)
  }, [])

  /** Не автоподнимать онлайн-комнату, пока играет офлайн-партия. */
  const suppressOnlineAutoRestore = useCallback(() => {
    try {
      sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1')
    } catch {
      /* ignore */
    }
  }, [])

  const startGame = () => {
    setGameId(id => id + 1)
    setScreen('game')
  }

  /** Офлайн-стол: сразу отключить автоподъём онлайна и сбросить комнату локально. */
  const startOfflineGame = () => {
    suppressOnlineAutoRestore()
    void online.leaveRoom()
    startGame()
  }

  const handleOfflineClick = () => {
    if (hasSavedGame()) {
      setShowOfflineChoiceModal(true)
      return
    }
    if (profile.displayName === DEFAULT_DISPLAY_NAME) {
      setNameAvatarMode('first-run')
      setShowNameAvatarModal(true)
      // Пока пользователь вводит имя — подгружаем чанк игры, чтобы к моменту «Сохранить» экран открылся быстрее
      import('./ui/GameTable')
    } else {
      startOfflineGame()
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
    newAccountGatePromptedRef.current = null
    if (user?.id) saveProfileToSupabase(user.id, next)
    if (online.roomId) {
      if (online.syncMySlotDisplayName) void online.syncMySlotDisplayName(next.displayName)
      if (online.syncMySlotAvatar) void online.syncMySlotAvatar()
    }
    if (nameAvatarMode === 'first-run') {
      suppressOnlineAutoRestore()
      void online.leaveRoom()
      startGame()
    }
    if (nameAvatarMode === 'new-account') setNameAvatarMode('profile')
  }, [nameAvatarMode, user?.id, online.roomId, online.syncMySlotDisplayName, online.syncMySlotAvatar, online.leaveRoom, suppressOnlineAutoRestore])

  /** Селфи на телефоне часто перезагружает вкладку — пишем аватар и слот сразу, не дожидаясь «Сохранить». */
  const handlePhotoCaptured = useCallback((avatarDataUrl: string) => {
    const next = { ...getPlayerProfile(), avatarDataUrl };
    setProfile(next);
    if (user?.id) void saveProfileToSupabase(user.id, next);
    if (online.roomId && online.syncMySlotAvatar) void online.syncMySlotAvatar();
  }, [user?.id, online.roomId, online.syncMySlotAvatar])

  const handleExit = useCallback(() => {
    if (loadOnlineSession()) online.leaveRoom()
    /** Не трогаем localStorage партии: иначе «Домой» из офлайна стирало сохранение и пропадали «Продолжить» / модалка. Сброс только через «Начать новую» / явный выбор в модалке. */
    try {
      sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1')
    } catch {
      /* ignore */
    }
    setScreen('menu')
  }, [online])

  const canResumeOnline = loadOnlineSession() !== null || loadLastOnlineParty() !== null

  const handleResumeOffline = useCallback(() => {
    suppressOnlineAutoRestore()
    void online.leaveRoom()
    setScreen('game')
  }, [online, suppressOnlineAutoRestore])

  const handleResumeOnline = useCallback(async () => {
    setOnlineResumeMessage(null)
    try {
      sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY)
    } catch {
      /* ignore */
    }
    if (authLoading) {
      setOnlineResumeMessage('Подождите, восстанавливается сессия входа…')
      return
    }
    if (!user) {
      setOnlineResumeMessage('Войдите в аккаунт, затем снова нажмите «Продолжить онлайн-партию».')
      return
    }
    const r = await online.tryRestoreSession()
    if (r.roomFinished) {
      setRoomFinishedMessage('Партия уже завершена.')
      return
    }
    if (r.ok) {
      online.setUserLeftTemporarily?.(false)
      setScreen('game')
      return
    }
    if (r.error) setOnlineResumeMessage(r.error)
  }, [user, online, authLoading])

  const handleNewGame = () => {
    clearGameStateFromStorage()
    setGameId(id => id + 1)
  }

  const openAccountCabinet = useCallback(() => {
    setScreenLobby(false)
    setUrlJoinCode(null)
    setScreen('account')
  }, [])

  // Управление историей браузера: #menu ↔ #game и popstate
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || '#menu').trim().toLowerCase()
      if (h === '#menu') {
        try { sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1') } catch { /* ignore */ }
        setScreen('menu')
      } else if (h === '#game') {
        try { sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY) } catch { /* ignore */ }
        setScreen('game')
      } else if (h === '#training') {
        setScreen('training')
      } else if (isAccountRouteHash(h)) {
        setScreen('account')
      }
    }
    window.addEventListener('popstate', applyHash)
    return () => window.removeEventListener('popstate', applyHash)
  }, [])
  useEffect(() => {
    const targetHash =
      screen === 'game'
        ? '#game'
        : screen === 'training'
          ? '#training'
          : screen === 'account'
            ? ACCOUNT_ROUTE_HASH
            : '#menu'
    if (window.location.hash !== targetHash) {
      history.pushState({ screen }, '', targetHash)
    }
    /* Не ставить SUPPRESS на каждый показ меню: иначе после «Выйти» флаг остаётся при входе в «Онлайн»
     * и блокирует setScreen('game') при roomId + playing (кажется, что «нельзя зайти в новую комнату»). */
  }, [screen])

  return (
    <>
      {screen === 'menu' && !screenLobby && (
        <MainMenuScreen
          displayName={profile.displayName}
          avatarDataUrl={profile.avatarDataUrl}
          userEmail={user?.email ?? null}
          devMode={devMode}
          canResumeOnline={canResumeOnline}
          hasSavedOffline={hasSavedGame()}
          lastPartyCode={(() => {
            void online.lastPartyHintVersion
            return loadLastOnlineParty()?.code ?? null
          })()}
          onlineResumeMessage={onlineResumeMessage}
          onTitleDevMode={enableDevMode}
          onOpenAccount={openAccountCabinet}
          onResumeOnline={() => { void handleResumeOnline() }}
          onOpenOnline={() => {
            try {
              sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY)
            } catch {
              /* ignore */
            }
            setScreenLobby(true)
          }}
          onResumeOffline={() => { void handleResumeOffline() }}
          onOfflinePlay={handleOfflineClick}
          onTraining={() => setScreen('training')}
          onEditProfile={() => {
            setNameAvatarMode('profile')
            setShowNameAvatarModal(true)
          }}
          onOpenRating={() => setShowRatingModal(true)}
          onOpenHistory={() => setShowHistoryModal(true)}
          onSignIn={() => {
            setAuthMode('login')
            setShowAuthModal(true)
          }}
          onSignOut={() => signOut()}
        />
      )}
      {showOfflineChoiceModal && (
        <OfflineResumeChoiceModal
          onCancel={() => setShowOfflineChoiceModal(false)}
          onContinue={() => {
            setShowOfflineChoiceModal(false)
            suppressOnlineAutoRestore()
            if (online.status !== 'idle') {
              online.leaveRoom().finally(() => setScreen('game'))
            } else {
              setScreen('game')
            }
          }}
          onStartNew={() => {
            setShowOfflineChoiceModal(false)
            clearGameStateFromStorage()
            if (profile.displayName === DEFAULT_DISPLAY_NAME) {
              setNameAvatarMode('first-run')
              setShowNameAvatarModal(true)
              import('./ui/GameTable')
            } else {
              const startNew = () => {
                suppressOnlineAutoRestore()
                setGameId((id) => id + 1)
                setScreen('game')
              }
              if (online.status !== 'idle') online.leaveRoom().finally(startNew)
              else startNew()
            }
          }}
        />
      )}
      {screen === 'training' && (
        <TrainingScreen onBack={() => setScreen('menu')} profile={profile} />
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
          onGoToOffline={() => {
            setShowHistoryModal(false)
            if (online.status !== 'idle') {
              online.leaveRoom().finally(() => setScreen('game'))
            } else {
              setScreen('game')
            }
          }}
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
      {screen === 'account' && (
        <AccountLkPage
          displayName={profile.displayName}
          avatarDataUrl={profile.avatarDataUrl}
          onBack={() => setScreen('menu')}
          onEditProfile={() => {
            setNameAvatarMode('profile')
            setShowNameAvatarModal(true)
          }}
          onOpenRating={() => setShowRatingModal(true)}
          onOpenHistory={() => setShowHistoryModal(true)}
          onSignIn={() => {
            setAuthMode('login')
            setShowAuthModal(true)
          }}
        />
      )}
      {screenLobby && (
        <LobbyScreen
          onBack={() => { setScreenLobby(false); setUrlJoinCode(null) }}
          playerName={profile.displayName}
          onEditProfile={() => { setNameAvatarMode('profile'); setShowNameAvatarModal(true) }}
          onOpenAccount={openAccountCabinet}
          initialJoinCode={urlJoinCode ?? undefined}
          lanGuestInvite={Boolean(urlJoinCode)}
          lanAutoJoinFromLink={urlLanAutojoin}
          onGoToGame={() => {
            try {
              sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY)
            } catch {
              /* ignore */
            }
            markLobbyUiOpen(false)
            setScreenLobby(false);
            setUrlJoinCode(null);
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
          onPhotoCaptured={handlePhotoCaptured}
          onCancel={nameAvatarMode === 'profile' ? () => setShowNameAvatarModal(false) : undefined}
        />
      )}
      {/* Только на экране игры: порталы итогов раздачи иначе попадают в document.body и видны поверх меню/лобби */}
      {screen === 'game' && gameId >= 1 && (
        <div style={{ position: 'fixed', inset: 0, overflow: 'hidden' }}>
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
              onOpenProfileModal={() => { setNameAvatarMode('profile'); setShowNameAvatarModal(true) }}
              onSaveAvatar={(avatarDataUrl) => {
                handleNameAvatarConfirm({ displayName: profile.displayName, avatarDataUrl });
              }}
              onPhotoCaptured={handlePhotoCaptured}
              onSaveDisplayName={(displayName) => {
                handleNameAvatarConfirm({ displayName, avatarDataUrl: profile.avatarDataUrl });
              }}
            />
          </Suspense>
          <MobileOverlapHint />
        </div>
      )}
    </>
  )
}

export default App
