/**
 * Authorization URL для custom:vkid.
 * GoTrue → сюда → VK. state GoTrue передаём КАК ЕСТЬ (без pack) —
 * иначе oauth_client_state_not_found после долгого VK / in-app.
 *
 * verify_jwt = false
 */
import { bridgeRedirectUri } from '../_shared/vkOAuthBridge.ts';

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

  const vk = new URL('https://id.vk.ru/authorize');
  vk.searchParams.set('response_type', responseType);
  vk.searchParams.set('client_id', clientId);
  vk.searchParams.set('redirect_uri', bridgeUri);
  /** Важно: тот же state, что создал GoTrue — без base64-обёртки. */
  vk.searchParams.set('state', state);
  vk.searchParams.set('scope', scope);
  if (challenge) {
    vk.searchParams.set('code_challenge', challenge);
    vk.searchParams.set('code_challenge_method', challengeMethod);
  }

  return Response.redirect(vk.toString(), 302);
});
