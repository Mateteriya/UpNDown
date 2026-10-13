/**
 * Redirect URI для VK ID.
 * code + device_id → sealed code → Supabase /auth/v1/callback с исходным state.
 *
 * verify_jwt = false
 */
import {
  bridgeSecret,
  sealBridgeCode,
  unpackAuthState,
} from '../_shared/vkOAuthBridge.ts';

function supabaseAuthCallback(): string {
  const base = (Deno.env.get('SUPABASE_URL') || Deno.env.get('SB_URL') || '')
    .replace(/\/$/, '')
    .replace(/^http:\/\//i, 'https://');
  if (base) return `${base}/auth/v1/callback`;
  return '';
}

function redirectError(callback: string, desc: string): Response {
  const u = new URL(callback);
  u.searchParams.set('error', 'server_error');
  u.searchParams.set('error_code', 'unexpected_failure');
  u.searchParams.set('error_description', desc);
  return Response.redirect(u.toString(), 302);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const src = new URL(req.url);
  const err = src.searchParams.get('error') || src.searchParams.get('error_description');
  const stateRaw = src.searchParams.get('state') || '';

  /** Новый путь: state = UUID GoTrue. Старый: base64 pack {s,cb}. */
  let goTrueState = stateRaw;
  let callback = supabaseAuthCallback();
  if (!callback) {
    try {
      const pack = unpackAuthState(stateRaw);
      goTrueState = pack.s;
      callback = pack.cb;
    } catch {
      return new Response(
        JSON.stringify({
          error: 'missing_supabase_url',
          hint: 'SUPABASE_URL must be set on Edge, or use legacy packed state',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } },
      );
    }
  } else if (stateRaw.length > 80) {
    /** На всякий случай всё ещё понимаем старый pack. */
    try {
      const pack = unpackAuthState(stateRaw);
      goTrueState = pack.s;
      if (pack.cb) callback = pack.cb;
    } catch {
      /* leave as raw UUID / opaque */
    }
  }

  if (!callback) {
    return new Response(JSON.stringify({ error: 'no_callback' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (err) {
    return redirectError(callback, String(err).slice(0, 200));
  }

  const code = src.searchParams.get('code') || '';
  const deviceId = src.searchParams.get('device_id') || '';
  if (!code || !deviceId) {
    return redirectError(
      callback,
      'VK bridge: missing code or device_id (Unable to exchange without device_id)',
    );
  }
  if (!goTrueState) {
    return redirectError(callback, 'VK bridge: missing state');
  }

  let secret: string;
  try {
    secret = bridgeSecret();
  } catch {
    return redirectError(callback, 'VK bridge: missing bridge secret');
  }

  /** Короткий seal: r='b' → token подставит полный bridge URL. */
  const sealed = await sealBridgeCode(
    {
      c: code,
      d: deviceId,
      r: 'b',
      e: Math.floor(Date.now() / 1000) + 5 * 60,
    },
    secret,
  );

  const dest = new URL(callback);
  dest.searchParams.set('code', sealed);
  dest.searchParams.set('state', goTrueState);
  return Response.redirect(dest.toString(), 302);
});
