/**
 * Экран лобби для онлайн-игры. Создание комнаты, присоединение по коду, ожидание и старт.
 */
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineGame } from '../contexts/OnlineGameContext';

export interface LobbyScreenProps {
  onBack: () => void;
  playerName: string;
  onGoToGame?: () => void;
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

export function LobbyScreen({ onBack, playerName, onGoToGame }: LobbyScreenProps) {
  const { user } = useAuth();
  const {
    status,
    code,
    roomId,
    mySlotIndex,
    playerSlots,
    error,
    createRoom,
    joinRoom,
    leaveRoom,
    clearError,
  } = useOnlineGame();

  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [leftPlayerToast, setLeftPlayerToast] = useState<string | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const prevSlotsRef = useRef<typeof playerSlots>([]);

  // Когда игра началась — перейти на экран игры
  useEffect(() => {
    if (status === 'playing' && onGoToGame) onGoToGame();
  }, [status, onGoToGame]);

  const isHost = mySlotIndex === 0;
  const inRoom = status === 'waiting' && roomId;

  useEffect(() => {
    if (!inRoom || playerSlots.length >= prevSlotsRef.current.length) {
      prevSlotsRef.current = playerSlots;
      return;
    }
    const prev = prevSlotsRef.current;
    const gone = prev.find((p) => p.userId && !playerSlots.some((s) => s.userId === p.userId));
    if (gone?.displayName) setLeftPlayerToast(gone.displayName);
    prevSlotsRef.current = playerSlots;
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
    if (!user?.id) return;
    clearError();
    setCreating(true);
    // Изменений в вызове здесь нет, т.к. deviceId получается внутри контекста
    await createRoom(user.id, playerName, shortLabel);
    setCreating(false);
  };

  const [joinError, setJoinError] = useState<string | null>(null);

  const handleJoinRoom = async () => {
    if (!user?.id) return;
    clearError();
    setJoinError(null);
    setJoining(true);
    try {
      // Изменений в вызове здесь нет
      const ok = await joinRoom(joinCode.trim(), user.id, playerName, shortLabel);
      if (!ok) setJoinError(error || 'Не удалось присоединиться. Проверьте код и подключение.');
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : 'Ошибка соединения. Проверьте интернет.');
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
      <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24, }} >
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
        <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 20, }} >
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
                  {i === mySlotIndex && ' (вы)'}
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
                Сессия будет сброшена. Вернуться в эту комнату по кнопке «Продолжить онлайн-партию» будет нельзя.
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

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0f172a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, gap: 24, }} >
      <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#f1f5f9' }}>Онлайн-лобби</h1>
      <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 320 }}>
        Вы: <strong style={{ color: '#e2e8f0' }}>{playerName}</strong>
      </p>
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
          <button type="button" disabled={joining || !joinCode.trim()} onClick={handleJoinRoom} style={{ ...buttonPrimary, flex: 1, minWidth: 120 }} >
            {joining ? 'Вход…' : 'Присоединиться'}
          </button>
        </div>
      </div>
      <button type="button" onClick={onBack} style={buttonSecondary}>
        ← Назад в меню
      </button>
    </div>
  );
    //--- Конец неизмененной части ---
}

const CODE_LENGTH = 6;
