/**
 * Экран лобби для онлайн-игры. UI готов для подключения сервера (WebSocket, Supabase Realtime и т.п.).
 * Пока — заглушка «Сервер в разработке» и кнопки «Создать комнату» / «Присоединиться».
 */

export interface LobbyScreenProps {
  onBack: () => void;
  playerName: string;
}

export function LobbyScreen({ onBack, playerName }: LobbyScreenProps) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 280 }}>
        <button
          type="button"
          disabled
          style={{
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#64748b',
            cursor: 'not-allowed',
            opacity: 0.8,
          }}
          title="Скоро"
        >
          Создать комнату
        </button>
        <button
          type="button"
          disabled
          style={{
            padding: '14px 24px',
            fontSize: 16,
            fontWeight: 600,
            borderRadius: 8,
            border: '1px solid #334155',
            background: '#1e293b',
            color: '#64748b',
            cursor: 'not-allowed',
            opacity: 0.8,
          }}
          title="Скоро"
        >
          Присоединиться к комнате
        </button>
      </div>
      <p style={{ margin: 0, fontSize: 13, color: '#64748b', textAlign: 'center' }}>
        Сервер в разработке. Пока играйте офлайн.
      </p>
      <button
        type="button"
        onClick={onBack}
        style={{
          padding: '12px 24px',
          fontSize: 14,
          borderRadius: 8,
          border: '1px solid #334155',
          background: 'transparent',
          color: '#94a3b8',
          cursor: 'pointer',
        }}
      >
        ← Назад в меню
      </button>
    </div>
  );
}
