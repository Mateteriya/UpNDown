/**
 * VK code → Supabase session tokens (общий для exchange POST и bridge GET).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { bridgeRedirectUri } from './vkOAuthBridge.ts';

export type VkExchangeOk = {
  ok: true;
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  token_type?: string;
  user: { id: string; email?: string };
};

export type VkExchangeErr = {
  ok: false;
  status: number;
  body: Record<string, unknown>;
};

export async function exchangeVkCodeToSession(opts: {
  reqUrl: string;
  code: string;
  deviceId: string;
  codeVerifier: string;
}): Promise<VkExchangeOk | VkExchangeErr> {
  const { reqUrl, code, deviceId, codeVerifier } = opts;
  if (!code || !deviceId || !codeVerifier) {
    return { ok: false, status: 400, body: { error: 'invalid_request', need: ['code', 'device_id', 'code_verifier'] } };
  }

  const clientId = Deno.env.get('VK_CLIENT_ID') || Deno.env.get('VKID_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('VK_CLIENT_SECRET') || Deno.env.get('VKID_CLIENT_SECRET') || '';
  if (!clientId) return { ok: false, status: 500, body: { error: 'missing_vk_client_id' } };

  const redirectUri = bridgeRedirectUri(reqUrl);

  const tokenBody = new URLSearchParams();
  tokenBody.set('grant_type', 'authorization_code');
  tokenBody.set('code', code);
  tokenBody.set('device_id', deviceId);
  tokenBody.set('redirect_uri', redirectUri);
  tokenBody.set('client_id', clientId);
  tokenBody.set('code_verifier', codeVerifier);
  tokenBody.set('state', crypto.randomUUID());
  if (clientSecret) tokenBody.set('client_secret', clientSecret);

  const tokenRes = await fetch('https://id.vk.ru/oauth2/auth', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: tokenBody,
  });
  const tokenText = await tokenRes.text();
  let tokenJson: Record<string, unknown>;
  try {
    tokenJson = JSON.parse(tokenText) as Record<string, unknown>;
  } catch {
    return { ok: false, status: 502, body: { error: 'vk_token_not_json', body: tokenText.slice(0, 300) } };
  }
  if (!tokenRes.ok || tokenJson.error || typeof tokenJson.access_token !== 'string') {
    return { ok: false, status: 400, body: { error: 'vk_token_failed', vk: tokenJson } };
  }
  const accessToken = tokenJson.access_token;

  function emailFromIdToken(idToken: unknown): string {
    if (typeof idToken !== 'string' || !idToken.includes('.')) return '';
    try {
      const payload = idToken.split('.')[1] || '';
      const pad = payload.length % 4 === 0 ? '' : '='.repeat(4 - (payload.length % 4));
      const b64 = payload.replace(/-/g, '+').replace(/_/g, '/') + pad;
      const claims = JSON.parse(atob(b64)) as Record<string, unknown>;
      if (typeof claims.email === 'string') return claims.email;
      if (typeof claims.email_address === 'string') return claims.email_address;
      return '';
    } catch {
      return '';
    }
  }

  async function fetchVkUser(path: string): Promise<Record<string, unknown> | null> {
    const uiBody = new URLSearchParams();
    uiBody.set('access_token', accessToken);
    uiBody.set('client_id', clientId);
    const uiRes = await fetch(`https://id.vk.ru/oauth2/${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: uiBody,
    });
    const uiText = await uiRes.text();
    try {
      const parsed = JSON.parse(uiText) as Record<string, unknown>;
      return uiRes.ok ? parsed : null;
    } catch {
      return null;
    }
  }

  const uiJson = (await fetchVkUser('user_info')) || {};
  const publicJson = (await fetchVkUser('public_info')) || {};

  const userObj =
    uiJson.user && typeof uiJson.user === 'object'
      ? (uiJson.user as Record<string, unknown>)
      : publicJson.user && typeof publicJson.user === 'object'
        ? (publicJson.user as Record<string, unknown>)
        : uiJson;
  const vkId =
    userObj.user_id != null
      ? String(userObj.user_id)
      : userObj.id != null
        ? String(userObj.id)
        : tokenJson.user_id != null
          ? String(tokenJson.user_id)
          : '';

  const emailRaw =
    (typeof userObj.email === 'string' && userObj.email) ||
    (typeof uiJson.email === 'string' && uiJson.email) ||
    (typeof publicJson.email === 'string' && publicJson.email) ||
    emailFromIdToken(tokenJson.id_token) ||
    '';
  const email = emailRaw.trim().toLowerCase() || (vkId ? `vkid_${vkId}@users.vkid.up2down.local` : '');
  if (!email) {
    return {
      ok: false,
      status: 400,
      body: {
        error: 'vk_identity_missing',
        hint: 'VK не вернул user_id и email.',
        user_keys: Object.keys(userObj),
      },
    };
  }
  const emailIsSynthetic = /@users\.vkid\.up2down\.local$/i.test(email);

  const first = typeof userObj.first_name === 'string' ? userObj.first_name : '';
  const last = typeof userObj.last_name === 'string' ? userObj.last_name : '';
  const name = [first, last].filter(Boolean).join(' ').trim() || email.split('@')[0];
  const avatar =
    (typeof userObj.avatar === 'string' && userObj.avatar) ||
    (typeof userObj.picture === 'string' ? userObj.picture : undefined);

  const supabaseUrl = (Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return { ok: false, status: 500, body: { error: 'missing_supabase_env' } };
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const meta = {
    full_name: name,
    name,
    avatar_url: avatar,
    picture: avatar,
    vkid: vkId || undefined,
    vkid_email_synthetic: emailIsSynthetic || undefined,
  };

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: meta,
    app_metadata: { provider: 'vkid', providers: ['vkid'] },
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message || '')) {
    return { ok: false, status: 502, body: { error: 'create_user_failed', message: created.error.message } };
  }
  if (created.data?.user?.id) {
    await admin.auth.admin.updateUserById(created.data.user.id, {
      user_metadata: meta,
      app_metadata: { provider: 'vkid', providers: ['vkid'] },
    });
  }

  const link = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email,
  });
  if (link.error || !link.data?.properties?.hashed_token) {
    return {
      ok: false,
      status: 502,
      body: { error: 'generate_link_failed', message: link.error?.message || 'no hashed_token' },
    };
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session) {
    return {
      ok: false,
      status: 502,
      body: { error: 'verify_otp_failed', message: verified.error?.message || 'no session' },
    };
  }

  const s = verified.data.session;
  return {
    ok: true,
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in,
    token_type: s.token_type || 'bearer',
    user: { id: s.user.id, email: s.user.email },
  };
}
