/**
 * Настройка custom:yandex под Supabase Auth + прокси userinfo.
 *
 * Яндекс отдаёт id/default_email; Supabase ждёт sub/email → без прокси:
 * «error missing provider id».
 *
 * Нужен SUPABASE_SERVICE_ROLE_KEY в .env.local.
 *
 * Перед этим задеплойте функцию:
 *   npx supabase functions deploy yandex-userinfo --project-ref jrgnsqbwwhovonxyxown
 *
 * Запуск: node scripts/fix-yandex-custom-provider.mjs
 * Опции: --no-pkce
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

const noPkce = process.argv.includes('--no-pkce');
const base = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').replace(/\/$/, '');
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const id = 'custom:yandex';

if (!base || !key) {
  console.error(
    'Нужны VITE_SUPABASE_URL и SUPABASE_SERVICE_ROLE_KEY в .env.local\n' +
      '(service_role: Dashboard → Project Settings → API).',
  );
  process.exit(1);
}

const userinfoUrl = `${base}/functions/v1/yandex-userinfo`;
const url = `${base}/auth/v1/admin/custom-providers/${encodeURIComponent(id)}`;
const body = {
  pkce_enabled: !noPkce,
  email_optional: true,
  authorization_url: 'https://oauth.yandex.ru/authorize',
  token_url: 'https://oauth.yandex.ru/token',
  userinfo_url: userinfoUrl,
  issuer: 'https://oauth.yandex.ru',
  scopes: ['login:email', 'login:info'],
  /** Всегда спросить согласие и дать выбрать другой Яндекс-аккаунт. */
  authorization_params: { force_confirm: 'yes' },
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

console.log('OK: custom:yandex обновлён');
console.log(
  JSON.stringify(
    {
      identifier: json?.identifier ?? id,
      pkce_enabled: json?.pkce_enabled,
      email_optional: json?.email_optional,
      userinfo_url: json?.userinfo_url,
      authorization_params: json?.authorization_params,
      enabled: json?.enabled,
    },
    null,
    2,
  ),
);
console.log('\nUserinfo proxy:', userinfoUrl);
console.log('Тест: Incognito → http://192.168.1.113:3001/play/ → Яндекс.');
