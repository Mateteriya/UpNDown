/**
 * Общий код моста VK ID ↔ Supabase Custom OAuth.
 * GoTrue не шлёт device_id на Token URL — храним vk code + device_id в sealed «code».
 */

const te = new TextEncoder();
const td = new TextDecoder();

export function projectFunctionsBase(reqUrl: string): string {
  const u = new URL(reqUrl);
  // https://<ref>.supabase.co/functions/v1/<name>
  const marker = '/functions/v1/';
  const i = u.pathname.indexOf(marker);
  if (i >= 0) {
    return `${u.origin}${u.pathname.slice(0, i + marker.length)}`.replace(/\/$/, '') + '/';
  }
  return `${u.origin}/functions/v1/`;
}

export function bridgeRedirectUri(reqUrl: string): string {
  return `${projectFunctionsBase(reqUrl)}vk-oauth-bridge`;
}

export function b64urlFromBytes(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function bytesFromB64url(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const hash = await crypto.subtle.digest('SHA-256', te.encode(secret));
  return crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export type BridgePayload = {
  /** authorization code от VK */
  c: string;
  /** device_id от VK */
  d: string;
  /** redirect_uri, с которым ходили в VK (= bridge URL) */
  r: string;
  /** unix sec expiry */
  e: number;
};

export async function sealBridgeCode(payload: BridgePayload, secret: string): Promise<string> {
  const key = await aesKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = te.encode(JSON.stringify(payload));
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  const packed = new Uint8Array(iv.length + cipher.length);
  packed.set(iv, 0);
  packed.set(cipher, iv.length);
  return b64urlFromBytes(packed);
}

export async function openBridgeCode(token: string, secret: string): Promise<BridgePayload> {
  const packed = bytesFromB64url(token);
  if (packed.length < 13) throw new Error('bridge_code_short');
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  const key = await aesKey(secret);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
  const payload = JSON.parse(td.decode(plain)) as BridgePayload;
  if (!payload?.c || !payload?.d || !payload?.r || !payload?.e) {
    throw new Error('bridge_code_bad');
  }
  if (Date.now() / 1000 > payload.e) throw new Error('bridge_code_expired');
  return payload;
}

/** state для VK: упаковать исходный state GoTrue (+ опц. redirect Supabase). */
export type AuthStatePack = {
  s: string;
  /** Supabase /auth/v1/callback */
  cb: string;
};

export function packAuthState(pack: AuthStatePack): string {
  return b64urlFromBytes(te.encode(JSON.stringify(pack)));
}

export function unpackAuthState(raw: string): AuthStatePack {
  const pack = JSON.parse(td.decode(bytesFromB64url(raw))) as AuthStatePack;
  if (!pack?.s || !pack?.cb) throw new Error('state_bad');
  return pack;
}

export function bridgeSecret(): string {
  const s =
    Deno.env.get('VK_OAUTH_BRIDGE_SECRET') ||
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ||
    '';
  if (!s) throw new Error('missing_bridge_secret');
  return s;
}
