import { useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getMyMatchHistory, type MatchHistoryItem } from '../lib/onlineGameSupabase';
import { getPartyHistory, type PartyHistoryRecord } from '../game/partyHistory';
import { hasSavedGame } from '../game/persistence';
import { getLocale, useT, type TFunc } from '../i18n';

const CLOUD_TEASER_MAX = 5;
const LOCAL_TEASER_MAX = 3;

function formatWhen(iso: string): string {
  try {
    const dt = new Date(iso);
    return isNaN(dt.getTime())
      ? iso
      : dt.toLocaleString(getLocale() === 'en' ? 'en-GB' : 'ru-RU');
  } catch {
    return iso;
  }
}

function LocalTeaserRow({ row, t }: { row: PartyHistoryRecord; t: TFunc }) {
  const score = `${row.humanScore >= 0 ? '+' : ''}${row.humanScore}`;
  return (
    <div className="lk-modal__row">
      <div className="lk-modal__row-main">
        <span className="lk-modal__row-title">{t('historyModal.offlineOnDevice')}</span>
        <span className="lk-modal__row-meta">
          {formatWhen(row.finishedAt)} — {t('historyModal.placeScore', { place: row.humanPlace, score })}
        </span>
      </div>
    </div>
  );
}

function CloudTeaserRow({ it, t }: { it: MatchHistoryItem; t: TFunc }) {
  const flags = [
    it.is_rated ? t('historyModal.rated') : t('historyModal.unrated'),
    it.interrupted ? t('historyModal.interrupted') : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="lk-modal__row">
      <div className="lk-modal__row-main">
        <span className="lk-modal__row-title">
          {it.is_offline ? t('archive.offline') : t('archive.online')}
        </span>
        <span className="lk-modal__row-meta">
          {formatWhen(it.finished_at)}
          {flags ? ` — ${flags}` : ''}
        </span>
        {!it.is_offline && it.code ? (
          <span className="lk-modal__row-code">{t('historyModal.room', { code: it.code })}</span>
        ) : null}
      </div>
      <div className="lk-modal__row-stats">
        <span className="lk-modal__row-stat-label">{t('historyModal.placeLabel')}</span>
        <span className="lk-modal__row-stat-value">{it.place ?? '—'}</span>
        <span className="lk-modal__row-stat-label">{t('historyModal.ptsLabel')}</span>
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
  const t = useT();
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
            {t('historyModal.title')}
          </h2>
          <button type="button" className="lk-modal__close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="lk-modal__body">
          {!configured ? <p className="lk-modal__hint">{t('historyModal.serverOff')}</p> : null}
          {configured && !user?.id ? <p className="lk-modal__hint">{t('historyModal.signInCloud')}</p> : null}
          {error ? <p className="lk-modal__error">{error}</p> : null}

          {offlineAvailable && onGoToOffline ? (
            <div className="lk-modal__offline-card">
              <div>
                <span className="lk-modal__offline-card-title">{t('historyModal.lastOffline')}</span>
                <span className="lk-modal__offline-card-sub">{t('historyModal.lastOfflineSub')}</span>
              </div>
              <button
                type="button"
                className="lk-modal__pill-btn"
                onClick={() => {
                  onClose();
                  onGoToOffline();
                }}
              >
                {t('archive.continue')}
              </button>
            </div>
          ) : null}

          {localTeasers.length > 0 ? (
            <div className="lk-modal__list">
              {localTeasers.map((row) => (
                <LocalTeaserRow key={row.id} row={row} t={t} />
              ))}
            </div>
          ) : null}

          {cloudTeasers == null ? (
            configured && user?.id ? <p className="lk-modal__hint">{t('archive.loading')}</p> : null
          ) : cloudTeasers.length === 0 && !hasTeasers ? (
            <p className="lk-modal__hint">{t('historyModal.empty')}</p>
          ) : (
            <div className="lk-modal__list">
              {cloudTeasers.map((it) => (
                <CloudTeaserRow key={it.id} it={it} t={t} />
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
              {t('historyModal.cabinetCta')}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
