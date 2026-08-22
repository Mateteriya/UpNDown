/**
 * Профиль процесса: LAN (домашняя панель /host) vs production WS.
 * Production: NODE_ENV=production или UPDOWN_MODE=prod|production.
 */

export function isProdProfile(): boolean {
  const mode = (process.env.UPDOWN_MODE ?? '').trim().toLowerCase();
  if (mode === 'prod' || mode === 'production') return true;
  return (process.env.NODE_ENV ?? '').trim() === 'production';
}
