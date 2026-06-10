/**
 * Транспорт онлайн-игры: Supabase (облако) или WebSocket (локальный / VPS сервер).
 */

import { getWsProtocolOverride, getWsUrlOverride, hasWsTransportOverride } from './lanJoinLink';

export type OnlineTransport = 'supabase' | 'ws';
export type WsProtocol = 'v1' | 'v2';

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

/** Протокол WS: v2 = server-authoritative команды. */
export function getWsProtocol(): WsProtocol {
  const override = getWsProtocolOverride();
  if (override) return override;
  const raw = (import.meta.env.VITE_WS_PROTOCOL as string | undefined)?.trim().toLowerCase();
  if (raw === 'v2' || raw === '2') return 'v2';
  return 'v1';
}

export function isWsProtocolV2(): boolean {
  if (!isWsOnlineTransport()) return false;
  if (getWsProtocol() === 'v2') return true;
  /** Сборка dist-host: env зашит при build:host-game */
  const baked = (import.meta.env.VITE_WS_PROTOCOL as string | undefined)?.trim().toLowerCase();
  if (baked === 'v2' || baked === '2') return true;
  return false;
}

/**
 * LAN / VPS WebSocket: server-authoritative v2 (команды, не update_state).
 * Все WS-комнаты с 2026-06 — v2; v1 WS-путь для игры отключён.
 */
export function isServerAuthoritativeOnline(): boolean {
  return isWsOnlineTransport();
}
