/**
 * Экран лобби для онлайн-игры. Создание комнаты, присоединение по коду, ожидание и старт.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineGame } from '../contexts/useOnlineGame';
import { loadLastOnlineParty } from '../lib/lastOnlineParty';

export interface LobbyScreenProps {
  onBack: () => void;
  playerName: string;
  onGoToGame?: () => void;
  /** Код комнаты из URL (?code=XXX) — подставляется в поле «Присоединиться» */
  initialJoinCode?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  maxWidth: 280,
  padding: '12px 16px',
  fontSize: 16,
  borderRadius: 8,
  border: '1px solid #334155',
  background: '#1e293b',
  color: '#f8fafc',
  boxSizing: 'border-box',
};

const buttonPrimary: React.CSSProperties = {
  padding: '14px 24px',
  fontSize: 16,
  fontWeight: 600,
  borderRadius: 8,
  border: '1px solid rgba(34, 211, 238, 0.5)',
  background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
  color: '#f8fafc',
  cursor: 'pointer',
  width: '100%',
  maxWidth: 280,
};

const buttonSecondary: React.CSSProperties = {
  ...buttonPrimary,
  background: 'transparent',
  border: '1px solid #334155',
  color: '#94a3b8',
};

/** Верхняя граница ожидания createRoom — иначе кнопка «Создание…» без ответа при зависшем fetch. */
const LOBBY_CREATE_TOTAL_MS = 52_000;
/** «Выход из прошлой комнаты» + join — один лимит, иначе спиннер висит на leaveRoom вне Promise.race. */
const LOBBY_JOIN_TOTAL_MS = 68_000;

