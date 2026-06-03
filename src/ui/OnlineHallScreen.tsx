/**
 * Зал публичных waiting-комнат (волна 2).
 */

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useOnlineGame } from '../contexts/useOnlineGame';
import { listPublicWaitingRooms } from '../lib/onlineGameSupabase';
import { settlementModeBadgeLabel, type PublicWaitingRoomRow } from '../lib/roomSettlement';
import { PUBLIC_HALL_ENABLED } from '../lib/productFlags';

const shell: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  background: '#0f172a',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  padding: 24,
  gap: 16,
  overflow: 'auto',
};

const card: React.CSSProperties = {
  width: '100%',
  maxWidth: 420,
  padding: 14,
  borderRadius: 10,
  border: '1px solid rgba(51, 65, 85, 0.8)',
  background: 'rgba(15, 23, 42, 0.85)',
};

const btnPrimary: React.CSSProperties = {
  padding: '10px 16px',
  borderRadius: 8,
  border: '1px solid rgba(34, 211, 238, 0.5)',
  background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
  color: '#f8fafc',
  cursor: 'pointer',
  fontWeight: 600,
};

const btnSecondary: React.CSSProperties = {
  ...btnPrimary,
  background: 'transparent',
  border: '1px solid #334155',
  color: '#94a3b8',
};

export interface OnlineHallScreenProps {
  onBack: () => void;
  playerName: string;
  onGoToGame?: () => void;
}

export function OnlineHallScreen({ onBack, playerName, onGoToGame }: OnlineHallScreenProps) {
  const { user } = useAuth();
  const { joinRoom, leaveRoom, status } = useOnlineGame();
  const [rooms, setRooms] = useState<PublicWaitingRoomRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [joinBusy, setJoinBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!PUBLIC_HALL_ENABLED) return;
    setLoading(true);
    setError(null);
    const r = await listPublicWaitingRooms();
    if (!r.ok) setError(r.error ?? 'Не удалось загрузить столы');
    else setRooms(r.rooms);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 8000);
    return () => window.clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    if (status === 'playing' && onGoToGame) onGoToGame();
  }, [status, onGoToGame]);

  const handleJoin = async (code: string) => {
    if (!user?.id || !playerName.trim()) return;
    setJoinBusy(code);
    setError(null);
    try {
      await leaveRoom();
      const jr = await joinRoom(code, user.id, playerName.trim());
      if (!jr.ok) setError(jr.error ?? 'Не удалось войти');
    } finally {
      setJoinBusy(null);
    }
  };

  if (!PUBLIC_HALL_ENABLED) {
    return (
      <div style={shell}>
        <p style={{ color: '#94a3b8' }}>Зал столов отключён (VITE_PUBLIC_HALL_ENABLED).</p>
        <button type="button" style={btnSecondary} onClick={onBack}>
          ← Назад
        </button>
      </div>
    );
  }

  return (
    <div style={shell}>
      <h1 style={{ margin: 0, color: '#f1f5f9', fontSize: '1.5rem' }}>Зал столов</h1>
      <p style={{ margin: 0, color: '#94a3b8', fontSize: 14, textAlign: 'center' }}>
        Открытые комнаты в ожидании игроков
      </p>
      <button type="button" style={btnSecondary} onClick={() => void refresh()} disabled={loading}>
        {loading ? 'Обновление…' : 'Обновить'}
      </button>
      {error && (
        <p style={{ margin: 0, color: '#f87171', fontSize: 13, maxWidth: 360, textAlign: 'center' }}>
          {error}
        </p>
      )}
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {rooms.length === 0 && !loading && !error && (
          <p style={{ color: '#64748b', textAlign: 'center', fontSize: 14 }}>
            Пока нет открытых столов. В лобби создайте комнату и включите «Показать в зале столов».
          </p>
        )}
        {rooms.map((room) => (
          <div key={room.id} style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
              <span style={{ letterSpacing: 3, fontWeight: 700, color: '#22d3ee' }}>{room.code}</span>
              <span style={{ fontSize: 12, color: '#94a3b8' }}>
                {room.human_count}/4
              </span>
            </div>
            <p style={{ margin: '8px 0 12px', fontSize: 13, color: '#cbd5e1' }}>
              {settlementModeBadgeLabel(room.settlement_mode, room.buy_in)}
            </p>
            <button
              type="button"
              style={btnPrimary}
              disabled={joinBusy === room.code}
              onClick={() => void handleJoin(room.code)}
            >
              {joinBusy === room.code ? 'Вход…' : 'Присоединиться'}
            </button>
          </div>
        ))}
      </div>
      <button type="button" style={btnSecondary} onClick={onBack}>
        ← Назад в лобби
      </button>
    </div>
  );
}
