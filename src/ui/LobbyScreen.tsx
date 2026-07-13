/**
 * Экран лобби для онлайн-игры. Создание комнаты, присоединение по коду, ожидание и старт.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineGame } from '../contexts/useOnlineGame';
import { loadLastOnlineParty } from '../lib/lastOnlineParty';
import { peekRoomByCode } from '../lib/onlineGameApi';
import { getOnlinePlayerId } from '../lib/deviceId';
import { hostPanelUrlFromWsUrl, isLanGuestInvite } from '../lib/lanJoinLink';
import { canStartOnlineRoom } from '../lib/onlineHost';
import { getWsUrl, isWsOnlineTransport, isWsOnlineConfigured } from '../lib/onlineTransport';
import { settlementModeBadgeLabel, type RoomPeekResult } from '../lib/roomSettlement';
import { PUBLIC_HALL_ENABLED } from '../lib/productFlags';
import { ONLINE_LOBBY_MASCOT_URL } from '../lib/lobbyAssets';
import { LobbyCapsuleButton, LobbyCreatePanel, LobbyLastPartyToggle, LobbyBackButton, LobbyPasteCodeButton } from './LobbyEntryActions';
import { OnlineHallScreen } from './OnlineHallScreen';

export interface LobbyScreenProps {
  onBack: () => void;
  playerName: string;
  onEditProfile?: () => void;
  onOpenAccount?: () => void;
  onGoToGame?: () => void;
  /** Код комнаты из URL (?code=XXX) — подставляется в поле «Присоединиться» */
  initialJoinCode?: string;
  /** Ссылка с панели хоста — упрощённый экран входа */
  lanGuestInvite?: boolean;
  /** Автовход по ссылке (?autojoin=1) */
  lanAutoJoinFromLink?: boolean;
}

function lobbyBtnClass(
  variant: 'primary' | 'secondary' | 'ghost' | 'danger',
  extra?: string,
): string {
  return ['lobby-btn', `lobby-btn--${variant}`, extra].filter(Boolean).join(' ');
}

/** Верхняя граница ожидания createRoom — иначе кнопка «Создание…» без ответа при зависшем fetch. */
const LOBBY_CREATE_TOTAL_MS = 52_000;
/** «Выход из прошлой комнаты» + join — один лимит, иначе спиннер висит на leaveRoom вне Promise.race. */
const LOBBY_JOIN_TOTAL_MS = 68_000;
const CODE_LENGTH = 6;

