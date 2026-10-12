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

const base = (process.env.VITE_SUPABASE_URL || '').replace(/\/$/, '');
const anon = process.env.VITE_SUPABASE_ANON_KEY || '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const id = 'custom:yandex';

const get = await fetch(`${base}/auth/v1/admin/custom-providers/${encodeURIComponent(id)}`, {
  headers: { apikey: key, Authorization: `Bearer ${key}` },
});
console.log('GET provider', get.status);
const prov = await get.json();
console.log(
  JSON.stringify(
    {
      pkce_enabled: prov.pkce_enabled,
      email_optional: prov.email_optional,
      enabled: prov.enabled,
      authorization_url: prov.authorization_url,
      jwks_uri: prov.jwks_uri,
      scopes: prov.scopes,
    },
    null,
    2,
  ),
);

const redirect = encodeURIComponent('http://192.168.1.113:3001/play/auth-callback.html');
const authUrl = `${base}/auth/v1/authorize?provider=${encodeURIComponent(id)}&redirect_to=${redirect}`;
const r = await fetch(authUrl, {
  redirect: 'manual',
  headers: { apikey: anon, Authorization: `Bearer ${anon}` },
});
console.log('authorize status', r.status);
console.log('location', r.headers.get('location'));
const body = await r.text();
if (body) console.log('body', body.slice(0, 500));
