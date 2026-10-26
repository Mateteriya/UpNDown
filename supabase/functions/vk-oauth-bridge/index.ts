/**
 * Redirect URI для VK ID.
 * state = base64url({ n, ret, v?, final? })
 *   ret   — auth-callback (online или тот же origin)
 *   v     — PKCE verifier: обмен ЗДЕСЬ на Edge → hop с #tokens (без второго fetch с телефона)
 *   final — LAN / .ru auth-callback (куда вернуть после обмена)
 *
 * verify_jwt = false
 */
import { bytesFromB64url } from '../_shared/vkOAuthBridge.ts';
import { exchangeVkCodeToSession } from '../_shared/vkExchangeSession.ts';

const td = new TextDecoder();

type DirectState = {
  n: string;
  ret: string;
  /** PKCE verifier — если есть, bridge сам делает exchange. */
  v?: string;
  /** Куда hop после exchange (LAN / .ru). */
  final?: string;
};

function parseDirectState(raw: string): DirectState | null {
  try {
    const pack = JSON.parse(td.decode(bytesFromB64url(raw))) as DirectState;
    if (!pack?.n || !pack?.ret) return null;
    if (!/^https?:\/\//i.test(pack.ret)) return null;
    if (!/auth-callback\.html/i.test(pack.ret)) return null;
    if (pack.final) {
      if (!/^https?:\/\//i.test(pack.final)) return null;
      if (!/auth-callback\.html/i.test(pack.final)) return null;
      if (!isSafeReturnHost(pack.final)) return null;
    }
    if (pack.v != null && (typeof pack.v !== 'string' || pack.v.length < 16 || pack.v.length > 128)) {
      return null;
    }
    if (!isSafeReturnHost(pack.ret)) return null;
    return pack;
  } catch {
    return null;
  }
}

function isSafeReturnHost(raw: string): boolean {
  try {
    const u = new URL(raw);
    const h = u.hostname.toLowerCase();
    if (h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h === '::1') return true;
    if (h === 'up2down.ru' || h === 'www.up2down.ru') return true;
    if (h === 'up2down.online' || h === 'www.up2down.online') return true;
    if (/\.vercel\.app$/i.test(h)) return true;
    if (/^192\.168\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    if (/^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true;
    const m = /^172\.(\d{1,2})\.\d{1,3}\.\d{1,3}$/.exec(h);
    if (m) {
      const n = Number(m[1]);
      if (n >= 16 && n <= 31) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function redirectError(ret: string, desc: string): Response {
  const u = new URL(ret);
  u.searchParams.set('error', 'server_error');
  u.searchParams.set('error_code', 'vk_bridge');
  u.searchParams.set('error_description', desc.slice(0, 200));
  return Response.redirect(u.toString(), 302);
}

/** Тёмный HTML → location.replace: вместо долгой белой вкладки на 302. */
function htmlHop(dest: string, title: string): Response {
  const safe = dest.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const js = JSON.stringify(dest);
  const body = `<!DOCTYPE html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#0f172a;color:#94a3b8;font:15px/1.4 system-ui,sans-serif}.s{width:28px;height:28px;margin:0 auto 14px;border:3px solid #334155;border-top-color:#22d3ee;border-radius:50%;animation:r .7s linear infinite}@keyframes r{to{transform:rotate(360deg)}}</style></head><body><div><div class="s"></div><p>${title}</p></div><script>location.replace(${js})</script><noscript><a href="${safe}">Продолжить</a></noscript></body></html>`;
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

Deno.serve(async (req) => {
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
  if (err) return redirectError(pack.final || pack.ret, String(err));

  const code = src.searchParams.get('code') || '';
  const deviceId = src.searchParams.get('device_id') || '';
  if (!code || !deviceId) {
    return redirectError(pack.final || pack.ret, 'missing code or device_id');
  }

  /** Fast path: обмен на Edge → сразу #tokens на final/ret (телефон не POST'ит в supabase). */
  if (pack.v) {
    const result = await exchangeVkCodeToSession({
      reqUrl: req.url,
      code,
      deviceId,
      codeVerifier: pack.v,
    });
    const destBase = pack.final || pack.ret;
    if (!result.ok) {
      const msg =
        (typeof result.body.hint === 'string' && result.body.hint) ||
        (typeof result.body.message === 'string' && result.body.message) ||
        (typeof result.body.error === 'string' && result.body.error) ||
        'vk_exchange_failed';
      return redirectError(destBase, msg);
    }
    const dest = new URL(destBase);
    dest.hash = new URLSearchParams({
      access_token: result.access_token,
      refresh_token: result.refresh_token,
      token_type: result.token_type || 'bearer',
      type: 'bearer',
    }).toString();
    return htmlHop(dest.toString(), 'Вход…');
  }

  /** Legacy: code на клиент (старые вкладки без v в state). */
  const dest = new URL(pack.ret);
  dest.searchParams.set('vk_bridge', '1');
  dest.searchParams.set('code', code);
  dest.searchParams.set('device_id', deviceId);
  dest.searchParams.set('state', pack.n);
  return Response.redirect(dest.toString(), 302);
});
