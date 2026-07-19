import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyMatchHistory, type MatchHistoryItem } from '../lib/onlineGameSupabase';
import { hasSavedGame } from '../game/persistence';

export function HistoryModal({ onClose, onGoToOffline }: { onClose: () => void; onGoToOffline?: () => void }) {
  const { user, configured } = useAuth();
  const [items, setItems] = useState<MatchHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offlineAvailable = hasSavedGame();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    (async () => {
      if (!configured || !user?.id) {
        setItems([]);
        return;
      }
      const data = await getMyMatchHistory(user.id, 20);
      setItems(data);
    })().catch((e) => setError(String(e)));
  }, [configured, user?.id]);

  return (
    <div
      className="lk-modal lk-modal--top"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="history-modal-title"
    >
      <div className="lk-modal__panel lk-modal__panel--history" onClick={(e) => e.stopPropagation()}>
        <div className="lk-modal__head">
          <h2 id="history-modal-title" className="lk-modal__title">
            История матчей
          </h2>
          <button type="button" className="lk-modal__close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>

        <div className="lk-modal__body">
          {!configured ? (
            <p className="lk-modal__hint">Сервер не настроен. История появится после настройки.</p>
          ) : null}
          {configured && !user?.id ? (
            <p className="lk-modal__hint">Войдите, чтобы просматривать историю.</p>
          ) : null}
          {error ? <p className="lk-modal__error">{error}</p> : null}

          {offlineAvailable && onGoToOffline ? (
            <div className="lk-modal__offline-card">
              <div>
                <span className="lk-modal__offline-card-title">Последняя офлайн‑партия</span>
                <span className="lk-modal__offline-card-sub">Есть незавершённая партия на устройстве</span>
              </div>
              <button
                type="button"
                className="lk-modal__pill-btn"
                onClick={() => {
                  onClose();
                  onGoToOffline();
                }}
              >
                Продолжить
              </button>
            </div>
          ) : null}

          {items == null ? (
            <p className="lk-modal__hint">Загрузка…</p>
          ) : items.length === 0 ? (
            <p className="lk-modal__hint">Пока пусто.</p>
          ) : (
            <div className="lk-modal__list">
              {items.map((it) => {
                const dt = new Date(it.finished_at);
                const date = isNaN(dt.getTime()) ? it.finished_at : dt.toLocaleString();
                const flags = [it.is_rated ? 'рейтинговая' : 'без рейтинга', it.interrupted ? 'прервана' : null]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <div key={it.id} className="lk-modal__row">
                    <div className="lk-modal__row-main">
                      <span className="lk-modal__row-title">
                        {it.is_offline ? 'Офлайн‑партия' : 'Онлайн‑партия'}
                      </span>
                      <span className="lk-modal__row-meta">
                        {date}
                        {flags ? ` — ${flags}` : ''}
                      </span>
                      {!it.is_offline && it.code ? (
                        <span className="lk-modal__row-code">Комната {it.code}</span>
                      ) : null}
                    </div>
                    <div className="lk-modal__row-stats">
                      <span className="lk-modal__row-stat-label">Место</span>
                      <span className="lk-modal__row-stat-value">{it.place ?? '—'}</span>
                      <span className="lk-modal__row-stat-label">Очки</span>
                      <span className="lk-modal__row-stat-value">{it.final_score ?? '—'}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