export function LobbyScreen({ onBack, playerName, onGoToGame, initialJoinCode }: LobbyScreenProps) {
  const { user } = useAuth();
  const {
    status,
    code,
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
  } = useOnlineGame();

  const [joinCode, setJoinCode] = useState(initialJoinCode ?? '');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [resumeLastBusy, setResumeLastBusy] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leftPlayerToast, setLeftPlayerToast] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const prevSlotsRef = useRef<typeof playerSlots>([]);
  /** Актуальные слоты для отложенной проверки «ушёл ли игрок» (иначе гонка Realtime/опроса даёт ложный тост). */
  const playerSlotsRef = useRef<typeof playerSlots>(playerSlots);
  playerSlotsRef.current = playerSlots;

  // Когда игра началась — перейти на экран игры
  useEffect(() => {
    if (status === 'playing' && onGoToGame) onGoToGame();
  }, [status, onGoToGame]);

  const isHost = myServerIndex === 0;
  const inRoom = status === 'waiting' && roomId;

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

  /** Сразу после входа хоста sync давал UPDATE player_slots без проверки updated_at — сдвигал штамп и ломал гостевой join (optimistic lock по updated_at). Дебаунс 2 с. */
  useEffect(() => {
    if (!inRoom || !isHost || !playerName.trim() || !syncMySlotDisplayName) return;
    const t = window.setTimeout(() => {
      void syncMySlotDisplayName(playerName);
    }, 2000);
    return () => clearTimeout(t);
  }, [inRoom, isHost, playerName, syncMySlotDisplayName]);

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

  const shortLabel = user?.email
    ? user.email.replace(/@.*$/, '').slice(-8)
    : undefined;

  const handleCreateRoom = async () => {
    if (!user?.id) {
      setJoinError('Войдите в аккаунт, чтобы создать комнату.');
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
          return createRoom(user.id, name, shortLabel);
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
      }
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Ошибка при создании комнаты.');
    } finally {
      setCreating(false);
    }
  };

  const [joinError, setJoinError] = useState<string | null>(null);

  const handleResumeLastFromLobby = async () => {
    setResumeLastBusy(true);
    setJoinError(null);
    clearError();
    try {
      const r = await tryRestoreSession();
      if (r.needReclaim) return;
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

  const handleJoinRoom = async () => {
    const code = joinCode.trim();
    if (!code) {
      setJoinError('Введите код комнаты.');
      return;
    }
    if (!user?.id) {
      setJoinError('Войдите в аккаунт, чтобы присоединиться к комнате.');
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
      let r: JoinOutcome | LobbyWall = await Promise.race([
        (async () => {
          await leaveRoom();
          return joinRoom(code, user.id, playerName.trim(), shortLabel);
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
          const recovered = await recoverJoinIfAlreadyInRoom(code);
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
    }
  };

  const handleLeaveRoomClick = () => setShowLeaveConfirm(true);

  const handleLeaveRoomConfirm = async () => {
    setShowLeaveConfirm(false);
    await leaveRoom();
  };

  /** При «Поделиться» и «Скопировать код» отправляем только код комнаты, без ссылки. */
  const handleShare = async () => {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: 'Up&Down — код комнаты',
          text: code,
        });
      } catch (e) {
        if ((e as Error).name !== 'AbortError') copyCodeToClipboard();
      }
    } else {
      copyCodeToClipboard();
    }
  };

  function copyCodeToClipboard() {
    if (!code) return;
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(code).then(() => {
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
      });
    }
  }

    // ... (Вся JSX разметка остается без изменений)
    // ... (Просто скопируйте весь остальной код из вашего оригинального файла `LobbyScreen.tsx` сюда)
    //--- Начало неизмененной части ---
  if (!user) {
    return (
      <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24, }} >
        <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#f1f5f9' }}>Онлайн-лобби</h1>
        <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 320 }}>
          Войдите в аккаунт, чтобы создавать комнаты и играть онлайн.
        </p>
        <button type="button" onClick={onBack} style={buttonSecondary}>
          ← Назад в меню
        </button>
      </div>
    );
  }

  if (inRoom) {
    return (
      <>
        <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20, }} >
          <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>Комната</h1>
          <p style={{ margin: '0 0 12px', fontSize: 14, color: '#94a3b8' }}>
            Вы в комнате. Дождитесь игроков или поделитесь кодом.
          </p>
          {code && (
            <div style={{ textAlign: 'center' }}>
              <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Код комнаты</p>
              <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: 4, color: '#22d3ee' }}>
                {code}
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#a5f3fc', maxWidth: 300, lineHeight: 1.45 }}>
                Если обновите страницу, код сохранится в меню и в онлайн-лобби — можно снова нажать «Продолжить онлайн-партию».
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
                Другие игроки вводят этот код в «Присоединиться»
              </p>
              <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 280 }}>
                <button type="button" onClick={copyCodeToClipboard} style={{ ...buttonSecondary, flex: 1, minWidth: 140 }}>
                  {shareCopied ? 'Скопировано!' : 'Скопировать код'}
                </button>
                <button type="button" onClick={handleShare} style={{ ...buttonPrimary, flex: 1, minWidth: 140 }} >
                  Поделиться кодом
                </button>
              </div>
            </div>
          )}
          <div style={{ width: '100%', maxWidth: 280 }}>
            <p style={{ margin: '0 0 8px', fontSize: 14, color: '#94a3b8' }}>
              В комнате: {playerSlots.length} из 4
            </p>
            <ul style={{ margin: 0, paddingLeft: 20, color: '#e2e8f0', fontSize: 14 }}>
              {playerSlots.map((s, i) => (
                <li key={s.slotIndex}>
                  {s.displayName}
                  {s.shortLabel ? ` (${s.shortLabel})` : ''}
                  {i === myServerIndex && ' (вы)'}
                  {isHost && i === 0 && ' — хост'}
                </li>
              ))}
            </ul>
          </div>
          {error && (
            <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{error}</p>
          )}
          <button type="button" onClick={onGoToGame} style={buttonPrimary}>
            Войти в игру
          </button>
          <button type="button" onClick={handleLeaveRoomClick} style={buttonSecondary}>
            Выйти из комнаты
          </button>
        </div>
        {leftPlayerToast && (
          <div role="status" style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', padding: '10px 16px', borderRadius: 8, background: '#1e293b', border: '1px solid rgba(34,211,238,0.3)', color: '#f8fafc', zIndex: 1001, fontSize: 14, }} >
            Игрок {leftPlayerToast} покинул комнату.
          </div>
        )}
        {showLeaveConfirm && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 24, }} role="dialog" aria-modal="true" aria-labelledby="leave-room-title" >
            <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 24, maxWidth: 320, textAlign: 'center', }} >
              <p id="leave-room-title" style={{ margin: '0 0 8px', fontSize: 18, fontWeight: 600, color: '#f1f5f9' }}>
                Выйти из комнаты?
              </p>
              <p style={{ margin: '0 0 20px', fontSize: 14, color: '#94a3b8', lineHeight: 1.4 }}>
                Вы выйдете с сервера. Код комнаты останется в подсказке «последняя комната» в меню — по нему можно зайти снова, пока комната жива.
              </p>
              <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
                <button type="button" onClick={() => setShowLeaveConfirm(false)} style={buttonSecondary}>
                  Отмена
                </button>
                <button type="button" onClick={handleLeaveRoomConfirm} style={buttonPrimary}>
                  Выйти
                </button>
              </div>
            </div>
          </div>
        )}
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

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 100, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24, }} >
      <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#f1f5f9' }}>Онлайн-лобби</h1>
      <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 320 }}>
        Вы: <strong style={{ color: '#e2e8f0' }}>{playerName}</strong>
      </p>
      {lastPartyBanner && (
        <div
          key={`last-party-${lastPartyHintVersion}`}
          style={{
            width: '100%',
            maxWidth: 320,
            padding: 14,
            borderRadius: 10,
            border: '1px solid rgba(34, 211, 238, 0.4)',
            background: 'rgba(6, 78, 59, 0.25)',
            boxSizing: 'border-box',
          }}
        >
          <p style={{ margin: 0, fontSize: 12, color: '#94a3b8' }}>Последняя комната (после обновления страницы)</p>
          <p
            style={{
              margin: '8px 0 12px',
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 3,
              color: '#22d3ee',
              textAlign: 'center',
            }}
          >
            {lastPartyBanner.code}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button
              type="button"
              disabled={resumeLastBusy}
              onClick={() => void handleResumeLastFromLobby()}
              style={buttonPrimary}
            >
              {resumeLastBusy ? 'Вход…' : 'Вернуться в эту комнату'}
            </button>
            <button type="button" onClick={() => setJoinCode(lastPartyBanner.code)} style={{ ...buttonSecondary, fontSize: 14 }}>
              Подставить код в поле ниже
            </button>
            <button
              type="button"
              onClick={() => forgetLastOnlineParty()}
              style={{ ...buttonSecondary, fontSize: 13, borderColor: 'rgba(148, 163, 184, 0.45)' }}
            >
              Скрыть подсказку
            </button>
          </div>
        </div>
      )}
      {(error || joinError) && (
        <p style={{ margin: 0, fontSize: 13, color: '#f87171', textAlign: 'center', maxWidth: 280 }}>
          {joinError || error}
        </p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
        <button type="button" disabled={creating} onClick={handleCreateRoom} style={buttonPrimary} >
          {creating ? 'Создание…' : 'Создать комнату'}
        </button>
        <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 280, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Код комнаты" value={joinCode} onChange={(e) => { setJoinCode(e.target.value.toUpperCase()); setJoinError(null); }} maxLength={CODE_LENGTH} style={inputStyle} aria-label="Код комнаты" />
          <button type="button" disabled={joining} onClick={handleJoinRoom} style={{ ...buttonPrimary, flex: 1, minWidth: 120 }} >
            {joining ? 'Вход…' : 'Присоединиться'}
          </button>
        </div>
        {(joining || creating) && (
          <p style={{ margin: 0, fontSize: 12, color: '#64748b', textAlign: 'center', maxWidth: 300, lineHeight: 1.4 }}>
            Связь с сервером обычно до ~30 с. Если долго — проверьте сеть; при разработке избегайте частых сохранений файлов (Vite перезагружает страницу).
          </p>
        )}
      </div>
      <button type="button" onClick={onBack} style={buttonSecondary}>
        ← Назад в меню
      </button>
    </div>
  );
    //--- Конец неизмененной части ---
}

const CODE_LENGTH = 6;
