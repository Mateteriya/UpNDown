import { SignJWT } from 'jose';
import { afterEach, describe, expect, it } from 'vitest';
import {
  bindPlayerId,
  verifySupabaseAccessToken,
  wsAuthBootError,
} from './wsAuth';

const SECRET = 'test-jwt-secret-for-updown-ws';

async function signToken(payload: Record<string, unknown>, secret = SECRET): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(typeof payload.sub === 'string' ? payload.sub : 'user-1')
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(secret));
}

describe('bindPlayerId', () => {
  it('off: trusts client playerId', () => {
    expect(bindPlayerId('dev-1', { userId: null, authed: false }, 'off')).toEqual({
      playerId: 'dev-1',
    });
  });

  it('optional without auth: trusts client', () => {
    expect(bindPlayerId('dev-1', { userId: null, authed: false }, 'optional')).toEqual({
      playerId: 'dev-1',
    });
  });

  it('optional with auth: forces JWT sub', () => {
    expect(bindPlayerId('spoof', { userId: 'user-abc', authed: true }, 'optional')).toEqual({
      playerId: 'user-abc',
    });
  });

  it('required without auth: rejects', () => {
    expect(bindPlayerId('dev-1', { userId: null, authed: false }, 'required')).toEqual({
      error: 'auth_required',
    });
  });
});

describe('verifySupabaseAccessToken', () => {
  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it('rejects when secret missing', async () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(await verifySupabaseAccessToken('x')).toEqual({ error: 'jwt_not_configured' });
  });

  it('accepts HS256 access token with sub + authenticated', async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const token = await signToken({ sub: 'user-abc', role: 'authenticated', aud: 'authenticated' });
    expect(await verifySupabaseAccessToken(token)).toEqual({ userId: 'user-abc' });
  });

  it('rejects anon role', async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const token = await signToken({ sub: 'anon', role: 'anon', aud: 'authenticated' });
    // role anon, aud authenticated — aud passes. Use aud anon.
    const anon = await new SignJWT({ role: 'anon' })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject('anon-key')
      .setAudience('anon')
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySupabaseAccessToken(anon)).toEqual({ error: 'token_not_authenticated' });
    void token;
  });

  it('rejects token without sub', async () => {
    process.env.SUPABASE_JWT_SECRET = SECRET;
    const token = await new SignJWT({ role: 'authenticated', aud: 'authenticated' })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('1h')
      .sign(new TextEncoder().encode(SECRET));
    expect(await verifySupabaseAccessToken(token)).toEqual({ error: 'token_no_sub' });
  });
});

describe('wsAuthBootError', () => {
  afterEach(() => {
    delete process.env.SUPABASE_JWT_SECRET;
  });

  it('required without secret is a boot error', () => {
    delete process.env.SUPABASE_JWT_SECRET;
    expect(wsAuthBootError('required')).toMatch(/SUPABASE_JWT_SECRET/);
  });

  it('required with secret is ok', () => {
    process.env.SUPABASE_JWT_SECRET = 'x';
    expect(wsAuthBootError('required')).toBeNull();
  });
});
