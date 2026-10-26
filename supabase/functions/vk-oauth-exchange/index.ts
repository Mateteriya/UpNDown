/**
 * Клиент (auth-callback) шлёт code + device_id + code_verifier.
 * Предпочтительно: обмен на GET vk-oauth-bridge (verifier в state) — без второго
 * круга телефон→supabase.co.
 *
 * verify_jwt = false
 */
import { exchangeVkCodeToSession } from '../_shared/vkExchangeSession.ts';

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

  const result = await exchangeVkCodeToSession({
    reqUrl: req.url,
    code: String(body.code || ''),
    deviceId: String(body.device_id || ''),
    codeVerifier: String(body.code_verifier || ''),
  });

  if (!result.ok) return json(result.status, result.body);

  return json(200, {
    access_token: result.access_token,
    refresh_token: result.refresh_token,
    expires_in: result.expires_in,
    token_type: result.token_type || 'bearer',
    user: result.user,
  });
});