function normalizeJoinCode(raw: string): string {
  return raw.replace(/\s+/g, '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function LobbyScreen({
  onBack,
  playerName,
  onEditProfile,
  onOpenAccount,
  onGoToGame,
  initialJoinCode,
  lanGuestInvite,
  lanAutoJoinFromLink,
}: LobbyScreenProps) {
  const { user } = useAuth();
  const {
    status,
    code: roomCode,
    roomId,
    myServerIndex,
    playerSlots,
    error,
    createRoom,
    joinRoom,
    recoverJoinIfAlreadyInRoom,
    leaveRoom,
    clearError,
    syncMySlotDisplayName,
    refreshRoom,
    tryRestoreSession,
    forgetLastOnlineParty,
    lastPartyHintVersion,
    stopAutoRestoreForCurrentRoom,
    settlementMode,
    buyIn,
    startGame,
  } = useOnlineGame();

  const [createBankRoom, setCreateBankRoom] = useState(false);
  const [createPublicRoom, setCreatePublicRoom] = useState(() => isWsOnlineConfigured());
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [roomPeek, setRoomPeek] = useState<RoomPeekResult | null>(null);
  const [showHall, setShowHall] = useState(false);
  const [autoJoining, setAutoJoining] = useState(false);
  const autoJoinStartedRef = useRef(false);

  const [joinCode, setJoinCode] = useState(initialJoinCode ?? '');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [resumeLastBusy, setResumeLastBusy] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leftPlayerToast, setLeftPlayerToast] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [stopRememberBusy, setStopRememberBusy] = useState(false);
  const [startingGame, setStartingGame] = useState(false);
  const [showLastPartyPanel, setShowLastPartyPanel] = useState(false);
  const [pasteJoinOk, setPasteJoinOk] = useState(false);
  const prevSlotsRef = useRef<typeof playerSlots>([]);
  /** Актуальные слоты для отложенной проверки «ушёл ли игрок» (иначе гонка Realtime/опроса даёт ложный тост). */
  const playerSlotsRef = useRef<typeof playerSlots>(playerSlots);
  playerSlotsRef.current = playerSlots;

  // Когда игра началась — перейти на экран игры
  useEffect(() => {
    if (status === 'playing' && onGoToGame) onGoToGame();
  }, [status, onGoToGame]);

  const isCaptain = canStartOnlineRoom({ myServerIndex });
  const humanSlots = playerSlots.filter((s) => s.userId != null && s.userId !== '');
  const captainSlot = playerSlots.find((s) => s.slotIndex === 0 && s.userId);
  const inRoom = status === 'waiting' && roomId;

  const handleStartGameFromLobby = async () => {
    if (!isCaptain || startingGame) return;
    setStartingGame(true);
    try {
      const ok = await startGame();
      if (ok && onGoToGame) onGoToGame();
    } finally {
      setStartingGame(false);
    }
  };

  /** Вошли из зала — показать экран «Комната», а не список столов поверх. */
  useEffect(() => {
    if (inRoom) setShowHall(false);
  }, [inRoom]);

  /** Возврат на вкладку / сеть: подтянуть слоты с сервера (Realtime на мобилке в одном Wi‑Fi часто отстаёт). */
  useEffect(() => {
    if (!inRoom) return;
    const onVisibility = () => {
      if (document.visibilityState === 'visible') void refreshRoom();
    };
    const onOnline = () => {
      void refreshRoom();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [inRoom, refreshRoom]);

  /** Синхронизация имени в слот для всех игроков (не только хост). Дебаунс — не спамить WS при наборе. */
  useEffect(() => {
    if (!inRoom || !playerName.trim() || !syncMySlotDisplayName) return;
    const t = window.setTimeout(() => {
      void syncMySlotDisplayName(playerName);
    }, 600);
    return () => clearTimeout(t);
  }, [inRoom, playerName, syncMySlotDisplayName]);

  useEffect(() => {
    if (!inRoom || playerSlots.length >= prevSlotsRef.current.length) {
      prevSlotsRef.current = playerSlots;
      return;
    }
    const prev = prevSlotsRef.current;
    const gone = prev.find((p) => p.userId && !playerSlots.some((s) => s.userId === p.userId));
    prevSlotsRef.current = playerSlots;
    if (!gone?.userId || !gone.displayName) return;
    const goneUserId = gone.userId;
    const goneName = gone.displayName;
    const t = window.setTimeout(() => {
      const latest = playerSlotsRef.current;
      if (!latest.some((s) => s.userId === goneUserId)) {
        setLeftPlayerToast(goneName);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [inRoom, playerSlots]);

  useEffect(() => {
    if (!leftPlayerToast) return;
    const t = setTimeout(() => setLeftPlayerToast(null), 4000);
    return () => clearTimeout(t);
  }, [leftPlayerToast]);

  useEffect(() => {
    const code = joinCode.trim();
    if (code.length < 4) {
      setRoomPeek(null);
      return;
    }
    let cancelled = false;
    const t = window.setTimeout(() => {
      void peekRoomByCode(code).then((r) => {
        if (!cancelled) setRoomPeek(r.ok ? r : null);
      });
    }, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [joinCode]);

  const shortLabel = user?.email
    ? user.email.replace(/@.*$/, '').slice(-8)
    : undefined;

  const lanWs = isWsOnlineConfigured();
  const guestFromHostLink =
    lanGuestInvite === true || (Boolean(initialJoinCode) && isLanGuestInvite());
  const tryAutoJoin = lanAutoJoinFromLink === true;
  const isHostPcBrowser =
    typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const hostPanelUrl =
    lanWs && isHostPcBrowser && !guestFromHostLink ? hostPanelUrlFromWsUrl(getWsUrl() ?? '') : null;
  const playerId = getOnlinePlayerId(user?.id);

  const handleCreateRoom = async () => {
    if (!lanWs && !user?.id) {
      setJoinError('Войдите в аккаунт, чтобы создать комнату.');
      return;
    }
    if (isWsOnlineTransport() && !isWsOnlineConfigured()) {
      setJoinError('Задайте VITE_WS_URL (например ws://192.168.1.5:3001) и перезапустите dev.');
      return;
    }
    const name = playerName.trim();
    if (!name) {
      setJoinError('Укажите имя в профиле перед созданием комнаты.');
      return;
    }
    clearError();
    setJoinError(null);
    setCreating(true);
    try {
      type LobbyWall = { __lobbyWall: true };
      const r = await Promise.race([
        (async () => {
          await leaveRoom();
          return createRoom(playerId, name, shortLabel, {
            settlementMode: createBankRoom ? 'prize_pool' : 'accuracy_bonus',
            roomKind: createPublicRoom ? 'public' : 'private',
          });
        })(),
        new Promise<LobbyWall>((resolve) => {
          window.setTimeout(() => resolve({ __lobbyWall: true }), LOBBY_CREATE_TOTAL_MS);
        }),
      ]);
      if (r && typeof r === 'object' && '__lobbyWall' in r && r.__lobbyWall) {
        setJoinError(
          'Слишком долгое ожидание (в том числе выход из прошлой комнаты). Проверьте сеть и VPN и нажмите «Создать» снова.',
        );
      } else {
        const cr = r as Awaited<ReturnType<typeof createRoom>>;
        if (!cr.ok) setJoinError(cr.error ?? 'Не удалось создать комнату.');
        else setShowCreatePanel(false);
      }
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Ошибка при создании комнаты.');
    } finally {
      setCreating(false);
    }
  };

  const [joinError, setJoinError] = useState<string | null>(null);

  useEffect(() => {
    if (!pasteJoinOk) return;
    const t = window.setTimeout(() => setPasteJoinOk(false), 1600);
    return () => window.clearTimeout(t);
  }, [pasteJoinOk]);

  const handlePasteJoinCode = async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) {
        setJoinError('Вставка недоступна в этом браузере.');
        return;
      }
      const text = await navigator.clipboard.readText();
      const cleaned = normalizeJoinCode(text);
      if (!cleaned) {
        setJoinError('В буфере нет подходящего кода комнаты.');
        return;
      }
      setJoinCode(cleaned);
      setJoinError(null);
      setPasteJoinOk(true);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    } catch {
      setJoinError('Не удалось вставить из буфера. Разрешите доступ к буферу обмена.');
    }
  };

  const runJoinRoom = async () => {
    const typedCode = joinCode.trim();
    if (!typedCode) {
      setJoinError('Введите код комнаты.');
      return;
    }
    if (!lanWs && !user?.id) {
      setJoinError('Войдите в аккаунт, чтобы присоединиться к комнате.');
      return;
    }
    if (isWsOnlineTransport() && !isWsOnlineConfigured()) {
      setJoinError('Задайте VITE_WS_URL и перезапустите dev.');
      return;
    }
    if (!playerName.trim()) {
      setJoinError('Укажите имя в профиле перед входом в комнату.');
      return;
    }
    clearError();
    setJoinError(null);
    setJoining(true);
    try {
      type LobbyWall = { __lobbyWall: true };
      type JoinOutcome = Awaited<ReturnType<typeof joinRoom>>;
      const targetCode = typedCode.toUpperCase();
      const currentCode = (roomCode ?? '').trim().toUpperCase();
      const alreadyInThisRoom = !!(roomId && currentCode && targetCode === currentCode);

      let r: JoinOutcome | LobbyWall = await Promise.race([
        (async () => {
          if (alreadyInThisRoom) {
            const back = await recoverJoinIfAlreadyInRoom(typedCode);
            if (back) return { ok: true as const };
          }
          if (!alreadyInThisRoom && roomId) {
            await leaveRoom();
          }
          const recovered = await recoverJoinIfAlreadyInRoom(typedCode);
          if (recovered) return { ok: true as const };
          return joinRoom(typedCode, playerId, playerName.trim(), shortLabel);
        })(),
        new Promise<LobbyWall>((resolve) => {
          window.setTimeout(() => resolve({ __lobbyWall: true }), LOBBY_JOIN_TOTAL_MS);
        }),
      ]);
      if (r && typeof r === 'object' && '__lobbyWall' in r && r.__lobbyWall) {
        setJoinError(
          'Слишком долгое ожидание (в том числе выход из прошлой комнаты). Проверьте интернет и нажмите «Присоединиться» снова.',
        );
      } else {
        let jr = r as JoinOutcome;
        if (!jr.ok) {
          const recovered = await recoverJoinIfAlreadyInRoom(typedCode);
          if (recovered) {
            jr = { ok: true };
          } else {
            setJoinError(jr.error ?? 'Не удалось присоединиться. Проверьте код и подключение.');
          }
        }
        if (jr.ok && onGoToGame && typeof window !== 'undefined' && window.innerWidth <= 1024) {
          onGoToGame();
        }
      }
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : String(e) || 'Ошибка соединения. Проверьте интернет.');
    } finally {
      setJoining(false);
      setAutoJoining(false);
    }
  };

  useEffect(() => {
    if (!guestFromHostLink || !tryAutoJoin || !initialJoinCode?.trim()) return;
    if (!playerName.trim() || inRoom || autoJoinStartedRef.current) return;
    autoJoinStartedRef.current = true;
    setAutoJoining(true);
    const t = window.setTimeout(() => {
      void runJoinRoom();
    }, 700);
    return () => window.clearTimeout(t);
  }, [guestFromHostLink, tryAutoJoin, initialJoinCode, playerName, inRoom]);

  const handleResumeLastFromLobby = async () => {
    setResumeLastBusy(true);
    setJoinError(null);
    clearError();
    try {
      const r = await tryRestoreSession();
      if (r.roomFinished) {
        setJoinError('Эта партия уже завершена.');
        return;
      }
      if (!r.ok && r.error) setJoinError(r.error);
      if (r.ok && onGoToGame) onGoToGame();
    } finally {
      setResumeLastBusy(false);
    }
  };

  const handleJoinRoom = () => void runJoinRoom();

  const handleLeaveRoomClick = () => setShowLeaveConfirm(true);

  const handleLeaveRoomConfirm = async () => {
    setShowLeaveConfirm(false);
    await leaveRoom();
  };

  const handleStopRememberThisRoom = async () => {
    if (stopRememberBusy) return;
    setStopRememberBusy(true);
    try {
      await stopAutoRestoreForCurrentRoom();
    } finally {
      setStopRememberBusy(false);
    }
  };

  /** При «Поделиться» и «Скопировать код» отправляем только код комнаты, без ссылки. */
  const handleShare = async () => {
    if (!roomCode) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Up&Down — код комнаты',
          text: roomCode,
        });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') copyCodeToClipboard();
      }
    } else {
      copyCodeToClipboard();
    }
  };

  function copyCodeToClipboard() {
    if (!roomCode) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(roomCode).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      });
    }
  }

  if (!user && !lanWs) {
    return (
      <div className="lobby-screen">
        <div className="lobby-screen__stack">
        <h1 className="lobby-screen__title">Онлайн-лобби</h1>
        <p className="lobby-screen__muted" style={{ maxWidth: 320, fontSize: 14 }}>
          Войдите в аккаунт, чтобы создавать комнаты и играть онлайн. Либо включите LAN: VITE_ONLINE_TRANSPORT=ws и VITE_WS_URL.
        </p>
        <button type="button" className={lobbyBtnClass('ghost')} onClick={onBack}>
          ← Назад в меню
        </button>
        </div>
      </div>
    );
  }

  if (showHall && PUBLIC_HALL_ENABLED && !inRoom) {
    return (
      <OnlineHallScreen
        onBack={() => setShowHall(false)}
        playerName={playerName}
        onGoToGame={onGoToGame}
        roomCode={roomCode}
        roomId={roomId}
        recoverJoinIfAlreadyInRoom={recoverJoinIfAlreadyInRoom}
        leaveRoom={leaveRoom}
      />
    );
  }

  if (inRoom) {
    return (
      <>
        <div className="lobby-screen">
          <div className="lobby-screen__stack">
          <h1 className="lobby-screen__title lobby-screen__title--room">Комната</h1>
          <p className="lobby-screen__room-desc">
            {isCaptain
              ? lanWs
                ? 'Вы ведущий (первый в комнате). Когда все готовы — нажмите «Начать игру».'
                : 'Вы создатель комнаты. Когда все готовы — «Начать игру».'
              : captainSlot?.displayName
                ? `Ждём старт от ${captainSlot.displayName} (ведущий).`
                : 'Дождитесь игроков или поделитесь кодом.'}
          </p>
          <p className="lobby-screen__room-mode">
            {settlementModeBadgeLabel(settlementMode, buyIn)}
          </p>
          {roomCode && (
            <div style={{ textAlign: 'center' }}>
              <p className="lobby-screen__code-label">Код комнаты</p>
              <p className="lobby-screen__code-value">{roomCode}</p>
              <p className="lobby-screen__code-hint">
                Если обновите страницу, код сохранится в меню и в онлайн-лобби — можно снова нажать «Продолжить онлайн-партию».
              </p>
              <p className="lobby-screen__code-hint lobby-screen__code-hint--dim">
                Другие игроки вводят этот код в «Присоединиться»
              </p>
              <div className="lobby-btn-row" style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 280 }}>
                <button type="button" className={lobbyBtnClass('secondary', 'lobby-btn--grow')} onClick={copyCodeToClipboard}>
                  {shareCopied ? 'Скопировано!' : 'Скопировать код'}
                </button>
                <button type="button" className={lobbyBtnClass('primary', 'lobby-btn--grow')} onClick={handleShare}>
                  Поделиться кодом
                </button>
              </div>
            </div>
          )}
          <div style={{ width: '100%', maxWidth: 280 }}>
            <p className="lobby-screen__players-label">
              Игроков: {humanSlots.length} из 4
            </p>
            <ul className="lobby-screen__players-list">
              {humanSlots.map((s) => (
                <li key={s.slotIndex}>
                  {s.displayName}
                  {s.shortLabel ? ` (${s.shortLabel})` : ''}
                  {s.slotIndex === myServerIndex && ' (вы)'}
                  {s.slotIndex === 0 && ' — ведущий'}
                </li>
              ))}
            </ul>
          </div>
          {error && (
            <p className="lobby-screen__error-inline">{error}</p>
          )}
          {isCaptain && (
            <button
              type="button"
              disabled={startingGame || humanSlots.length < 1}
              onClick={() => void handleStartGameFromLobby()}
              className={lobbyBtnClass('primary', 'lobby-btn--lg')}
            >
              {startingGame
                ? 'Запуск…'
                : humanSlots.length >= 4
                  ? 'Начать игру'
                  : 'Начать игру с ИИ'}
            </button>
          )}
          <button
            type="button"
            className={lobbyBtnClass(isCaptain ? 'secondary' : 'primary')}
            onClick={onGoToGame}
          >
            {isCaptain ? 'Открыть стол заранее' : 'Войти в игру'}
          </button>
          {onEditProfile && (
            <button type="button" className={lobbyBtnClass('secondary')} onClick={onEditProfile}>
              Селфи / редактор профиля
            </button>
          )}
          <button type="button" className={lobbyBtnClass('secondary')} onClick={handleLeaveRoomClick}>
            Выйти из комнаты
          </button>
          <button
            type="button"
            disabled={stopRememberBusy}
            onClick={() => void handleStopRememberThisRoom()}
            className={lobbyBtnClass('ghost', 'lobby-btn--sm')}
            title="После выхода или обновления страницы эта комната не будет открываться сама — можно снова войти по коду."
          >
            {stopRememberBusy ? 'Выходим…' : 'Не запоминать эту комнату'}
          </button>
          </div>
        {leftPlayerToast && (
          <div role="status" className="lobby-screen__toast">
            Игрок {leftPlayerToast} покинул комнату.
          </div>
        )}
        {showLeaveConfirm && (
          <div
            className="lobby-dialog-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="leave-room-title"
          >
            <div className="lobby-dialog lobby-dialog--leave">
              <p id="leave-room-title" className="lobby-dialog__title">
                Выйти из комнаты?
              </p>
              <p className="lobby-dialog__text">
                Вы выйдете с сервера. Код комнаты останется в подсказке «последняя комната» в меню — по нему можно зайти снова, пока комната жива.
              </p>
              <div className="lobby-dialog__actions">
                <button
                  type="button"
                  className={lobbyBtnClass('secondary', 'lobby-btn--dialog')}
                  onClick={() => setShowLeaveConfirm(false)}
                >
                  Отмена
                </button>
                <button
                  type="button"
                  className={lobbyBtnClass('danger', 'lobby-btn--dialog')}
                  onClick={() => void handleLeaveRoomConfirm()}
                >
                  Выйти
                </button>
              </div>
            </div>
          </div>
        )}
        </div>
      </>
    );
  }

  const lastPartyBanner =
    !roomId && status === 'idle'
      ? (() => {
          void lastPartyHintVersion;
          return loadLastOnlineParty();
        })()
      : null;

  const inviteCode = (initialJoinCode ?? joinCode).trim().toUpperCase();

  return (
    <div className="lobby-screen lobby-screen--entry">
      <div className="lobby-screen__aura" aria-hidden="true">
        <img className="lobby-screen__aura-img" src={ONLINE_LOBBY_MASCOT_URL} alt="" decoding="async" />
        <div className="lobby-screen__aura-glow" />
        <div className="lobby-screen__aura-scrim" />
      </div>
      <div className="lobby-screen__layout lobby-screen__layout--entry">
        <header className="lobby-screen__top-bar">
          <LobbyBackButton onClick={onBack} />
        </header>
        <div className="lobby-screen__entry-main">
        <div className="lobby-screen__hero-col">
          <div className="lobby-screen__hero">
            <img src={ONLINE_LOBBY_MASCOT_URL} alt="" aria-hidden="true" decoding="async" loading="eager" />
          </div>
        </div>
        <div className="lobby-screen__content">
      <h1 className="lobby-screen__title">
        {guestFromHostLink ? 'Вход в комнату' : 'Онлайн-лобби'}
      </h1>
      {guestFromHostLink ? (
        <p className="lobby-screen__lead">
          Вас пригласили в игру Up&amp;Down.
          {inviteCode ? (
            <>
              {' '}
              Код комнаты:{' '}
              <strong className="lobby-screen__code-value lobby-screen__code-value--inline">{inviteCode}</strong>
            </>
          ) : null}
        </p>
      ) : (
        lanWs && (
          <p className="lobby-screen__muted lobby-screen__muted--lan">
            Игра в вашей Wi‑Fi (без интернета и аккаунта)
          </p>
        )
      )}
      {guestFromHostLink && (
        <p className="lobby-screen__muted">
          {autoJoining || joining
            ? 'Подключаем к комнате…'
            : 'Нажмите «Войти в комнату» — откроется лобби этой партии, не общий зал.'}
        </p>
      )}
      <button
        type="button"
        className="lobby-entry-player lobby-entry-player--account"
        onClick={() => onOpenAccount?.()}
        disabled={!onOpenAccount}
        aria-label="Открыть личный кабинет"
      >
        Вы: <strong>{playerName}</strong>
      </button>
      {(error || joinError) && (
        <p className="lobby-entry-error">{joinError || error}</p>
      )}
      {!guestFromHostLink ? (
        <div className="lobby-entry-menu">
          {PUBLIC_HALL_ENABLED && (
            <LobbyCapsuleButton
              variant="hall"
              title="Зал столов"
              hint="найти открытый стол"
              onClick={() => setShowHall(true)}
            />
          )}
          <LobbyCapsuleButton
            variant="create"
            title="Создать комнату"
            hint={showCreatePanel ? 'настройки ниже' : 'своя партия с кодом'}
            expanded={showCreatePanel}
            disabled={creating}
            onClick={() => {
              setShowCreatePanel((open) => !open);
              setJoinError(null);
            }}
          />
          {showCreatePanel && (
            <LobbyCreatePanel
              createBankRoom={createBankRoom}
              createPublicRoom={createPublicRoom}
              showPublicHallOption={PUBLIC_HALL_ENABLED && lanWs}
              creating={creating}
              onToggleBank={setCreateBankRoom}
              onTogglePublic={setCreatePublicRoom}
              onLaunch={() => void handleCreateRoom()}
              onCancel={() => setShowCreatePanel(false)}
            />
          )}
          <div className="lobby-entry-join">
            <div className="lobby-entry-join__dial" aria-hidden="true">
              <span />
              <span />
              <span />
              <span />
              <span />
              <span />
            </div>
            <div className="lobby-entry-code-row">
              <input
                type="text"
                placeholder="· · · · · ·"
                value={joinCode}
                onChange={(e) => {
                  setJoinCode(normalizeJoinCode(e.target.value));
                  setJoinError(null);
                }}
                maxLength={CODE_LENGTH}
                className="lobby-entry-input"
                aria-label="Код комнаты"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="characters"
                spellCheck={false}
                enterKeyHint="go"
              />
              <LobbyPasteCodeButton ok={pasteJoinOk} onClick={() => void handlePasteJoinCode()} />
            </div>
            <LobbyCapsuleButton
              variant="join"
              title={joining || autoJoining ? 'Вход…' : 'Присоединиться'}
              hint="ввести код и войти"
              disabled={joining || autoJoining}
              onClick={handleJoinRoom}
              showChevron={false}
            />
          </div>
          {roomPeek?.settlement_mode && (
            <p className="lobby-entry-peek">
              Комната: {settlementModeBadgeLabel(roomPeek.settlement_mode, roomPeek.buy_in ?? null)}
              {roomPeek.human_count != null ? ` · игроков ${roomPeek.human_count}/4` : ''}
            </p>
          )}
          {(joining || creating) && (
            <p className="lobby-entry-hint">
              Связь с сервером обычно до ~30 с. Если долго — проверьте сеть.
            </p>
          )}
          {hostPanelUrl && (
            <a
              href={hostPanelUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="lobby-entry-host-link"
            >
              Панель хоста
            </a>
          )}
        </div>
      ) : (
        <div className="lobby-entry-menu lobby-entry-menu--guest">
          <LobbyCapsuleButton
            variant="join"
            title={joining || autoJoining ? 'Вход…' : 'Войти в комнату'}
            hint="по приглашению"
            disabled={joining || autoJoining}
            onClick={handleJoinRoom}
            showChevron={false}
          />
          {PUBLIC_HALL_ENABLED && lanWs && (
            <LobbyCapsuleButton
              variant="hall"
              title="Зал столов"
              hint="или найти стол"
              onClick={() => setShowHall(true)}
            />
          )}
        </div>
      )}
      {lastPartyBanner && (
        <div key={`last-party-${lastPartyHintVersion}`} className="lobby-last-party-fold">
          <LobbyLastPartyToggle
            code={lastPartyBanner.code}
            expanded={showLastPartyPanel}
            onClick={() => setShowLastPartyPanel((open) => !open)}
          />
          {showLastPartyPanel && (
            <div className="lobby-last-party-panel">
              <LobbyCapsuleButton
                variant="launch"
                title={resumeLastBusy ? 'Вход…' : 'Вернуться'}
                hint="продолжить партию"
                disabled={resumeLastBusy}
                onClick={() => void handleResumeLastFromLobby()}
                showChevron={false}
              />
              <LobbyCapsuleButton
                variant="join"
                title="Подставить код"
                hint="в поле выше"
                onClick={() => {
                  setJoinCode(lastPartyBanner.code);
                  setJoinError(null);
                  setShowLastPartyPanel(false);
                }}
                showChevron={false}
              />
              <button
                type="button"
                className="lobby-capsule lobby-capsule--ghost lobby-capsule--compact"
                onClick={() => {
                  forgetLastOnlineParty();
                  setShowLastPartyPanel(false);
                }}
              >
                <span className="lobby-capsule__body">
                  <span className="lobby-capsule__title">Скрыть</span>
                </span>
              </button>
            </div>
          )}
        </div>
      )}
        </div>
        </div>
      </div>
    </div>
  );
}
