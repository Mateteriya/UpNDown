/**
 * Прямой вход VK ID (минуя Supabase custom:vkid / GoTrue state).
 * PKCE на клиенте → VK → bridge → auth-callback → Edge exchange → setSession.
 *
 * На LAN / localhost VK требует «базовый домен» публичного сайта —
 * старт на https://up2down.online/vk-lan-bridge.html → exchange на online
 * auth-callback → hop на LAN auth-callback с #access_token.
 */

import { getLocalAuthCallbackUrl, rememberAuthAppReturn } from './nativeAuth';
import { needsVkidLanBridge } from './oauthProviders';
import { supabase } from './supabase';

const VK_CLIENT_ID =
  (typeof import.meta !== 'undefined' && String(import.meta.env?.VITE_VK_CLIENT_ID || '')) ||
  '54819532';

/** Публичный origin для моста VK←LAN (зеркало можно задать env). */
const VK_LAN_BRIDGE_ORIGIN =
  (typeof import.meta !== 'undefined' &&
    String(import.meta.env?.VITE_PUBLIC_WEB_ORIGIN || '').replace(/\/$/, '')) ||
  'https://up2down.online';

const PKCE_STORAGE_PREFIX = 'updown_vk_pkce_';
export const VK_LAN_FINAL_RET_KEY = 'updown_vk_lan_final_ret';

function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (let i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function randomVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return b64url(bytes);
}

async function challengeS256(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return b64url(digest);
}

function packState(nonce: string, ret: string): string {
  return b64url(new TextEncoder().encode(JSON.stringify({ n: nonce, ret })));
}

function bridgeRedirectUri(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  if (!base) throw new Error('VITE_SUPABASE_URL не задан');
  return `${base}/functions/v1/vk-oauth-bridge`;
}

