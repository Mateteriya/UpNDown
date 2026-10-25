/**
 * Явная кнопка на главной: скачать картинки для полного офлайна (карты, ИИ, касты, иконки).
 */
import { useEffect, useState } from 'react';
import {
  downloadOfflinePack,
  getOfflinePackManifest,
  refreshOfflinePackStatus,
  subscribeOfflinePackStatus,
  type OfflinePackStatus,
} from '../lib/warmOfflineAssets';
import { useT } from '../i18n';

export function OfflinePackDownloadButton() {
  const t = useT();
  const [status, setStatus] = useState<OfflinePackStatus | null>(null);
  const totalHint = getOfflinePackManifest().length;

  useEffect(() => subscribeOfflinePackStatus(setStatus), []);
  useEffect(() => {
    void refreshOfflinePackStatus();
  }, []);

  const running = status?.running === true;
  const ready = status?.ready === true;
  const blocked = status?.blocked === true;
  const cached = status?.cached ?? 0;
  const total = status?.total || totalHint;
  const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;

  const label = blocked
    ? t('offlinePack.blocked')
    : running
      ? t('offlinePack.downloading', { cached, total })
      : ready
        ? t('offlinePack.ready', { total })
        : cached > 0 && cached < total
          ? t('offlinePack.resume', { cached, total })
          : t('offlinePack.download');

  const sub = blocked
    ? t('offlinePack.subBlocked')
    : running
      ? t('offlinePack.subRunning')
      : ready
        ? t('offlinePack.subReady')
        : offline
          ? t('offlinePack.subNeedInternet')
          : t('offlinePack.subIdle');

  const canClick = !blocked && !running && !(offline && !ready);

  return (
    <div className="menu-offline-pack">
      <button
        type="button"
        className={[
          'menu-offline-pack__btn',
          ready ? 'menu-offline-pack__btn--ready' : '',
          running ? 'menu-offline-pack__btn--running' : '',
          blocked ? 'menu-offline-pack__btn--blocked' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        disabled={!canClick}
        onClick={() => {
          if (ready) void refreshOfflinePackStatus();
          else void downloadOfflinePack({ force: false });
        }}
        aria-busy={running}
      >
        <span className="menu-offline-pack__btn-title">{label}</span>
        <span className="menu-offline-pack__btn-sub">{sub}</span>
        {(running || (cached > 0 && !ready && !blocked)) && (
          <span className="menu-offline-pack__bar" aria-hidden>
            <span className="menu-offline-pack__bar-fill" style={{ width: `${pct}%` }} />
          </span>
        )}
      </button>
      {blocked && status?.blockReason ? (
        <p className="menu-offline-pack__err" role="status">
          {status.blockReason}
        </p>
      ) : null}
      {!blocked && status?.lastError && !ready ? (
        <p className="menu-offline-pack__err" role="status">
          {status.lastError}
        </p>
      ) : null}
    </div>
  );
}
