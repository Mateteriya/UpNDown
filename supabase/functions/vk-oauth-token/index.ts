/**
 * Token URL для custom:vkid.
 * GoTrue шлёт обычный OAuth code exchange; мы распаковываем sealed code
 * (vk code + device_id) и меняем у id.vk.ru/oauth2/auth.
 *
 * verify_jwt = false
 * Deploy: npx supabase functions deploy vk-oauth-token --project-ref jrgnsqbwwhovonxyxown
 */
import { bridgeSecret, openBridgeCode } from '../_shared/vkOAuthBridge.ts';

async function readForm(req: Request): Promise<URLSearchParams> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = (await req.json()) as Record<string, string>;
    return new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v ?? '')]));
  }
  const text = await req.text();
  return new URLSearchParams(text);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, content-type',
      },
    });
  }
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const form = await readForm(req);
  const grant = form.get('grant_type') || '';
  const sealed = form.get('code') || '';
  const codeVerifier = form.get('code_verifier') || '';
  const clientId = form.get('client_id') || '';
  const clientSecret = form.get('client_secret') || '';

  if (grant !== 'authorization_code') {
    return new Response(JSON.stringify({ error: 'unsupported_grant_type', grant }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (!sealed || !clientId) {
    return new Response(JSON.stringify({ error: 'invalid_request', need: ['code', 'client_id'] }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let secret: string;
  try {
    secret = bridgeSecret();
  } catch {
    return new Response(JSON.stringify({ error: 'server_error', error_description: 'missing_bridge_secret' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let payload: Awaited<ReturnType<typeof openBridgeCode>>;
  try {
    payload = await openBridgeCode(sealed, secret);
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: 'invalid_grant',
        error_description: e instanceof Error ? e.message : 'bad_bridge_code',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', payload.c);
  body.set('device_id', payload.d);
  body.set('redirect_uri', payload.r);
  body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  body.set('state', crypto.randomUUID());

  const vkRes = await fetch('https://id.vk.ru/oauth2/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });

  const rawText = await vkRes.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return new Response(
      JSON.stringify({
        error: 'server_error',
        error_description: 'vk_token_not_json',
        status: vkRes.status,
        body: rawText.slice(0, 300),
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!vkRes.ok || raw.error) {
    return new Response(
      JSON.stringify({
        error: typeof raw.error === 'string' ? raw.error : 'invalid_grant',
        error_description:
          (typeof raw.error_description === 'string' && raw.error_description) ||
          (typeof raw.error === 'string' ? raw.error : 'vk_token_failed'),
        vk_status: vkRes.status,
        vk: raw,
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  // GoTrue ждёт стандартный OAuth token JSON
  return new Response(JSON.stringify(raw), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
