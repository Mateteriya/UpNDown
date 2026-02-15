/**
 * Экран лобби для онлайн-игры. Создание комнаты, присоединение по коду, ожидание и старт.
 */

import { useState, useEffect } from 'react';
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
  borderColor: '#334155',
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
    startGame,
    clearError,
  } = useOnlineGame();

  const [joinCode, setJoinCode] = useState('');
  const [creating, setCreating] = useState(false);
  const [joining, setJoining] = useState(false);
  const [starting, setStarting] = useState(false);

  // Когда игра началась — перейти на экран игры
  useEffect(() => {
    if (status === 'playing' && onGoToGame) onGoToGame();
  }, [status, onGoToGame]);

  const isHost = mySlotIndex === 0;
  const inRoom = status === 'waiting' && roomId;

  const handleCreateRoom = async () => {
    if (!user?.id) return;
    clearError();
    setCreating(true);
    const ok = await createRoom(user.id, playerName);
    setCreating(false);
  };

  const handleJoinRoom = async () => {
    if (!user?.id) return;
    clearError();
    setJoining(true);
    const ok = await joinRoom(joinCode.trim(), user.id, playerName);
    setJoining(false);
  };

  const handleLeaveRoom = async () => {
    await leaveRoom();
  };

  const handleStartGame = async () => {
    if (!isHost) return;
    clearError();
    setStarting(true);
    await startGame();
    setStarting(false);
  };

  if (!user) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 24,
        }}
      >
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
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: '#0f172a',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          gap: 20,
        }}
      >
        <h1 style={{ margin: 0, fontSize: '1.5rem', color: '#f1f5f9' }}>Комната</h1>
        {code && (
          <div style={{ textAlign: 'center' }}>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: '#94a3b8' }}>Код комнаты</p>
            <p style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700, letterSpacing: 4, color: '#22d3ee' }}>
              {code}
            </p>
            <p style={{ margin: '8px 0 0', fontSize: 12, color: '#64748b' }}>
              Другие игроки вводят этот код в «Присоединиться»
            </p>
          </div>
        )}
        <div style={{ width: '100%', maxWidth: 280 }}>
          <p style={{ margin: '0 0 8px', fontSize: 14, color: '#94a3b8' }}>
            В комнате: {playerSlots.length} из 4
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, color: '#e2e8f0', fontSize: 14 }}>
            {playerSlots.map((s, i) => (
              <li key={s.userId}>
                {s.displayName}
                {i === mySlotIndex && ' (вы)'}
                {isHost && i === 0 && ' — хост'}
              </li>
            ))}
          </ul>
        </div>
        {error && (
          <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{error}</p>
        )}
        {isHost && (
          <button
            type="button"
            disabled={playerSlots.length < 2 || starting}
            onClick={handleStartGame}
            style={{ ...buttonPrimary, opacity: playerSlots.length < 2 ? 0.6 : 1 }}
          >
            {starting ? 'Запуск…' : 'Начать игру'}
          </button>
        )}
        {!isHost && (
          <p style={{ margin: 0, fontSize: 13, color: '#94a3b8' }}>
            Ожидание старта от хоста…
          </p>
        )}
        <button type="button" onClick={handleLeaveRoom} style={buttonSecondary}>
          Выйти из комнаты
        </button>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: '#0f172a',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        gap: 24,
      }}
    >
      <h1 style={{ margin: 0, fontSize: '1.75rem', color: '#f1f5f9' }}>Онлайн-лобби</h1>
      <p style={{ margin: 0, fontSize: 14, color: '#94a3b8', textAlign: 'center', maxWidth: 320 }}>
        Вы: <strong style={{ color: '#e2e8f0' }}>{playerName}</strong>
      </p>
      {error && (
        <p style={{ margin: 0, fontSize: 13, color: '#f87171' }}>{error}</p>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
        <button
          type="button"
          disabled={creating}
          onClick={handleCreateRoom}
          style={buttonPrimary}
        >
          {creating ? 'Создание…' : 'Создать комнату'}
        </button>
        <div style={{ display: 'flex', gap: 8, width: '100%', maxWidth: 280, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Код комнаты"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            maxLength={CODE_LENGTH}
            style={inputStyle}
            aria-label="Код комнаты"
          />
          <button
            type="button"
            disabled={joining || !joinCode.trim()}
            onClick={handleJoinRoom}
            style={{ ...buttonPrimary, flex: 1, minWidth: 120 }}
          >
            {joining ? 'Вход…' : 'Присоединиться'}
          </button>
        </div>
      </div>
      <button type="button" onClick={onBack} style={buttonSecondary}>
        ← Назад в меню
      </button>
    </div>
  );
}

const CODE_LENGTH = 6;
