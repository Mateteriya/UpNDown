/**
 * Транспорт онлайн-игры: Supabase (облако) или WebSocket (локальный / VPS сервер).
 */

import { getWsUrlOverride, hasWsTransportOverride } from './lanJoinLink';

export type OnlineTransport = 'supabase' | 'ws';

export function getOnlineTransport(): OnlineTransport {
  if (hasWsTransportOverride()) return 'ws';
  const raw = (import.meta.env.VITE_ONLINE_TRANSPORT as string | undefined)?.trim().toLowerCase();
  if (raw === 'ws' || raw === 'websocket') return 'ws';
  return 'supabase';
}

export function isWsOnlineTransport(): boolean {
  return getOnlineTransport() === 'ws';
}

export function getWsUrl(): string | null {
  const override = getWsUrlOverride();
  if (override) return override;
  const url = (import.meta.env.VITE_WS_URL as string | undefined)?.trim();
  return url || null;
}

export function isWsOnlineConfigured(): boolean {
  return isWsOnlineTransport() && !!getWsUrl();
}
