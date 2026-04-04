/**
 * Supabase client для авторизации и (позже) онлайна.
 * Требует VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Иначе на части мобильных сетей fetch может висеть без ответа — UI застревает в «Создание…». */
const FETCH_TIMEOUT_MS = 55_000;

function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  const parent = init?.signal;
  if (parent) {
    if (parent.aborted) {
      clearTimeout(t);
      return Promise.reject(parent.reason ?? new DOMException('Aborted', 'AbortError'));
    }
    const onParentAbort = () => {
      clearTimeout(t);
      controller.abort(parent.reason);
    };
    parent.addEventListener('abort', onParentAbort);
    return fetch(input, { ...init, signal: controller.signal })
      .finally(() => {
        clearTimeout(t);
        parent.removeEventListener('abort', onParentAbort);
      });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

/** Auth (OAuth URL, setSession, refresh) без искусственного 55s — иначе на VPN/медленной сети два подряд вызова ≈ 2 мин ожидания. */
function fetchForSupabase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let href = '';
  if (typeof input === 'string') href = input;
  else if (typeof URL !== 'undefined' && input instanceof URL) href = input.href;
  else if (typeof Request !== 'undefined' && input instanceof Request) href = input.url;
  if (href.includes('/auth/v1/')) return fetch(input, init);
  return fetchWithTimeout(input, init);
}

let _supabase: SupabaseClient | null = null;

try {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim();
  const anonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim();
  if (url && anonKey && url.startsWith('http')) {
    _supabase = createClient(url, anonKey, {
      global: { fetch: fetchForSupabase },
    });
  }
} catch {
  _supabase = null;
}

export const supabase = _supabase;

export const isSupabaseConfigured = (): boolean => !!supabase;
