import { getPlayerProfile, savePlayerProfile } from '../game/persistence';
import { compressImageToDataUrl } from './avatarImage';

const PENDING_AVATAR_KEY = 'updown_avatar_pending';
const AVATAR_ONLY_KEY = 'updown_avatar_data_url';
export const AVATAR_CAMERA_PENDING_KEY = 'updown_avatar_camera_pending';

/** Пользователь ушёл в нативную камеру — после возврата/перезагрузки открыть профиль снова. */
export function markAvatarCameraPending(): void {
  try {
    localStorage.setItem(AVATAR_CAMERA_PENDING_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

export function consumeAvatarCameraPending(): boolean {
  try {
    const v = localStorage.getItem(AVATAR_CAMERA_PENDING_KEY);
    if (!v) return false;
    localStorage.removeItem(AVATAR_CAMERA_PENDING_KEY);
    const ts = Number(v);
    if (!Number.isFinite(ts) || Date.now() - ts > 15 * 60 * 1000) return false;
    return true;
  } catch {
    return false;
  }
}

/** Сразу пишет аватар в localStorage (до «Сохранить») — переживает перезагрузку после камеры. */
export async function persistAvatarToProfile(avatarDataUrl: string): Promise<string> {
  const compressed = await compressImageToDataUrl(avatarDataUrl);
  try {
    localStorage.setItem(AVATAR_ONLY_KEY, compressed);
  } catch {
    /* ignore */
  }
  const cur = getPlayerProfile();
  savePlayerProfile({ ...cur, avatarDataUrl: compressed });
  try {
    sessionStorage.setItem(PENDING_AVATAR_KEY, compressed);
    localStorage.removeItem(AVATAR_CAMERA_PENDING_KEY);
  } catch {
    /* ignore */
  }
  return compressed;
}

/** Подмешать аватар из отдельного ключа, если в профиле пусто (после перезагрузки вкладки). */
export function mergeStoredAvatarIntoProfile(): void {
  try {
    const only = localStorage.getItem(AVATAR_ONLY_KEY);
    if (!only || only.length < 32) return;
    const cur = getPlayerProfile();
    if (cur.avatarDataUrl === only) return;
    savePlayerProfile({ ...cur, avatarDataUrl: only });
  } catch {
    /* ignore */
  }
}

export function consumePendingAvatarDraft(): string | null {
  try {
    const v = sessionStorage.getItem(PENDING_AVATAR_KEY);
    if (v) sessionStorage.removeItem(PENDING_AVATAR_KEY);
    return v;
  } catch {
    return null;
  }
}
