/**
 * Синхронизация профиля игрока с Supabase.
 * При входе: загружаем профиль с сервера или сохраняем локальный.
 * При сохранении профиля: обновляем и локально, и в Supabase (если авторизован).
 */

import { supabase } from './supabase';
import type { PlayerProfile } from '../game/persistence';

const PROFILES_TABLE = 'profiles';

export interface RemoteProfile {
  display_name: string;
  avatar_data_url: string | null;
  profile_id: string;
}

/** Загрузить профиль из Supabase для текущего пользователя */
export async function loadProfileFromSupabase(userId: string): Promise<PlayerProfile | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from(PROFILES_TABLE)
      .select('display_name, avatar_data_url, profile_id')
      .eq('user_id', userId)
      .maybeSingle();
    if (error || !data) return null;
    const r = data as RemoteProfile;
    return {
      displayName: typeof r.display_name === 'string' ? r.display_name.trim() : 'Вы',
      avatarDataUrl: r.avatar_data_url ?? null,
      profileId: typeof r.profile_id === 'string' ? r.profile_id : undefined,
    };
  } catch {
    return null;
  }
}

/** Сохранить профиль в Supabase (upsert по user_id) */
export async function saveProfileToSupabase(userId: string, profile: PlayerProfile): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { error } = await supabase.from(PROFILES_TABLE).upsert(
      {
        user_id: userId,
        display_name: profile.displayName,
        avatar_data_url: profile.avatarDataUrl ?? null,
        profile_id: profile.profileId ?? '',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );
    return !error;
  } catch {
    return false;
  }
}
