/**
 * Vite :5173 — только разработка. Семья/гости должны играть с хоста :3001/play/.
 */
import { useEffect, useState } from 'react';

function isViteDevPartyMistake(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    const port = location.port;
    const path = location.pathname || '';
    if (path.startsWith('/play')) return false;
    if (port === '3001' || port === '3002' || port === '3003') return false;
    /* :5173 / :5174 / без порта на localhost с Vite */
    if (port === '5173' || port === '5174' || port === '') return true;
    return true;
  } catch {
    return false;
  }
}

export function LanDevPartyHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    setShow(isViteDevPartyMistake());
  }, []);
  if (!show) return null;
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        zIndex: 99999,
        left: 0,
        right: 0,
        top: 0,
        padding: '10px 14px',
        background: '#7f1d1d',
        color: '#fecaca',
        font: '600 13px/1.35 system-ui,sans-serif',
        textAlign: 'center',
        boxShadow: '0 2px 12px rgba(0,0,0,.35)',
      }}
    >
      Это Vite (:{typeof location !== 'undefined' ? location.port || '5173' : '5173'}) — только для правки кода.
      {' '}
      Домашняя вечеринка: на ПК <code style={{ color: '#fff' }}>npm run party</code> → QR →{' '}
      <strong style={{ color: '#fff' }}>http://IP:3001/play/</strong>
      {' '}
      (без :5173). Иначе при выключенном Vite карты «пропадут».
      <button
        type="button"
        onClick={() => setShow(false)}
        style={{
          marginLeft: 12,
          border: '1px solid #fca5a5',
          background: 'transparent',
          color: '#fee2e2',
          borderRadius: 6,
          padding: '2px 8px',
          cursor: 'pointer',
        }}
      >
        Скрыть
      </button>
    </div>
  );
}
