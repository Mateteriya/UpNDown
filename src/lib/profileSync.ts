/**
 * Синхронизация профиля игрока с Supabase.
 * При входе: только облачный профиль (локальный гостевой не подмешивается).
 * При сохранении: локально + upsert в profiles.
 */

import { getPlayerProfile, savePlayerProfile, type PlayerProfile } from '../game/persistence';
import {
  LOCAL_AVATAR_CACHE_MAX_CHARS,
  ONLINE_CLOUD_AVATAR_MAX_CHARS,
  PROFILE_CLOUD_AVATAR_MAX_CHARS,
  cropAvatarFaceToJpegCache,
  prepareAvatarForOnlineRoom,
  scaleImageDataUrl,
} from './avatarImage';
import { clearAvatarEditorLocalState } from './avatarEditorProject';
import { supabase } from './supabase';

const PROFILES_TABLE = 'profiles';

export interface RemoteProfile {
  display_name: string;
  avatar_data_url: string | null;
  profile_id: string;
  updated_at?: string | null;
}

export type LoadProfileResult =
  | { status: 'found'; profile: PlayerProfile }
  | { status: 'missing' }
  | { status: 'error'; message: string };

async function fitPngKeepingAlpha(avatar: string, maxChars: number): Promise<string | null> {
  const steps = [512, 384, 320, 256, 192, 160];
  let best = avatar;
  for (const px of steps) {
    try {
      const next = await scaleImageDataUrl(avatar, px, 'png');
      best = next;
      if (next.length <= maxChars) return next;
    } catch {
      /* next step */
    }
  }
  return best.length <= maxChars * 1.25 ? best : null;
}

async function fitAvatarForCloud(avatar: string | null | undefined): Promise<string | null> {
  if (avatar == null || avatar === '') return null;
  if (avatar.length <= PROFILE_CLOUD_AVATAR_MAX_CHARS) return avatar;
  if (avatar.startsWith('data:image/png')) {
    return fitPngKeepingAlpha(avatar, PROFILE_CLOUD_AVATAR_MAX_CHARS);
  }
  const fitted = await prepareAvatarForOnlineRoom(avatar, PROFILE_CLOUD_AVATAR_MAX_CHARS);
  return fitted ?? null;
}

/**
 * Кэш в localStorage: только крошечный JPEG лица.
 * PNG с плашкой сюда не пишем — иначе при открытии ЛК refresh JWT некуда записать → logout.
 */
export async function fitAvatarForLocalCache(
  avatar: string | null | undefined,
): Promise<string | null> {
  if (avatar == null || avatar === '') return null;
  /* Уже компактный JPEG — не даунскейлить повторно в «мыло». */
  if (
    avatar.startsWith('data:image/jpeg') &&
    avatar.length <= LOCAL_AVATAR_CACHE_MAX_CHARS
  ) {
    return avatar;
  }
  const face = await cropAvatarFaceToJpegCache(avatar);
  if (face && face.length <= LOCAL_AVATAR_CACHE_MAX_CHARS) return face;
  if (face) {
    const smaller = await prepareAvatarForOnlineRoom(face, LOCAL_AVATAR_CACHE_MAX_CHARS);
    return smaller ?? null;
  }
  const fitted = await prepareAvatarForOnlineRoom(avatar, LOCAL_AVATAR_CACHE_MAX_CHARS);
  if (fitted && fitted.length <= LOCAL_AVATAR_CACHE_MAX_CHARS) return fitted;
  return (await prepareAvatarForOnlineRoom(avatar, ONLINE_CLOUD_AVATAR_MAX_CHARS)) ?? null;
}

/** Явный выход: снять облачный кэш с устройства (гость не наследует аватар аккаунта). */
export function clearLocalAccountAvatarCache(): void {
  clearAvatarEditorLocalState();
  const cur = getPlayerProfile();
  savePlayerProfile({
    ...cur,
    avatarDataUrl: null,
    avatarBgColor: null,
    updatedAt: new Date().toISOString(),
  });
}

