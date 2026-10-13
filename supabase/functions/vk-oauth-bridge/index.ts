/**
 * Redirect URI для VK ID (кабинет VK).
 * Прямой вход (без GoTrue): code+device_id → auth-callback игры.
 * state = base64url({ n: nonce, ret: https://…/auth-callback.html })
 *
 * verify_jwt = false
 */
import { bytesFromB64url } from '../_shared/vkOAuthBridge.ts';

const td = new TextDecoder();

type DirectState = { n: string; ret: string };

function parseDirectState(raw: string): DirectState | null {
  try {
    const pack = JSON.parse(td.decode(bytesFromB64url(raw))) as DirectState;
    if (!pack?.n || !pack?.ret) return null;
    if (!/^https?:\/\//i.test(pack.ret)) return null;
    if (!/auth-callback\.html/i.test(pack.ret)) return null;
    return pack;
  } catch {
    return null;
  }
}

function redirectError(ret: string, desc: string): Response {
  const u = new URL(ret);
  u.searchParams.set('error', 'server_error');
  u.searchParams.set('error_code', 'vk_bridge');
  u.searchParams.set('error_description', desc.slice(0, 200));
  return Response.redirect(u.toString(), 302);
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const src = new URL(req.url);
  const stateRaw = src.searchParams.get('state') || '';
  const pack = parseDirectState(stateRaw);
  if (!pack) {
    return new Response(
      JSON.stringify({
        error: 'bad_state',
        hint: 'Expected direct VK state {n,ret}. Start login from the game button again.',
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const err = src.searchParams.get('error') || src.searchParams.get('error_description');
  if (err) return redirectError(pack.ret, String(err));

  const code = src.searchParams.get('code') || '';
  const deviceId = src.searchParams.get('device_id') || '';
  if (!code || !deviceId) {
    return redirectError(pack.ret, 'missing code or device_id');
  }

  const dest = new URL(pack.ret);
  dest.searchParams.set('vk_bridge', '1');
  dest.searchParams.set('code', code);
  dest.searchParams.set('device_id', deviceId);
  dest.searchParams.set('state', pack.n);
  return Response.redirect(dest.toString(), 302);
});
