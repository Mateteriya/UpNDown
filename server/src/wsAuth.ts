/**
 * Привязка WS-сокета к Supabase JWT (sub = user id).
 * WS_AUTH=off|optional|required (по умолчанию optional).
 * SUPABASE_JWT_SECRET — Legacy JWT Secret из Supabase → Project Settings → API
 * (HS256; не anon key и не JWKS/ES256).
 */

import * as jose from 'jose';

export type WsAuthMode = 'off' | 'optional' | 'required';

export type WsSocketAuth = {
  userId: string | null;
  authed: boolean;
};

export function readWsAuthMode(): WsAuthMode {
  const raw = (process.env.WS_AUTH ?? 'optional').trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'off' || raw === 'no') return 'off';
  if (raw === 'required' || raw === 'on' || raw === '1' || raw === 'true') return 'required';
  return 'optional';
}

function jwtSecretBytes(): Uint8Array | null {
  const s = (process.env.SUPABASE_JWT_SECRET ?? '').trim();
  if (!s) return null;
  return new TextEncoder().encode(s);
}

export function isJwtConfigured(): boolean {
  return jwtSecretBytes() != null;
}

/** Fail-closed: required без секрета — не поднимать процесс. */
export function wsAuthBootError(mode: WsAuthMode = readWsAuthMode()): string | null {
  if (mode === 'required' && !isJwtConfigured()) {
    return '[updown-server] WS_AUTH=required, но SUPABASE_JWT_SECRET пуст. Отказ стартовать.';
  }
  return null;
}

function hasAuthenticatedAudience(payload: jose.JWTPayload): boolean {
  const role = payload.role;
  if (role === 'authenticated') return true;
  const aud = payload.aud;
  if (aud === 'authenticated') return true;
  if (Array.isArray(aud) && aud.includes('authenticated')) return true;
  return false;
}

export async function verifySupabaseAccessToken(
  token: string,
): Promise<{ userId: string } | { error: string }> {
  const secret = jwtSecretBytes();
  if (!secret) return { error: 'jwt_not_configured' };
  const trimmed = token.trim();
  if (!trimmed) return { error: 'token_required' };
  try {
    const { payload } = await jose.jwtVerify(trimmed, secret, {
      algorithms: ['HS256'],
    });
    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) return { error: 'token_no_sub' };
    if (!hasAuthenticatedAudience(payload)) return { error: 'token_not_authenticated' };
    return { userId: sub };
  } catch {
    return { error: 'token_invalid' };
  }
}

/** Подменить playerId на id из JWT, если сокет авторизован. */
export function bindPlayerId(
  msgPlayerId: string | undefined,
  auth: WsSocketAuth,
  mode: WsAuthMode,
): { playerId: string } | { error: string } {
  if (mode === 'off') {
    const id = msgPlayerId?.trim();
    if (!id) return { error: 'player_required' };
    return { playerId: id };
  }
  if (auth.authed && auth.userId) {
    return { playerId: auth.userId };
  }
  if (mode === 'required') {
    return { error: 'auth_required' };
  }
  const id = msgPlayerId?.trim();
  if (!id) return { error: 'player_required' };
  return { playerId: id };
}
