/**
 * Клиент (auth-callback) шлёт code + device_id + code_verifier.
 * Меняем у VK → userinfo → создаём/находим user → session tokens.
 *
 * Secrets: VK_CLIENT_ID (есть), опц. VK_CLIENT_SECRET
 * Авто: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY
 *
 * verify_jwt = false
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { bridgeRedirectUri } from '../_shared/vkOAuthBridge.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' });

  let body: {
    code?: string;
    device_id?: string;
    code_verifier?: string;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return json(400, { error: 'invalid_json' });
  }

  const code = String(body.code || '');
  const deviceId = String(body.device_id || '');
  const codeVerifier = String(body.code_verifier || '');
  if (!code || !deviceId || !codeVerifier) {
    return json(400, { error: 'invalid_request', need: ['code', 'device_id', 'code_verifier'] });
  }

  const clientId = Deno.env.get('VK_CLIENT_ID') || Deno.env.get('VKID_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('VK_CLIENT_SECRET') || Deno.env.get('VKID_CLIENT_SECRET') || '';
  if (!clientId) return json(500, { error: 'missing_vk_client_id' });

  const redirectUri = bridgeRedirectUri(req.url);

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
    return json(502, { error: 'vk_token_not_json', body: tokenText.slice(0, 300) });
  }
  if (!tokenRes.ok || tokenJson.error || typeof tokenJson.access_token !== 'string') {
    return json(400, { error: 'vk_token_failed', vk: tokenJson });
  }
  const accessToken = tokenJson.access_token;

  const uiBody = new URLSearchParams();
  uiBody.set('access_token', accessToken);
  uiBody.set('client_id', clientId);
  const uiRes = await fetch('https://id.vk.ru/oauth2/user_info', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: uiBody,
  });
  const uiText = await uiRes.text();
  let uiJson: Record<string, unknown>;
  try {
    uiJson = JSON.parse(uiText) as Record<string, unknown>;
  } catch {
    return json(502, { error: 'vk_userinfo_not_json', body: uiText.slice(0, 300) });
  }
  if (!uiRes.ok) return json(502, { error: 'vk_userinfo_failed', vk: uiJson });

  const userObj =
    uiJson.user && typeof uiJson.user === 'object'
      ? (uiJson.user as Record<string, unknown>)
      : uiJson;
  const vkId =
    userObj.user_id != null
      ? String(userObj.user_id)
      : userObj.id != null
        ? String(userObj.id)
        : '';
  const emailRaw =
    (typeof userObj.email === 'string' && userObj.email) ||
    (typeof uiJson.email === 'string' && uiJson.email) ||
    '';
  const email = emailRaw.trim().toLowerCase();
  if (!email) {
    return json(400, {
      error: 'vk_email_required',
      hint: 'В кабинете VK включите право email и разрешите доступ при входе.',
      vk_id: vkId || null,
    });
  }

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
    return json(500, { error: 'missing_supabase_env' });
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
  };

  const created = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: meta,
    app_metadata: { provider: 'vkid', providers: ['vkid'] },
  });
  if (created.error && !/already|registered|exists/i.test(created.error.message || '')) {
    return json(502, { error: 'create_user_failed', message: created.error.message });
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
    return json(502, {
      error: 'generate_link_failed',
      message: link.error?.message || 'no hashed_token',
    });
  }

  const anon = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const verified = await anon.auth.verifyOtp({
    token_hash: link.data.properties.hashed_token,
    type: 'magiclink',
  });
  if (verified.error || !verified.data.session) {
    return json(502, {
      error: 'verify_otp_failed',
      message: verified.error?.message || 'no session',
    });
  }

  const s = verified.data.session;
  return json(200, {
    access_token: s.access_token,
    refresh_token: s.refresh_token,
    expires_in: s.expires_in,
    token_type: s.token_type || 'bearer',
    user: { id: s.user.id, email: s.user.email },
  });
});