function exchangeUrl(): string {
  const base = (import.meta.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
  return `${base}/functions/v1/vk-oauth-exchange`;
}

/**
 * Куда можно hop'нуть токены после exchange на online:
 * LAN / loopback, зеркало .ru, preview Vercel — не произвольный URL (open redirect).
 */
export function isSafeLanAuthCallbackUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    if (!/auth-callback\.html/i.test(u.pathname)) return false;
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
    if (h === 'up2down.ru' || h === 'www.up2down.ru') return true;
    if (h === 'up2down.online' || h === 'www.up2down.online') return true;
    if (/\.vercel\.app$/i.test(h)) return true;
    if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) {
      if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
      const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(h);
      if (m) {
        const n = Number(m[1]);
        if (n >= 16 && n <= 31) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

export type VkidCompleteResult = {
  error: Error | null;
  /** После успешного exchange на online — прыжок на LAN с hash-токенами. */
  lanHop?: { url: string; access_token: string; refresh_token: string };
};

export async function startVkidDirectOAuth(): Promise<{ error: Error | null }> {
  try {
    rememberAuthAppReturn();
    const ret = getLocalAuthCallbackUrl();
    if (!ret) return { error: new Error('Нет URL для возврата после VK') };

    /**
     * Не на up2down.online (LAN / .ru / preview): VK «базовый домен» = online.
     * Цепочка: текущий origin → online /vk-lan-bridge.html (PKCE) → VK → Edge
     * → online auth-callback (exchange) → hop на ret #access_token.
     */
    if (needsVkidLanBridge()) {
      const sb = String(import.meta.env?.VITE_SUPABASE_URL || '').replace(/\/$/, '');
      if (!sb) return { error: new Error('VITE_SUPABASE_URL не задан') };
      if (!isSafeLanAuthCallbackUrl(ret)) {
        return { error: new Error('VK: небезопасный URL возврата') };
      }
      const bridgePage = new URL('/vk-lan-bridge.html', VK_LAN_BRIDGE_ORIGIN + '/');
      bridgePage.searchParams.set('ret', ret);
      bridgePage.searchParams.set('sb', sb);
      bridgePage.searchParams.set('cid', VK_CLIENT_ID);
      window.location.assign(bridgePage.toString());
      return { error: null };
    }

    const nonce = crypto.randomUUID();
    const verifier = randomVerifier();
    const challenge = await challengeS256(verifier);
    try {
      sessionStorage.setItem(PKCE_STORAGE_PREFIX + nonce, verifier);
    } catch {
      return { error: new Error('Не удалось сохранить PKCE (хранилище переполнено)') };
    }

    const vk = new URL('https://id.vk.ru/authorize');
    vk.searchParams.set('response_type', 'code');
    vk.searchParams.set('client_id', VK_CLIENT_ID);
    vk.searchParams.set('redirect_uri', bridgeRedirectUri());
    vk.searchParams.set('state', packState(nonce, ret));
    /** Пробел, не запятая — см. доки VK ID scopes. */
    vk.searchParams.set('scope', 'vkid.personal_info email');
    vk.searchParams.set('code_challenge', challenge);
    vk.searchParams.set('code_challenge_method', 'S256');

    window.location.assign(vk.toString());
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }
}

/** Вызвать с auth-callback при ?vk_bridge=1 */
export async function completeVkidDirectOAuthFromUrl(href: string): Promise<VkidCompleteResult> {
  if (!supabase) return { error: new Error('Supabase не настроен') };
  const url = new URL(href);
  if (url.searchParams.get('vk_bridge') !== '1') {
    return { error: new Error('not_vk_bridge') };
  }
  const code = url.searchParams.get('code') || '';
  const deviceId = url.searchParams.get('device_id') || '';
  const nonce = url.searchParams.get('state') || '';
  if (!code || !deviceId || !nonce) {
    return { error: new Error('VK bridge: нет code / device_id / state') };
  }
  let verifier = '';
  try {
    verifier = sessionStorage.getItem(PKCE_STORAGE_PREFIX + nonce) || '';
    sessionStorage.removeItem(PKCE_STORAGE_PREFIX + nonce);
  } catch {
    /* ignore */
  }
  if (!verifier) {
    return {
      error: new Error(
        'VK: потерян PKCE verifier (другая вкладка / Incognito). Начните вход с той же вкладки снова.',
      ),
    };
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
      error: new Error(
        `VK: нет связи с Supabase (${detail}). Из РФ часто ERR_CONNECTION_CLOSED — VPN или повтор позже.`,
      ),
    };
  }
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (typeof raw?.hint === 'string' && raw.hint) ||
      (typeof raw?.message === 'string' && raw.message) ||
      (typeof raw?.error === 'string' && raw.error) ||
      `VK exchange HTTP ${res.status}`;
    return { error: new Error(msg) };
  }
  const access = raw?.access_token;
  const refresh = raw?.refresh_token;
  if (typeof access !== 'string' || typeof refresh !== 'string') {
    return { error: new Error('VK exchange: нет access/refresh token') };
  }

  let lanFinal = '';
  try {
    lanFinal = sessionStorage.getItem(VK_LAN_FINAL_RET_KEY) || '';
    sessionStorage.removeItem(VK_LAN_FINAL_RET_KEY);
  } catch {
    /* ignore */
  }
  /**
   * LAN / .ru hop: НЕ setSession на online — refresh к supabase.co часто
   * висит (ERR_CONNECTION_CLOSED), страница навечно «Завершение входа…».
   * Токены кладём в hash целевого auth-callback.
   */
  if (lanFinal && isSafeLanAuthCallbackUrl(lanFinal)) {
    try {
      const here = typeof window !== 'undefined' ? window.location.origin : '';
      const destOrigin = new URL(lanFinal).origin;
      if (here && destOrigin !== here) {
        return {
          error: null,
          lanHop: { url: lanFinal, access_token: access, refresh_token: refresh },
        };
      }
    } catch {
      return {
        error: null,
        lanHop: { url: lanFinal, access_token: access, refresh_token: refresh },
      };
    }
  }

  try {
    const set = await Promise.race([
      supabase.auth.setSession({ access_token: access, refresh_token: refresh }),
      new Promise<{ error: Error }>((resolve) => {
        window.setTimeout(
          () => resolve({ error: new Error('VK setSession timeout') }),
          12_000,
        );
      }),
    ]);
    if (set.error) return { error: set.error instanceof Error ? set.error : new Error(String(set.error)) };
  } catch (e) {
    return { error: e instanceof Error ? e : new Error(String(e)) };
  }

  try {
    sessionStorage.setItem('updown_from_oauth_redirect', '1');
  } catch {
    /* ignore */
  }
  return { error: null };
}

export function isVkidBridgeCallback(href: string): boolean {
  try {
    return new URL(href).searchParams.get('vk_bridge') === '1';
  } catch {
    return false;
  }
}
