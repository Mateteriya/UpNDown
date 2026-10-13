/**
 * Token URL для custom:vkid.
 * - authorization_code: sealed bridge code → VK (+ device_id)
 * - refresh_token: sealed refresh (VK rt + device_id) → VK
 *
 * Ответ нормализуем под GoTrue:
 * - не отдаём id_token (нет JWKS → сессия «вспыхивает» и слетает)
 * - expires_in=0 от VK → подставляем 3600 (иначе шторм TOKEN_REFRESHED)
 * - refresh_token пакуем с device_id
 *
 * verify_jwt = false
 */
import {
  bridgeRedirectUri,
  bridgeSecret,
  openBridgeCode,
  openRefreshToken,
  sealRefreshToken,
} from '../_shared/vkOAuthBridge.ts';

function resolveVkRedirectUri(stored: string, reqUrl: string): string {
  if (stored === 'b' || stored === 'bridge') {
    return bridgeRedirectUri(reqUrl);
  }
  return stored;
}

async function readForm(req: Request): Promise<URLSearchParams> {
  const ct = req.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const j = (await req.json()) as Record<string, string>;
    return new URLSearchParams(Object.entries(j).map(([k, v]) => [k, String(v ?? '')]));
  }
  const text = await req.text();
  return new URLSearchParams(text);
}

function jsonError(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

async function callVkToken(body: URLSearchParams): Promise<
  { ok: true; raw: Record<string, unknown> } | { ok: false; status: number; raw: Record<string, unknown> | string }
> {
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
    return { ok: false, status: vkRes.status, raw: rawText.slice(0, 300) };
  }
  if (!vkRes.ok || raw.error) return { ok: false, status: vkRes.status, raw };
  return { ok: true, raw };
}

async function toGoTrueTokenResponse(
  raw: Record<string, unknown>,
  deviceId: string,
  secret: string,
): Promise<Record<string, unknown>> {
  const access = typeof raw.access_token === 'string' ? raw.access_token : '';
  if (!access) throw new Error('vk_missing_access_token');

  const vkRefresh = typeof raw.refresh_token === 'string' ? raw.refresh_token : '';
  let refreshOut = vkRefresh;
  if (vkRefresh && deviceId) {
    refreshOut = await sealRefreshToken(
      {
        rt: vkRefresh,
        d: deviceId,
        e: Math.floor(Date.now() / 1000) + 90 * 24 * 3600,
      },
      secret,
    );
  }

  let expiresIn = Number(raw.expires_in);
  if (!Number.isFinite(expiresIn) || expiresIn <= 0) expiresIn = 3600;

  return {
    access_token: access,
    token_type: typeof raw.token_type === 'string' ? raw.token_type : 'bearer',
    expires_in: expiresIn,
    refresh_token: refreshOut || undefined,
    scope: typeof raw.scope === 'string' ? raw.scope : undefined,
    // намеренно БЕЗ id_token — иначе GoTrue валит OIDC без JWKS
  };
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
    return jsonError(405, { error: 'method_not_allowed' });
  }

  const form = await readForm(req);
  const grant = form.get('grant_type') || '';
  const clientId = form.get('client_id') || '';
  const clientSecret = form.get('client_secret') || '';

  let secret: string;
  try {
    secret = bridgeSecret();
  } catch {
    return jsonError(500, { error: 'server_error', error_description: 'missing_bridge_secret' });
  }

  if (!clientId) {
    return jsonError(400, { error: 'invalid_request', need: ['client_id'] });
  }

  if (grant === 'refresh_token') {
    const sealedRt = form.get('refresh_token') || '';
    if (!sealedRt) {
      return jsonError(400, { error: 'invalid_request', need: ['refresh_token'] });
    }
    let pack: Awaited<ReturnType<typeof openRefreshToken>>;
    try {
      pack = await openRefreshToken(sealedRt, secret);
    } catch (e) {
      return jsonError(400, {
        error: 'invalid_grant',
        error_description: e instanceof Error ? e.message : 'bad_refresh_seal',
      });
    }
    const body = new URLSearchParams();
    body.set('grant_type', 'refresh_token');
    body.set('refresh_token', pack.rt);
    body.set('device_id', pack.d);
    body.set('client_id', clientId);
    if (clientSecret) body.set('client_secret', clientSecret);
    body.set('state', crypto.randomUUID());

    const vk = await callVkToken(body);
    if (!vk.ok) {
      return jsonError(400, {
        error: 'invalid_grant',
        error_description: 'vk_refresh_failed',
        vk_status: vk.status,
        vk: vk.raw,
      });
    }
    try {
      const out = await toGoTrueTokenResponse(vk.raw, pack.d, secret);
      return new Response(JSON.stringify(out), {
        status: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    } catch (e) {
      return jsonError(502, {
        error: 'server_error',
        error_description: e instanceof Error ? e.message : 'normalize_failed',
      });
    }
  }

  if (grant !== 'authorization_code') {
    return jsonError(400, { error: 'unsupported_grant_type', grant });
  }

  const sealed = form.get('code') || '';
  const codeVerifier = form.get('code_verifier') || '';
  if (!sealed) {
    return jsonError(400, { error: 'invalid_request', need: ['code'] });
  }

  let payload: Awaited<ReturnType<typeof openBridgeCode>>;
  try {
    payload = await openBridgeCode(sealed, secret);
  } catch (e) {
    return jsonError(400, {
      error: 'invalid_grant',
      error_description: e instanceof Error ? e.message : 'bad_bridge_code',
    });
  }

  const body = new URLSearchParams();
  body.set('grant_type', 'authorization_code');
  body.set('code', payload.c);
  body.set('device_id', payload.d);
  body.set('redirect_uri', resolveVkRedirectUri(payload.r, req.url));
  body.set('client_id', clientId);
  if (clientSecret) body.set('client_secret', clientSecret);
  if (codeVerifier) body.set('code_verifier', codeVerifier);
  body.set('state', crypto.randomUUID());

  const vk = await callVkToken(body);
  if (!vk.ok) {
    return jsonError(400, {
      error: typeof vk.raw === 'object' && vk.raw && 'error' in vk.raw
        ? String((vk.raw as { error?: string }).error)
        : 'invalid_grant',
      error_description: 'vk_token_failed',
      vk_status: vk.status,
      vk: vk.raw,
    });
  }

  try {
    const out = await toGoTrueTokenResponse(vk.raw, payload.d, secret);
    return new Response(JSON.stringify(out), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  } catch (e) {
    return jsonError(502, {
      error: 'server_error',
      error_description: e instanceof Error ? e.message : 'normalize_failed',
    });
  }
});
