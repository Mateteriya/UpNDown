import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyMatchHistory, type MatchHistoryItem } from '../lib/onlineGameSupabase';
import { getPartyHistory, type PartyHistoryRecord } from '../game/partyHistory';
import { hasSavedGame } from '../game/persistence';

const CLOUD_TEASER_MAX = 5;
const LOCAL_TEASER_MAX = 3;

function formatWhen(iso: string): string {
  try {
    const dt = new Date(iso);
    return isNaN(dt.getTime()) ? iso : dt.toLocaleString('ru-RU');
  } catch {
    return iso;
  }
}

function LocalTeaserRow({ row }: { row: PartyHistoryRecord }) {
  return (
    <div className="lk-modal__row">
      <div className="lk-modal__row-main">
        <span className="lk-modal__row-title">Офлайн на устройстве</span>
        <span className="lk-modal__row-meta">
          {formatWhen(row.finishedAt)} — место {row.humanPlace}, {row.humanScore >= 0 ? '+' : ''}
          {row.humanScore} очк.
        </span>
      </div>
    </div>
  );
}

function CloudTeaserRow({ it }: { it: MatchHistoryItem }) {
  const flags = [it.is_rated ? 'рейтинговая' : 'без рейтинга', it.interrupted ? 'прервана' : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="lk-modal__row">
      <div className="lk-modal__row-main">
        <span className="lk-modal__row-title">{it.is_offline ? 'Офлайн‑партия' : 'Онлайн‑партия'}</span>
        <span className="lk-modal__row-meta">
          {formatWhen(it.finished_at)}
          {flags ? ` — ${flags}` : ''}
        </span>
        {!it.is_offline && it.code ? <span className="lk-modal__row-code">Комната {it.code}</span> : null}
      </div>
      <div className="lk-modal__row-stats">
        <span className="lk-modal__row-stat-label">Место</span>
        <span className="lk-modal__row-stat-value">{it.place ?? '—'}</span>
        <span className="lk-modal__row-stat-label">Очки</span>
        <span className="lk-modal__row-stat-value">{it.final_score ?? '—'}</span>
      </div>
    </div>
  );
}

export function HistoryModal({
  onClose,
  onGoToOffline,
  onOpenCabinet,
}: {
  onClose: () => void;
  onGoToOffline?: () => void;
  onOpenCabinet?: () => void;
}) {
  const { user, configured, session, loading: authLoading } = useAuth();
  const accessToken = session?.access_token ?? '';
  const [items, setItems] = useState<MatchHistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const offlineAvailable = hasSavedGame();
  const localTeasers = getPartyHistory(undefined, LOCAL_TEASER_MAX);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (authLoading) return;
    void accessToken;
    (async () => {
      if (!configured || !user?.id) {
        setItems([]);
        return;
      }
      const data = await getMyMatchHistory(user.id, CLOUD_TEASER_MAX);
      setItems(data);
    })().catch((e) => setError(String(e)));
  }, [authLoading, configured, user?.id, accessToken]);

  const cloudTeasers = items?.slice(0, CLOUD_TEASER_MAX) ?? null;
  const hasTeasers =
    localTeasers.length > 0 || (cloudTeasers != null && cloudTeasers.length > 0);

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
            <p className="lk-modal__hint">Войдите, чтобы видеть облачную историю. Локальные партии — ниже.</p>
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

          {localTeasers.length > 0 ? (
            <div className="lk-modal__list">
              {localTeasers.map((row) => (
                <LocalTeaserRow key={row.id} row={row} />
              ))}
            </div>
          ) : null}

          {cloudTeasers == null ? (
            configured && user?.id ? <p className="lk-modal__hint">Загрузка…</p> : null
          ) : cloudTeasers.length === 0 && !hasTeasers ? (
            <p className="lk-modal__hint">Пока пусто.</p>
          ) : (
            <div className="lk-modal__list">
              {cloudTeasers.map((it) => (
                <CloudTeaserRow key={it.id} it={it} />
              ))}
            </div>
          )}

          {onOpenCabinet ? (
            <button
              type="button"
              className="lk-modal__pill-btn"
              style={{ width: '100%', marginTop: 12 }}
              onClick={onOpenCabinet}
            >
              Мои партии в кабинете
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
