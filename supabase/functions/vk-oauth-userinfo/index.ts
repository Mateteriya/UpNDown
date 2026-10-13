/**
 * UserInfo URL для custom:vkid — маппинг ответа VK → OIDC { sub, email, … }.
 *
 * verify_jwt = false (Bearer = access token VK)
 * Deploy: npx supabase functions deploy vk-oauth-userinfo --project-ref jrgnsqbwwhovonxyxown
 */
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
  if (req.method !== 'GET' && req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const auth = req.headers.get('Authorization') || '';
  const token = auth.replace(/^(Bearer|OAuth)\s+/i, '').trim();
  if (!token) {
    return new Response(JSON.stringify({ error: 'missing_token' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // VK user_info обычно требует client_id (GoTrue часто шлёт только Bearer).
  const url = new URL(req.url);
  const clientId =
    url.searchParams.get('client_id') ||
    Deno.env.get('VK_CLIENT_ID') ||
    Deno.env.get('VKID_CLIENT_ID') ||
    '';

  const body = new URLSearchParams();
  body.set('access_token', token);
  if (clientId) body.set('client_id', clientId);

  const vkRes = await fetch('https://id.vk.ru/oauth2/user_info', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body,
  });

  const rawText = await vkRes.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return new Response(
      JSON.stringify({ error: 'vk_userinfo_bad_json', status: vkRes.status, body: rawText.slice(0, 200) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!vkRes.ok) {
    return new Response(JSON.stringify({ error: 'vk_userinfo_failed', status: vkRes.status, raw }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const user =
    raw.user && typeof raw.user === 'object'
      ? (raw.user as Record<string, unknown>)
      : (raw as Record<string, unknown>);

  const id =
    user.user_id != null
      ? String(user.user_id)
      : user.id != null
        ? String(user.id)
        : user.sub != null
          ? String(user.sub)
          : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'vk_missing_id', raw }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const email =
    (typeof user.email === 'string' && user.email) ||
    (typeof raw.email === 'string' && raw.email) ||
    undefined;

  const first = typeof user.first_name === 'string' ? user.first_name : undefined;
  const last = typeof user.last_name === 'string' ? user.last_name : undefined;
  const name =
    [first, last].filter(Boolean).join(' ').trim() ||
    (typeof user.name === 'string' ? user.name : undefined);

  const picture =
    (typeof user.avatar === 'string' && user.avatar) ||
    (typeof user.picture === 'string' ? user.picture : undefined);

  const oidc = {
    sub: id,
    email,
    email_verified: !!email,
    name,
    given_name: first,
    family_name: last,
    picture,
  };

  return new Response(JSON.stringify(oidc), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