/** Загрузить профиль из Supabase. error ≠ missing — при ошибке нельзя затирать облако. */
export async function loadProfileFromSupabase(userId: string): Promise<LoadProfileResult> {
  if (!supabase) return { status: 'error', message: 'Supabase не настроен' };
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('display_name, avatar_data_url, profile_id, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error) return { status: 'error', message: error.message };
    if (!data) return { status: 'missing' };
    const r = data as RemoteProfile;
    return {
      status: 'found',
      profile: {
        displayName: typeof r.display_name === 'string' ? r.display_name.trim() : 'Вы',
        avatarDataUrl: r.avatar_data_url ?? null,
        profileId: typeof r.profile_id === 'string' ? r.profile_id : undefined,
        updatedAt: typeof r.updated_at === 'string' ? r.updated_at : undefined,
      },
    };
  } catch (e) {
    return {
      status: 'error',
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/**
 * Сохранить профиль в Supabase (upsert по user_id).
 * Важно: если аватар был, но не влез после сжатия — НЕ пишем null в облако
 * (иначе на другом устройстве «слетает» фотка навсегда).
 */
export async function saveProfileToSupabase(
  userId: string,
  profile: PlayerProfile,
  opts?: { clearAvatar?: boolean },
): Promise<boolean> {
  if (!supabase) return false;
  const client = supabase;
  try {
    const hadAvatar = Boolean(profile.avatarDataUrl && profile.avatarDataUrl.length >= 32);
    let avatar = await fitAvatarForCloud(profile.avatarDataUrl);
    if (hadAvatar && !avatar && !opts?.clearAvatar) {
      /* Дожать JPEG ещё сильнее, прежде чем сдаться. */
      avatar =
        (await prepareAvatarForOnlineRoom(profile.avatarDataUrl, ONLINE_CLOUD_AVATAR_MAX_CHARS)) ??
        (await prepareAvatarForOnlineRoom(profile.avatarDataUrl, Math.floor(ONLINE_CLOUD_AVATAR_MAX_CHARS * 0.6))) ??
        null;
    }
    const updatedAt = profile.updatedAt ?? new Date().toISOString();
    const baseRow = {
      user_id: userId,
      display_name: profile.displayName,
      profile_id: profile.profileId ?? '',
      updated_at: updatedAt,
    };

    const write = async (avatarDataUrl: string | null | undefined) => {
      const row =
        avatarDataUrl === undefined
          ? baseRow
          : { ...baseRow, avatar_data_url: avatarDataUrl };
      return client.from(PROFILES_TABLE).upsert(row, { onConflict: 'user_id' });
    };

    /** Явная очистка / нет аватара → null; сжатие не удалось при имеющемся → не трогаем колонку. */
    let avatarField: string | null | undefined;
    if (opts?.clearAvatar || (!hadAvatar && !profile.avatarDataUrl)) {
      avatarField = null;
    } else if (avatar) {
      avatarField = avatar;
    } else if (hadAvatar) {
      console.warn('[profileSync] avatar too large for cloud — keep previous avatar_data_url');
      avatarField = undefined;
    } else {
      avatarField = null;
    }

    let { error } = await write(avatarField);
    if (error && avatarField && avatarField.length > ONLINE_CLOUD_AVATAR_MAX_CHARS) {
      const smaller =
        (await prepareAvatarForOnlineRoom(avatarField, ONLINE_CLOUD_AVATAR_MAX_CHARS)) ?? null;
      if (smaller) {
        avatarField = smaller;
        ({ error } = await write(avatarField));
      }
    }
    if (error) {
      console.warn('[profileSync] save failed', error.message);
      return false;
    }
    if (typeof avatarField === 'string' && avatarField !== (profile.avatarDataUrl ?? null)) {
      const localCache = await fitAvatarForLocalCache(avatarField);
      savePlayerProfile({ ...profile, avatarDataUrl: localCache ?? profile.avatarDataUrl, updatedAt });
    } else if (avatarField === undefined && hadAvatar) {
      /* Имя ушло в облако; локальный полный аватар оставляем. */
      savePlayerProfile({
        displayName: profile.displayName,
        profileId: profile.profileId,
        updatedAt,
        avatarDataUrl: undefined,
      });
    }
    return true;
  } catch (e) {
    console.warn('[profileSync] save failed', e instanceof Error ? e.message : e);
    return false;
  }
}

/**
 * Профиль аккаунта = облако. Локальный гостевой профиль не подмешивается.
 * localStorage после входа — только кэш серверного профиля.
 */
export function adoptAccountProfile(remote: PlayerProfile): PlayerProfile {
  return {
    displayName: remote.displayName,
    avatarDataUrl: remote.avatarDataUrl ?? null,
    avatarBgColor: remote.avatarBgColor ?? null,
    profileId: remote.profileId && remote.profileId.length > 0 ? remote.profileId : undefined,
    updatedAt: remote.updatedAt,
  };
}

/**
 * @deprecated Раньше last-write-wins подмешивал локальный гостевой аватар в аккаунт.
 * При входе используйте {@link adoptAccountProfile} — только облако.
 */
export function mergeLocalAndRemoteProfile(
  _local: PlayerProfile,
  remote: PlayerProfile,
): { profile: PlayerProfile; push: boolean } {
  return { profile: adoptAccountProfile(remote), push: false };
}
