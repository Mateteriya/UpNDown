/**
 * Supabase client для авторизации и (позже) онлайна.
 * Требует VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_AUTH_TIMEOUT_MS, SUPABASE_REST_TIMEOUT_MS } from './networkTimeouts';

function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
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
    return fetch(input, { ...init, signal: controller.signal }).finally(() => {
      clearTimeout(t);
      parent.removeEventListener('abort', onParentAbort);
    });
  }
  return fetch(input, { ...init, signal: controller.signal }).finally(() => clearTimeout(t));
}

/**
 * REST — длинный таймаут (запись стола).
 * Auth — короткий: без сети refresh не должен блокировать офлайн-игру.
 */
function fetchForSupabase(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  let href = '';
  if (typeof input === 'string') href = input;
  else if (typeof URL !== 'undefined' && input instanceof URL) href = input.href;
  else if (typeof Request !== 'undefined' && input instanceof Request) href = input.url;
  if (/\/auth\/v1\b/i.test(href)) return fetchWithTimeout(input, init, SUPABASE_AUTH_TIMEOUT_MS);
  return fetchWithTimeout(input, init, SUPABASE_REST_TIMEOUT_MS);
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
