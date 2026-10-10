/**
 * Прокси userinfo для custom:yandex.
 *
 * Яндекс отдаёт { id, default_email, … }, а Supabase Auth требует OIDC-поля
 * { sub, email } — иначе «error missing provider id».
 *
 * GoTrue вызывает этот URL с Authorization: Bearer <yandex_access_token>.
 * verify_jwt = false (см. config.toml): токен — Яндекса, не JWT Supabase.
 *
 * Deploy:
 *   npx supabase functions deploy yandex-userinfo --project-ref jrgnsqbwwhovonxyxown
 * Затем:
 *   node scripts/fix-yandex-custom-provider.mjs
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

  const yandexRes = await fetch('https://login.yandex.ru/info?format=json', {
    headers: {
      Authorization: `OAuth ${token}`,
      Accept: 'application/json',
    },
  });

  const rawText = await yandexRes.text();
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    return new Response(
      JSON.stringify({ error: 'yandex_bad_json', status: yandexRes.status, body: rawText.slice(0, 200) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }

  if (!yandexRes.ok) {
    return new Response(JSON.stringify({ error: 'yandex_userinfo_failed', status: yandexRes.status, raw }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const id = raw.id != null ? String(raw.id) : '';
  if (!id) {
    return new Response(JSON.stringify({ error: 'yandex_missing_id', raw }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const emails = Array.isArray(raw.emails) ? (raw.emails as unknown[]) : [];
  const email =
    (typeof raw.default_email === 'string' && raw.default_email) ||
    (typeof emails[0] === 'string' ? emails[0] : '') ||
    undefined;

  const name =
    (typeof raw.real_name === 'string' && raw.real_name) ||
    (typeof raw.display_name === 'string' && raw.display_name) ||
    (typeof raw.login === 'string' && raw.login) ||
    undefined;

  const avatarId = typeof raw.default_avatar_id === 'string' ? raw.default_avatar_id : '';
  const picture = avatarId
    ? `https://avatars.yandex.net/get-yapic/${avatarId}/islands-200`
    : undefined;

  const body = {
    sub: id,
    email,
    email_verified: !!email,
    name,
    preferred_username: typeof raw.login === 'string' ? raw.login : undefined,
    given_name: typeof raw.first_name === 'string' ? raw.first_name : undefined,
    family_name: typeof raw.last_name === 'string' ? raw.last_name : undefined,
    picture,
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
});
