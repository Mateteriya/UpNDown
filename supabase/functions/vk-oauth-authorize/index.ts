/**
 * Authorization URL для custom:vkid.
 * GoTrue → сюда → редирект на id.vk.ru с redirect_uri = vk-oauth-bridge
 * (чтобы поймать device_id; GoTrue сам его не пробрасывает в token exchange).
 *
 * verify_jwt = false
 * Deploy: npx supabase functions deploy vk-oauth-authorize --project-ref jrgnsqbwwhovonxyxown
 */
import { bridgeRedirectUri, packAuthState } from '../_shared/vkOAuthBridge.ts';

Deno.serve((req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }
  if (req.method !== 'GET') {
    return new Response('method_not_allowed', { status: 405 });
  }

  const src = new URL(req.url);
  const clientId = src.searchParams.get('client_id') || '';
  const state = src.searchParams.get('state') || '';
  const sbRedirect = src.searchParams.get('redirect_uri') || '';
  const challenge = src.searchParams.get('code_challenge') || '';
  const challengeMethod = src.searchParams.get('code_challenge_method') || 'S256';
  const scope = src.searchParams.get('scope') || 'email';
  const responseType = src.searchParams.get('response_type') || 'code';

  if (!clientId || !state || !sbRedirect) {
    return new Response(
      JSON.stringify({
        error: 'missing_oauth_params',
        need: ['client_id', 'state', 'redirect_uri'],
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const bridgeUri = bridgeRedirectUri(req.url);
  const vkState = packAuthState({ s: state, cb: sbRedirect });

  const vk = new URL('https://id.vk.ru/authorize');
  vk.searchParams.set('response_type', responseType);
  vk.searchParams.set('client_id', clientId);
  vk.searchParams.set('redirect_uri', bridgeUri);
  vk.searchParams.set('state', vkState);
  vk.searchParams.set('scope', scope);
  if (challenge) {
    vk.searchParams.set('code_challenge', challenge);
    vk.searchParams.set('code_challenge_method', challengeMethod);
  }

  return Response.redirect(vk.toString(), 302);
});
