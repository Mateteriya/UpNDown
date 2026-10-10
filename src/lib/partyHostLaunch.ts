/**
 * Запуск панели / режима «Свой хост» с главной (спец. вечеринка).
 * Сервер Node поднимается только на ПК через панель :3927;
 * «скачивать дистрибутив сервера» гостю не нужно — гости открывают игру по QR в браузере.
 */

import { Capacitor } from '@capacitor/core';

/** URL панели хоста на этом ПК (control panel :3927). Override: VITE_HOST_CONTROL_URL */
export function getHostControlPanelUrl(): string {
  const fromEnv = (import.meta.env.VITE_HOST_CONTROL_URL as string | undefined)?.trim();
  if (fromEnv) return fromEnv.replace(/\/?$/, '/');
  return 'http://127.0.0.1:3927/';
}

export type PartyHostLaunchResult =
  | { ok: true; url: string }
  | { ok: false; reason: 'mobile' | 'native' | 'panel_down'; url: string };

/** Телефон / узкий viewport — сервер вечеринки здесь не стартует. */
export function isPartyHostLaunchBlockedOnDevice(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const platform = Capacitor.getPlatform();
    if (platform === 'android' || platform === 'ios') return true;
  } catch {
    /* web */
  }
  if (window.matchMedia('(max-width: 1024px)').matches) return true;
  const ua = navigator.userAgent || '';
  if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua) && !/Windows|Macintosh|Linux/i.test(ua)) {
    return true;
  }
  return false;
}

/** Жива ли панель control (:3927). Без неё кнопка в меню только путает. */
export async function probeHostControlPanel(timeoutMs = 900): Promise<boolean> {
  const base = getHostControlPanelUrl();
  try {
    const r = await fetch(new URL('api/status', base).href, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return false;
    const j = (await r.json()) as { ok?: boolean; panelRev?: number };
    return !!j?.ok && typeof j.panelRev === 'number';
  } catch {
    return false;
  }
}

/**
 * Открыть панель хоста на ПК (всегда http://127.0.0.1:3927 — не старый /host).
 * На мобилке / native — reason; если панель не запущена — panel_down.
 */
export async function openPartyHostPanel(): Promise<PartyHostLaunchResult> {
  if (typeof window === 'undefined') return { ok: false, reason: 'mobile', url: '' };

  if (isPartyHostLaunchBlockedOnDevice()) {
    try {
      if (Capacitor.isNativePlatform()) {
        return { ok: false, reason: 'native', url: '' };
      }
    } catch {
      /* */
    }
    return { ok: false, reason: 'mobile', url: '' };
  }

  const url = getHostControlPanelUrl();
  const up = await probeHostControlPanel();
  if (!up) {
    return { ok: false, reason: 'panel_down', url };
  }

  try {
    window.open(url, '_blank', 'noopener,noreferrer');
    return { ok: true, url };
  } catch {
    window.location.href = url;
    return { ok: true, url };
  }
}
