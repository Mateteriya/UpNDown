/**
 * Лёгкий VK bridge boot для auth-callback — без createClient/supabase (~200KB).
 * LAN/.ru: exchange → сразу hop с #tokens. Online-only: возвращает tokens для setSession.
 */

import { isSafeLanAuthCallbackUrl, VK_LAN_FINAL_RET_KEY } from './vkBridgeSafeUrl';

const PKCE_STORAGE_PREFIX = 'updown_vk_pkce_';

export type VkBridgeBootResult =
  | { kind: 'skip' }
  | { kind: 'hop'; url: string }
  | { kind: 'session'; access_token: string; refresh_token: string }
  | { kind: 'error'; message: string };

function readVerifier(nonce: string): string {
  let verifier = '';
  try {
    verifier = sessionStorage.getItem(PKCE_STORAGE_PREFIX + nonce) || '';
    sessionStorage.removeItem(PKCE_STORAGE_PREFIX + nonce);
  } catch {
    /* ignore */
  }
  if (!verifier && typeof document !== 'undefined') {
    try {
      const key = `${PKCE_STORAGE_PREFIX}${nonce}=`;
      const row = document.cookie
        .split(';')
        .map((s) => s.trim())
        .find((s) => s.startsWith(key));
      if (row) {
        verifier = decodeURIComponent(row.slice(key.length));
        document.cookie = `${PKCE_STORAGE_PREFIX}${nonce}=; Max-Age=0; Path=/; Secure; SameSite=Lax`;
      }
    } catch {
      /* ignore */
    }
  }
  return verifier;
}

function exchangeUrl(): string {
  const base = String(import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/functions/v1/vk-oauth-exchange`;
}

/** Вызвать с auth-callback при ?vk_bridge=1 — до import supabase. */
export async function runVkBridgeBoot(href: string): Promise<VkBridgeBootResult> {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return { kind: 'error', message: 'bad_url' };
  }
  if (url.searchParams.get('vk_bridge') !== '1') return { kind: 'skip' };

  const code = url.searchParams.get('code') || '';
  const deviceId = url.searchParams.get('device_id') || '';
  const nonce = url.searchParams.get('state') || '';
  if (!code || !deviceId || !nonce) {
    return { kind: 'error', message: 'VK bridge: нет code / device_id / state' };
  }

  const verifier = readVerifier(nonce);
  if (!verifier) {
    return {
      kind: 'error',
      message:
        'VK: потерян PKCE verifier (другая вкладка / Incognito). Начните вход с той же вкладки снова.',
    };
  }

  if (!import.meta.env.VITE_SUPABASE_URL) {
    return { kind: 'error', message: 'VITE_SUPABASE_URL не задан' };
  }

  let res: Response;
  try {
    res = await fetch(exchangeUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        device_id: deviceId,
        code_verifier: verifier,
      }),
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e);
    return {
      kind: 'error',
      message: `VK: нет связи с Supabase (${detail}). Из РФ часто ERR_CONNECTION_CLOSED — VPN или повтор.`,
    };
  }

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      (typeof raw.hint === 'string' && raw.hint) ||
      (typeof raw.message === 'string' && raw.message) ||
      (typeof raw.error === 'string' && raw.error) ||
      `VK exchange HTTP ${res.status}`;
    return { kind: 'error', message: msg };
  }

  const access = raw.access_token;
  const refresh = raw.refresh_token;
  if (typeof access !== 'string' || typeof refresh !== 'string') {
    return { kind: 'error', message: 'VK exchange: нет access/refresh token' };
  }

  let lanFinal = '';
  try {
    lanFinal = sessionStorage.getItem(VK_LAN_FINAL_RET_KEY) || '';
    sessionStorage.removeItem(VK_LAN_FINAL_RET_KEY);
  } catch {
    /* ignore */
  }

  if (lanFinal && isSafeLanAuthCallbackUrl(lanFinal)) {
    try {
      const here = window.location.origin;
      const destOrigin = new URL(lanFinal).origin;
      if (destOrigin !== here) {
        const dest = new URL(lanFinal);
        dest.hash = new URLSearchParams({
          access_token: access,
          refresh_token: refresh,
          token_type: 'bearer',
          type: 'bearer',
        }).toString();
        return { kind: 'hop', url: dest.toString() };
      }
    } catch {
      /* fall through to session */
    }
  }

  return { kind: 'session', access_token: access, refresh_token: refresh };
}
