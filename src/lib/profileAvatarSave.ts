import { getPlayerProfile, savePlayerProfile } from '../game/persistence';
import { compressImageToDataUrl } from './avatarImage';

const PENDING_AVATAR_KEY = 'updown_avatar_pending';
const AVATAR_ONLY_KEY = 'updown_avatar_data_url';
export const AVATAR_CAMERA_PENDING_KEY = 'updown_avatar_camera_pending';
/** localStorage: переживает уход в системную камеру (sessionStorage на части телефонов сбрасывается). */
const NAME_AVATAR_MODAL_OPEN_KEY = 'updown_name_avatar_modal_open';

export type NameAvatarModalResumeMode = 'first-run' | 'profile' | 'new-account';

const RESUME_TTL_MS = 15 * 60 * 1000;

/** Пользователь ушёл в нативную камеру — после возврата/перезагрузки открыть модалку снова. */
export function markAvatarCameraPending(): void {
  try {
    localStorage.setItem(AVATAR_CAMERA_PENDING_KEY, String(Date.now()));
  } catch {
    /* ignore */
  }
}

/**
 * Модалка имени открыта — держим до «Сохранить» / «Отмена».
 * Нужно при перезагрузке вкладки после системной камеры.
 */
export function markNameAvatarModalOpen(mode: NameAvatarModalResumeMode): void {
  try {
    localStorage.setItem(
      NAME_AVATAR_MODAL_OPEN_KEY,
      JSON.stringify({ mode, at: Date.now() }),
    );
  } catch {
    /* ignore */
  }
}

/** @deprecated alias — то же, что markNameAvatarModalOpen */
export function markNameAvatarModalResume(mode: NameAvatarModalResumeMode): void {
  markNameAvatarModalOpen(mode);
}

export function peekNameAvatarModalOpen(): NameAvatarModalResumeMode | null {
  try {
    const raw = localStorage.getItem(NAME_AVATAR_MODAL_OPEN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { mode?: string; at?: number };
    const at = typeof parsed.at === 'number' ? parsed.at : 0;
    if (!Number.isFinite(at) || Date.now() - at > RESUME_TTL_MS) {
      localStorage.removeItem(NAME_AVATAR_MODAL_OPEN_KEY);
      return null;
    }
    if (parsed.mode === 'first-run' || parsed.mode === 'profile' || parsed.mode === 'new-account') {
      return parsed.mode;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearNameAvatarModalOpen(): void {
  try {
    localStorage.removeItem(NAME_AVATAR_MODAL_OPEN_KEY);
  } catch {
    /* ignore */
  }
  clearAvatarCameraPending();
}

export function clearAvatarCameraPending(): void {
  try {
    localStorage.removeItem(AVATAR_CAMERA_PENDING_KEY);
  } catch {
    /* ignore */
  }
}

/** Не снимает флаг — только смотрит (снимаем при закрытии модалки). */
export function peekAvatarCameraPending(): boolean {
  try {
    const v = localStorage.getItem(AVATAR_CAMERA_PENDING_KEY);
    if (!v) return false;
    const ts = Number(v);
    if (!Number.isFinite(ts) || Date.now() - ts > RESUME_TTL_MS) {
      localStorage.removeItem(AVATAR_CAMERA_PENDING_KEY);
      return false;
    }
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
    /* Не снимаем флаги модалки/камеры здесь: после камеры страница часто
       перезагружается — флаги нужны, чтобы снова открыть модалку имени. */
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
