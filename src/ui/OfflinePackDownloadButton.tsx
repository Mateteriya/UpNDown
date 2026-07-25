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

export function OfflinePackDownloadButton() {
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
    ? 'Офлайн-скачивание здесь недоступно'
    : running
      ? `Скачиваем… ${cached} / ${total}`
      : ready
        ? `Офлайн готов · ${total} файлов`
        : cached > 0 && cached < total
          ? `Докачать офлайн · ${cached} / ${total}`
          : 'Скачать игру для полного офлайна';

  const sub = blocked
    ? 'Нужен HTTPS-сайт или ярлык с домашнего экрана (не http://IP в Wi‑Fi)'
    : running
      ? 'Не выключайте интернет, пока идёт загрузка'
      : ready
        ? 'Можно в авиарежиме: карты, аватары ИИ, фоны'
        : offline
          ? 'Нужен интернет, чтобы скачать пакет'
          : 'Карты, аватары ИИ и фоны меню — один раз';

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
