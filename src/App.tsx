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
import { canShowOnlineContinue } from './lib/onlineContinue'
import { isWsOnlineTransport } from './lib/onlineTransport'
import {
  clearNameAvatarModalOpen,
  consumePendingAvatarDraft,
  markNameAvatarModalOpen,
  mergeStoredAvatarIntoProfile,
  peekAvatarCameraPending,
  peekNameAvatarModalOpen,
  type NameAvatarModalResumeMode,
} from './lib/profileAvatarSave'
import MobileOverlapHint from './ui/MobileOverlapHint'
import { HistoryModal } from './ui/HistoryModal'
import { NameAvatarModal } from './ui/NameAvatarModal'
import RulesScreen from './ui/RulesScreen'
import { RatingModal } from './ui/RatingModal'
import { AuthModal } from './ui/AuthModal'
import { CosmicCockpit, CosmicPhysButton } from './ui/CosmicCockpit'
import { applyLanJoinParamsFromUrl } from './lib/lanJoinLink'
import { LobbyScreen } from './ui/LobbyScreen'
import { OfflinePlayerCountModal, type OfflinePlayerCount } from './ui/OfflinePlayerCountModal'
import { AccountLkPage, type AccountLkFocus } from './ui/AccountLkPage'
import { MainMenuScreen } from './ui/MainMenuScreen'
import { ACCOUNT_ROUTE_HASH, isAccountRouteHash } from './lib/accountRoute'
import { ONLINE_ROUTE_HASH, isOnlineRouteHash } from './lib/onlineRoute'
import { SUPPORT_ROUTE_HASH, isSupportRouteHash } from './lib/supportRoute'
import { SupportDonatePage } from './ui/SupportDonatePage'
import { LeaderboardPage } from './ui/LeaderboardPage'
import { RATING_ROUTE_HASH, isRatingRouteHash } from './lib/ratingRoute'

/** Ленивая загрузка экрана игры: уменьшает начальный бандл и ускоряет первый показ меню; экран игры подгружается при переходе. */
const GameTable = lazy(() => import('./ui/GameTable'))

const DEV_MODE_KEY = 'updown-devMode'
const DEFAULT_DISPLAY_NAME = 'Вы'

type AppScreen = 'menu' | 'game' | 'rules' | 'account' | 'online' | 'support' | 'rating'

function readInitialScreen(): AppScreen {
  if (typeof window === 'undefined') return 'menu'
  const h = (window.location.hash || '#menu').trim().toLowerCase()
  if (h === '#game') return 'game'
  if (h === '#rules' || h === '#training') return 'rules'
  if (isAccountRouteHash(h)) return 'account'
  if (isSupportRouteHash(h)) return 'support'
  if (isRatingRouteHash(h)) return 'rating'
  if (isOnlineRouteHash(h)) return 'online'
  const { code } = applyLanJoinParamsFromUrl()
  if (code) return 'online'
  return 'menu'
}

