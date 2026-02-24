import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyMatchHistory, type MatchHistoryItem } from '../lib/onlineGameSupabase';

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const { user, configured } = useAuth();
  const [items, setItems] = useState<MatchHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      if (!configured || !user?.id) { setItems([]); return; }
      const data = await getMyMatchHistory(user.id, 20);
      setItems(data);
    })().catch(e => setError(String(e)));
  }, [configured, user?.id]);

  return (
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
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 16,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          maxWidth: 420,
          width: '100%',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h2 id="history-modal-title" style={{ margin: 0, fontSize: 20, fontWeight: 700, color: '#f1f5f9' }}>
            История матчей
          </h2>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        {!configured && (
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8' }}>Сервер не настроен. История появится после настройки.</p>
        )}
        {configured && !user?.id && (
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#94a3b8' }}>Войдите, чтобы просматривать историю.</p>
        )}
        {error && (
          <p style={{ margin: '8px 0 0', fontSize: 14, color: '#ef4444' }}>{error}</p>
        )}
        {items == null ? (
          <div style={{ marginTop: 12, fontSize: 14, color: '#94a3b8' }}>Загрузка…</div>
        ) : items.length === 0 ? (
          <div style={{ marginTop: 12, fontSize: 14, color: '#94a3b8' }}>Пока пусто.</div>
        ) : (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {items.map((it) => {
              const dt = new Date(it.finished_at);
              const date = isNaN(dt.getTime()) ? it.finished_at : dt.toLocaleString();
              const flags = [
                it.is_rated ? 'рейтинговая' : 'без рейтинга',
                it.interrupted ? 'прервана' : null,
              ].filter(Boolean).join(' · ');
              return (
                <div key={it.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', border: '1px solid rgba(148,163,184,0.25)', borderRadius: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>Код {it.code}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>{date}{flags ? ' — ' + flags : ''}</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Место</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{it.place ?? '—'}</span>
                    <span style={{ fontSize: 12, color: '#94a3b8' }}>Очки</span>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#f8fafc' }}>{it.final_score ?? '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
