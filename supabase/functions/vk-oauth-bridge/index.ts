/**
 * Redirect URI для VK ID (указать в кабинете VK вместо /auth/v1/callback).
 * Ловит code + device_id → sealed code → редирект на Supabase /auth/v1/callback.
 *
 * verify_jwt = false
 * Deploy: npx supabase functions deploy vk-oauth-bridge --project-ref jrgnsqbwwhovonxyxown
 */
import {
  bridgeRedirectUri,
  bridgeSecret,
  sealBridgeCode,
  unpackAuthState,
} from '../_shared/vkOAuthBridge.ts';

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
  let pack: { s: string; cb: string };
  try {
    pack = unpackAuthState(stateRaw);
  } catch {
    return new Response(
      JSON.stringify({ error: 'bad_state', hint: 'state from VK is not our pack' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (err) {
    return redirectError(pack.cb, String(err).slice(0, 200));
  }

  const code = src.searchParams.get('code') || '';
  const deviceId = src.searchParams.get('device_id') || '';
  if (!code || !deviceId) {
    return redirectError(
      pack.cb,
      'VK bridge: missing code or device_id (Unable to exchange without device_id)',
    );
  }

  let secret: string;
  try {
    secret = bridgeSecret();
  } catch {
    return redirectError(pack.cb, 'VK bridge: missing VK_OAUTH_BRIDGE_SECRET / service role');
  }

  const bridgeUri = bridgeRedirectUri(req.url);
  const sealed = await sealBridgeCode(
    {
      c: code,
      d: deviceId,
      r: bridgeUri,
      e: Math.floor(Date.now() / 1000) + 5 * 60,
    },
    secret,
  );

  const dest = new URL(pack.cb);
  dest.searchParams.set('code', sealed);
  dest.searchParams.set('state', pack.s);
  return Response.redirect(dest.toString(), 302);
});
