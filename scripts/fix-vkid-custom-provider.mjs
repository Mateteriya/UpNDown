/**
 * Настройка custom:vkid под мост device_id (Edge Functions).
 *
 * Ошибка без моста:
 *   Unable to exchange external code: vk2
 *
 * Перед запуском:
 *   npx supabase functions deploy vk-oauth-authorize --project-ref jrgnsqbwwhovonxyxown
 *   npx supabase functions deploy vk-oauth-bridge --project-ref jrgnsqbwwhovonxyxown
 *   npx supabase functions deploy vk-oauth-token --project-ref jrgnsqbwwhovonxyxown
 *   npx supabase functions deploy vk-oauth-userinfo --project-ref jrgnsqbwwhovonxyxown
 *   npx supabase secrets set VK_CLIENT_ID=<App ID из кабинета VK> --project-ref jrgnsqbwwhovonxyxown
 *
 * В кабинете VK Redirect URL сменить на:
 *   https://jrgnsqbwwhovonxyxown.supabase.co/functions/v1/vk-oauth-bridge
 * (больше НЕ /auth/v1/callback — мост сам вернёт code в GoTrue).
 *
 * Нужен SUPABASE_SERVICE_ROLE_KEY в .env.local.
 * Запуск: node scripts/fix-vkid-custom-provider.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

function loadEnvLocal() {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = t.indexOf('=');
    if (i < 0) continue;
    const k = t.slice(0, i).trim();
    let v = t.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (process.env[k] == null || process.env[k] === '') process.env[k] = v;
  }
}

loadEnvLocal();

const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const id = 'custom:vkid';

if (!base || !key) {
  console.error(
    'Нужны VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local\n' +
      '(service_role: Dashboard → Project Settings → API).',
  );
  process.exit(1);
}

const fn = (name) => `${base}/functions/v1/${name}`;
const url = `${base}/auth/v1/admin/custom-providers/${encodeURIComponent(id)}`;
const body = {
  pkce_enabled: true,
  email_optional: true,
  authorization_url: fn('vk-oauth-authorize'),
  token_url: fn('vk-oauth-token'),
  userinfo_url: fn('vk-oauth-userinfo'),
  issuer: 'https://id.vk.ru',
  scopes: ['email'],
  enabled: true,
};

const res = await fetch(url, {
  method: 'PUT',
  headers: {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(body),
});

const text = await res.text();
let json;
try {
  json = JSON.parse(text);
} catch {
  json = text;
}

if (!res.ok) {
  console.error('PUT failed', res.status, json);
  process.exit(1);
}

console.log('OK: custom:vkid обновлён (мост device_id)');
console.log(
  JSON.stringify(
    {
      identifier: json?.identifier ?? id,
      pkce_enabled: json?.pkce_enabled,
      email_optional: json?.email_optional,
      authorization_url: json?.authorization_url ?? body.authorization_url,
      token_url: json?.token_url ?? body.token_url,
      userinfo_url: json?.userinfo_url ?? body.userinfo_url,
      enabled: json?.enabled,
    },
    null,
    2,
  ),
);
console.log('\nВ кабинете VK Redirect URL должен быть РОВНО:');
console.log(`  ${fn('vk-oauth-bridge')}`);
console.log('\nТест: Incognito → https://up2down.online → Вход → VK ID · Mail.ru');