function App() {
  const { user, signOut, configured, loading: authLoading } = useAuth()
  const online = useOnlineGame()
  // Не открывать стол по одному лишь sessionStorage: до applyRoomData roomId пустой —
  // GameTable успевал поднять офлайн-партию с ИИ и перекрывал лобби (fixed без z-index).
  // После F5 с #game не затирать хеш в меню: начальный экран совпадает с location.hash.
  const [screen, setScreen] = useState<AppScreen>(() => readInitialScreen())
  const didAutoOpenLobbyRef = useRef(false)
  const hadOnlineRoomRef = useRef(false)
  /** Уже показывали «Задайте имя для этого аккаунта» этому user.id в сессии — не дёргать setShow снова при повторном срабатывании эффекта. */
  const newAccountGatePromptedRef = useRef<string | null>(null)
  const [gameId, setGameId] = useState(1)
  const [offlinePlayerCount, setOfflinePlayerCount] = useState<OfflinePlayerCount>(4)
  const [showPlayerCountModal, setShowPlayerCountModal] = useState(false)
  /** После выбора 3/4: старт с меню или новая партия уже на экране игры. */
  const playerCountThenRef = useRef<'menu' | 'in-game' | null>(null)
  const [devMode, setDevMode] = useState(() => typeof sessionStorage !== 'undefined' && sessionStorage.getItem(DEV_MODE_KEY) === '1')
  const [profile, setProfile] = useState<PlayerProfile>(() => getPlayerProfile())
  const [nameAvatarMode, setNameAvatarMode] = useState<NameAvatarModalResumeMode>(
    () => peekNameAvatarModalOpen() ?? 'profile',
  )
  const [showNameAvatarModal, setShowNameAvatarModal] = useState(
    () => peekNameAvatarModalOpen() != null || peekAvatarCameraPending(),
  )

  const openNameAvatarModal = useCallback((mode: NameAvatarModalResumeMode) => {
    markNameAvatarModalOpen(mode)
    setNameAvatarMode(mode)
    setShowNameAvatarModal(true)
  }, [])

  const closeNameAvatarModal = useCallback(() => {
    clearNameAvatarModalOpen()
    setShowNameAvatarModal(false)
  }, [])
  const [showRatingModal, setShowRatingModal] = useState(false)
  const [showHistoryModal, setShowHistoryModal] = useState(false)
  const [accountFocus, setAccountFocus] = useState<AccountLkFocus>(null)
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login')
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
    const resumeMode = peekNameAvatarModalOpen()
    const cameraPending = peekAvatarCameraPending()
    if (resumeMode || cameraPending) {
      if (isWsOnlineTransport()) void online.tryRestoreSession()
      const mode = resumeMode ?? 'profile'
      markNameAvatarModalOpen(mode)
      setNameAvatarMode(mode)
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
        screen !== 'online' &&
        !didAutoOpenLobbyRef.current
      ) {
        didAutoOpenLobbyRef.current = true
        try {
          sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY)
        } catch {
          /* ignore */
        }
        setScreen('online')
      } else if (online.status === 'waiting' && wasLobbyUiOpen() && screen !== 'game' && screen !== 'online') {
        setScreen('online')
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
          openNameAvatarModal('new-account')
        }
      }
    })()
    return () => { cancelled = true }
  }, [user?.id, user?.email ?? '', openNameAvatarModal])

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

  const beginOfflineAfterPlayerCount = (count: OfflinePlayerCount) => {
    setOfflinePlayerCount(count)
    setShowPlayerCountModal(false)
    const then = playerCountThenRef.current
    playerCountThenRef.current = null
    clearGameStateFromStorage()
    if (then === 'in-game') {
      suppressOnlineAutoRestore()
      void online.leaveRoom()
      setGameId((id) => id + 1)
      setScreen('game')
      return
    }
    startOfflineGame()
  }

  const requestOfflinePlayerCount = (then: 'menu' | 'in-game' = 'menu') => {
    playerCountThenRef.current = then
    setShowPlayerCountModal(true)
  }

  /** «Новая партия» с меню — без повторного «продолжить или новая»; продолжение только через onResumeOffline. */
  const handleOfflineClick = () => {
    if (profile.displayName === DEFAULT_DISPLAY_NAME) {
      openNameAvatarModal('first-run')
      import('./ui/GameTable')
    } else {
      requestOfflinePlayerCount('menu')
    }
  }

  const handleNameAvatarConfirm = useCallback((data: { displayName: string; avatarDataUrl?: string | null; avatarBgColor?: string | null }) => {
    const current = getPlayerProfile()
    const next: PlayerProfile = {
      displayName: data.displayName,
      avatarDataUrl: data.avatarDataUrl ?? null,
      avatarBgColor: data.avatarBgColor ?? current.avatarBgColor ?? null,
      profileId: current.profileId,
    }
    savePlayerProfile(next)
    setProfile(next)
    closeNameAvatarModal()
    newAccountGatePromptedRef.current = null
    if (user?.id) saveProfileToSupabase(user.id, next)
    if (online.roomId) {
      if (online.syncMySlotDisplayName) void online.syncMySlotDisplayName(next.displayName)
      if (online.syncMySlotAvatar) void online.syncMySlotAvatar()
    }
    if (nameAvatarMode === 'first-run') {
      requestOfflinePlayerCount('menu')
    }
    if (nameAvatarMode === 'new-account') setNameAvatarMode('profile')
  }, [nameAvatarMode, user?.id, online.roomId, online.syncMySlotDisplayName, online.syncMySlotAvatar, online.leaveRoom, suppressOnlineAutoRestore, closeNameAvatarModal])

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

  /** Пересчёт при leave / forget: lastPartyHintVersion и auth. */
  const canResumeOnline = (() => {
    void online.lastPartyHintVersion
    return canShowOnlineContinue({ loggedIn: Boolean(user) })
  })()

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
    if (authLoading && !isWsOnlineTransport()) {
      setOnlineResumeMessage('Подождите, восстанавливается сессия входа…')
      return
    }
    if (!isWsOnlineTransport() && !user) {
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
    requestOfflinePlayerCount('in-game')
  }

  const openAccountCabinet = useCallback((focus?: AccountLkFocus) => {
    setUrlJoinCode(null)
    // Ignore accidental event args from onClick={openAccountCabinet}
    const next: AccountLkFocus =
      focus === 'rating' || focus === 'matches' ? focus : null
    setAccountFocus(next)
    setScreen('account')
  }, [])

  const openOnlinePage = useCallback(() => {
    try {
      sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY)
    } catch {
      /* ignore */
    }
    setScreen('online')
  }, [])

  const openSupportPage = useCallback(() => {
    setUrlJoinCode(null)
    setScreen('support')
  }, [])

  const openRatingPage = useCallback(() => {
    setUrlJoinCode(null)
    setScreen('rating')
  }, [])

  // Управление историей браузера: #menu ↔ #game ↔ #online и popstate
  useEffect(() => {
    const applyHash = () => {
      const h = (window.location.hash || '#menu').trim().toLowerCase()
      if (h === '#menu') {
        try { sessionStorage.setItem(SUPPRESS_AUTO_OPEN_KEY, '1') } catch { /* ignore */ }
        setScreen('menu')
        setUrlJoinCode(null)
      } else if (h === '#game') {
        try { sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY) } catch { /* ignore */ }
        setScreen('game')
      } else if (h === '#rules' || h === '#training') {
        setScreen('rules')
      } else if (isAccountRouteHash(h)) {
        setScreen('account')
      } else if (isSupportRouteHash(h)) {
        setScreen('support')
      } else if (isRatingRouteHash(h)) {
        setScreen('rating')
      } else if (isOnlineRouteHash(h)) {
        try { sessionStorage.removeItem(SUPPRESS_AUTO_OPEN_KEY) } catch { /* ignore */ }
        setScreen('online')
      }
    }
    window.addEventListener('popstate', applyHash)
    window.addEventListener('hashchange', applyHash)
    return () => {
      window.removeEventListener('popstate', applyHash)
      window.removeEventListener('hashchange', applyHash)
    }
  }, [])
  useEffect(() => {
    const targetHash =
      screen === 'game'
        ? '#game'
        : screen === 'rules'
          ? '#rules'
          : screen === 'account'
            ? ACCOUNT_ROUTE_HASH
            : screen === 'support'
              ? SUPPORT_ROUTE_HASH
              : screen === 'rating'
                ? RATING_ROUTE_HASH
                : screen === 'online'
                  ? ONLINE_ROUTE_HASH
                  : '#menu'
    if (window.location.hash !== targetHash) {
      history.pushState({ screen }, '', targetHash)
    }
    /* Не ставить SUPPRESS на каждый показ меню: иначе после «Выйти» флаг остаётся при входе в «Онлайн»
     * и блокирует setScreen('game') при roomId + playing (кажется, что «нельзя зайти в новую комнату»). */
  }, [screen])

  return (
    <>
      {screen === 'menu' && (
        <MainMenuScreen
          displayName={profile.displayName}
          avatarDataUrl={profile.avatarDataUrl}
          avatarBgColor={profile.avatarBgColor}
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
          onOpenSupport={openSupportPage}
          onOpenRating={openRatingPage}
          onResumeOnline={() => { void handleResumeOnline() }}
          onOpenOnline={openOnlinePage}
          onResumeOffline={() => { void handleResumeOffline() }}
          onOfflinePlay={handleOfflineClick}
          onOpenRules={() => setScreen('rules')}
        />
      )}
      {showPlayerCountModal && (
        <OfflinePlayerCountModal
          onCancel={() => {
            setShowPlayerCountModal(false)
            playerCountThenRef.current = null
          }}
          onChoose={beginOfflineAfterPlayerCount}
        />
      )}
      {screen === 'rules' && <RulesScreen onBack={() => setScreen('menu')} />}
      {showRatingModal && (
        <RatingModal
          onClose={() => setShowRatingModal(false)}
          playerAvatarDataUrl={profile.avatarDataUrl}
          onOpenCabinet={() => {
            setShowRatingModal(false)
            openAccountCabinet('rating')
          }}
        />
      )}
      {showHistoryModal && (
        <HistoryModal
          onClose={() => setShowHistoryModal(false)}
          onOpenCabinet={() => {
            setShowHistoryModal(false)
            openAccountCabinet('matches')
          }}
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
        <AuthCelebrateDialog
          titleId="registration-success-title"
          title="Регистрация прошла успешно!"
          body="Добро пожаловать в Up&Down. Теперь вы можете играть офлайн или войти на другом устройстве."
          onClose={() => setShowRegistrationSuccessModal(false)}
        />
      )}
      {showOAuthSuccessModal && (
        <AuthCelebrateDialog
          titleId="oauth-success-title"
          title="Всё супер!"
          body="Вы успешно вошли в аккаунт. Добро пожаловать в Up&Down!"
          onClose={() => setShowOAuthSuccessModal(false)}
        />
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
          focusSection={accountFocus}
          onBack={() => {
            setAccountFocus(null)
            setScreen('menu')
          }}
          onEditProfile={() => {
            openNameAvatarModal('profile')
          }}
          onContinueOffline={() => {
            void handleResumeOffline()
          }}
          onSignIn={() => {
            setAuthMode('login')
            setShowAuthModal(true)
          }}
          onJoinUnfinished={(code) => {
            setUrlJoinCode(code)
            openOnlinePage()
          }}
          onOpenSupport={openSupportPage}
          onOpenRating={openRatingPage}
          onOpenPremium={() => {
            /* TODO: экран «Подписка / Премиум» */
            window.location.hash = '#premium';
          }}
        />
      )}
      {screen === 'support' && <SupportDonatePage onBack={() => setScreen('menu')} />}
      {screen === 'rating' && (
        <LeaderboardPage
          onBack={() => setScreen('menu')}
          onSignIn={() => {
            setAuthMode('login')
            setShowAuthModal(true)
          }}
          onOpenAccount={() => openAccountCabinet('rating')}
        />
      )}
      {screen === 'online' && (
        <LobbyScreen
          onBack={() => { setUrlJoinCode(null); setScreen('menu') }}
          playerName={profile.displayName}
          onEditProfile={() => openNameAvatarModal('profile')}
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
            setUrlJoinCode(null);
            setScreen('game');
          }}
        />
      )}
      {showNameAvatarModal && (
        <NameAvatarModal
          initialDisplayName={nameAvatarMode === 'new-account' ? (user?.email?.split('@')[0] ?? '') : profile.displayName}
          initialAvatarDataUrl={profile.avatarDataUrl}
          initialAvatarBgColor={profile.avatarBgColor}
          resumeMode={nameAvatarMode}
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
          onCancel={nameAvatarMode === 'profile' ? closeNameAvatarModal : undefined}
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
              offlinePlayerCount={offlinePlayerCount}
              playerDisplayName={profile.displayName}
              playerAvatarDataUrl={profile.avatarDataUrl}
              playerAvatarBgColor={profile.avatarBgColor}
              onExit={handleExit}
              onNewGame={handleNewGame}
              onOpenProfileModal={() => openNameAvatarModal('profile')}
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

function AuthCelebrateDialog({
  titleId,
  title,
  body,
  onClose,
}: {
  titleId: string
  title: string
  body: string
  onClose: () => void
}) {
  return (
    <div
      className="lk-modal"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="lk-modal__panel lk-modal__panel--celebrate" onClick={(e) => e.stopPropagation()}>
        <CosmicCockpit dense className="lk-modal__cockpit">
          <h2 id={titleId} className="lk-modal__title lk-modal__title--center">
            {title}
          </h2>
          <span className="lk-modal__celebrate-rift" aria-hidden>
            <i />
            <i />
            <i />
          </span>
          <p className="lk-modal__success-text cosmic-iridescent-text">{body}</p>
          <span className="lk-modal__celebrate-lamps" aria-hidden>
            <span className="lk-modal__celebrate-lamp lk-modal__celebrate-lamp--cyan" />
            <span className="lk-modal__celebrate-lamp lk-modal__celebrate-lamp--violet" />
            <span className="lk-modal__celebrate-lamp lk-modal__celebrate-lamp--pink" />
          </span>
          <div className="lk-modal__celebrate-actions">
            <CosmicPhysButton onClick={onClose}>Понятно</CosmicPhysButton>
          </div>
        </CosmicCockpit>
      </div>
    </div>
  )
}

export default App
