/**
 * Синхронизация профиля игрока с Supabase.
 * При входе: last-write-wins по updated_at (аватар и имя аккаунта одинаковы на устройствах).
 * При сохранении: локально + upsert в profiles.
 */

import { savePlayerProfile, type PlayerProfile } from '../game/persistence';
import {
  ONLINE_CLOUD_AVATAR_MAX_CHARS,
  PROFILE_CLOUD_AVATAR_MAX_CHARS,
  prepareAvatarForOnlineRoom,
} from './avatarImage';
import { supabase } from './supabase';

const PROFILES_TABLE = 'profiles';

export interface RemoteProfile {
  display_name: string;
  avatar_data_url: string | null;
  profile_id: string;
  updated_at?: string | null;
}

async function fitAvatarForCloud(avatar: string | null | undefined): Promise<string | null> {
  if (avatar == null || avatar === '') return null;
  if (avatar.length <= PROFILE_CLOUD_AVATAR_MAX_CHARS) return avatar;
  const fitted = await prepareAvatarForOnlineRoom(avatar, PROFILE_CLOUD_AVATAR_MAX_CHARS);
  return fitted ?? null;
}

/** Загрузить профиль из Supabase для текущего пользователя */
export async function loadProfileFromSupabase(userId: string): Promise<PlayerProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('display_name, avatar_data_url, profile_id, updated_at')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as RemoteProfile;
    return {
      displayName: typeof r.display_name === 'string' ? r.display_name.trim() : 'Вы',
      avatarDataUrl: r.avatar_data_url ?? null,
      profileId: typeof r.profile_id === 'string' ? r.profile_id : undefined,
      updatedAt: typeof r.updated_at === 'string' ? r.updated_at : undefined,
    };
  } catch {
    return null;
  }
}

/** Сохранить профиль в Supabase (upsert по user_id). При успехе подтягивает сжатый аватар в localStorage. */
export async function saveProfileToSupabase(userId: string, profile: PlayerProfile): Promise<boolean> {
  if (!supabase) return false;
  const client = supabase;
  try {
    let avatar = await fitAvatarForCloud(profile.avatarDataUrl);
    const updatedAt = profile.updatedAt ?? new Date().toISOString();
    const write = async (avatarDataUrl: string | null) =>
      client.from(PROFILES_TABLE).upsert(
        {
          user_id: userId,
          display_name: profile.displayName,
          avatar_data_url: avatarDataUrl,
          profile_id: profile.profileId ?? '',
          updated_at: updatedAt,
        },
        { onConflict: 'user_id' },
      );

    let { error } = await write(avatar);
    if (error && avatar && avatar.length > ONLINE_CLOUD_AVATAR_MAX_CHARS) {
      avatar = (await prepareAvatarForOnlineRoom(avatar, ONLINE_CLOUD_AVATAR_MAX_CHARS)) ?? null;
      ({ error } = await write(avatar));
    }
    if (error) {
      console.warn('[profileSync] save failed', error.message);
      return false;
    }
    if (avatar !== (profile.avatarDataUrl ?? null)) {
      savePlayerProfile({ ...profile, avatarDataUrl: avatar, updatedAt });
    }
    return true;
  } catch (e) {
    console.warn('[profileSync] save failed', e instanceof Error ? e.message : e);
    return false;
  }
}

function ts(iso: string | undefined): number {
  if (!iso) return 0;
  const n = Date.parse(iso);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Свести локальный и облачный профиль: побеждает более новое updatedAt.
 * Если в облаке нет аватарки, а локально есть — оставляем локальную и помечаем push.
 */
export function mergeLocalAndRemoteProfile(
  local: PlayerProfile,
  remote: PlayerProfile,
): { profile: PlayerProfile; push: boolean } {
  const localTs = ts(local.updatedAt);
  const remoteTs = ts(remote.updatedAt);
  if (localTs > remoteTs) {
    return {
      profile: {
        ...local,
        profileId: remote.profileId || local.profileId,
      },
      push: true,
    };
  }
  const avatar = remote.avatarDataUrl || local.avatarDataUrl || null;
  const push = !remote.avatarDataUrl && !!local.avatarDataUrl;
  return {
    profile: {
      displayName: remote.displayName,
      avatarDataUrl: avatar,
      avatarBgColor: remote.avatarBgColor ?? local.avatarBgColor ?? null,
      profileId: remote.profileId || local.profileId,
      updatedAt: remote.updatedAt ?? local.updatedAt,
    },
    push,
  };
}
