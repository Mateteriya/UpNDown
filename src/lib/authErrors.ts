/** Код для AuthModal / UI: облако Auth недоступно или слишком медленное. */
export const AUTH_NETWORK_ERROR_CODE = 'auth_network';

/** localStorage WebView переполнен — PKCE/code-verifier не записывается. */
export const AUTH_STORAGE_FULL_CODE = 'auth_storage_full';

export function isAuthNetworkError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: unknown; name?: unknown };
  return e.message === AUTH_NETWORK_ERROR_CODE || e.name === 'AuthNetworkError';
}

export function isAuthStorageFullError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { message?: unknown; name?: unknown };
  return e.message === AUTH_STORAGE_FULL_CODE || e.name === 'AuthStorageFullError';
}

export function networkAuthError(): Error {
  const e = new Error(AUTH_NETWORK_ERROR_CODE);
  e.name = 'AuthNetworkError';
  return e;
}

export function storageFullAuthError(): Error {
  const e = new Error(AUTH_STORAGE_FULL_CODE);
  e.name = 'AuthStorageFullError';
  return e;
}
