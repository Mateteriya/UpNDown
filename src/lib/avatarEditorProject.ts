/**
 * Слои редактора аватарки отдельно от «запечённого» JPEG профиля.
 * Иначе при повторном входе инициалы/рамка рисуются поверх уже впечатанных.
 *
 * Исходное фото — только sessionStorage (сессия вкладки / открытый редактор),
 * не localStorage: после закрытия редактора «вернуть фото» не всплывает вечно.
 */

import { getPlayerProfile } from '../game/persistence';
import {
  isAvatarInitialsSource,
  isAvatarInitialsStyle,
  migrateLegacyInitialsMode,
  type AvatarEditorTemplateId,
  type AvatarInitialsSource,
  type AvatarInitialsStyle,
} from './avatarEditorTemplates';
import type { AvatarFrameId } from './avatarEditorFrames';

const META_KEY = 'updown_avatar_editor_meta';
/** Legacy: раньше фото жило в localStorage и «возвращалось» через месяцы. */
const LEGACY_SOURCE_PHOTO_KEY = 'updown_avatar_editor_source_photo';
const SESSION_SOURCE_PHOTO_KEY = 'updown_avatar_editor_source_photo_session';
/** base+draw без инициалов — чтобы менять глифы без «затирания» JPEG профиля */
const WORKING_FLAT_KEY = 'updown_avatar_editor_working_flat';
const PROJECT_VERSION = 4;

export type AvatarEditorProjectMeta = {
  profileId: string;
  templateId: AvatarEditorTemplateId;
  initialsSource: AvatarInitialsSource;
  initialsStyle: AvatarInitialsStyle;
  /** @deprecated v3 и ниже — единый режим; читается только в migrate */
  initialsMode?: string;
  initialsColor: string;
  badgeText: string;
  activeFrameId: AvatarFrameId | null;
  baseMode: 'template' | 'photo';
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  /** @deprecated фото больше не персистим в meta; читаем только session */
  hasSourcePhoto: boolean;
  /** 2+ — baseMode пишется честно; 1/нет — при наличии фото режим «photo» был багом сохранения */
  projectVersion?: number;
  updatedAt: string;
};

export type AvatarEditorProject = AvatarEditorProjectMeta & {
  sourcePhotoDataUrl: string | null;
  /** JPEG базы+стикеров без инициалов (если сохраняли после появления слоя) */
  workingFlatDataUrl: string | null;
};

function purgeLegacySourcePhoto(): void {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(LEGACY_SOURCE_PHOTO_KEY);
    }
  } catch {
    /* ignore */
  }
}

function readSessionSourcePhoto(): string | null {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(SESSION_SOURCE_PHOTO_KEY) : null;
    if (!raw || raw.length < 32) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeSessionSourcePhoto(dataUrl: string | null): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    if (dataUrl && dataUrl.length >= 32) {
      sessionStorage.setItem(SESSION_SOURCE_PHOTO_KEY, dataUrl);
    } else {
      sessionStorage.removeItem(SESSION_SOURCE_PHOTO_KEY);
    }
  } catch {
    /* quota */
  }
}

/** Короткий отпечаток data URL — связать working flat с текущим сохранённым аватаром. */
export function avatarDataUrlSig(dataUrl: string | null | undefined): string {
  if (!dataUrl || dataUrl.length < 32) return '';
  const head = dataUrl.slice(0, 48);
  const mid = dataUrl.slice(Math.floor(dataUrl.length / 2), Math.floor(dataUrl.length / 2) + 24);
  const tail = dataUrl.slice(-24);
  return `${dataUrl.length}:${head}:${mid}:${tail}`;
}

function readWorkingFlat(
  profileId: string,
  currentAvatarDataUrl?: string | null,
): string | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(WORKING_FLAT_KEY) : null;
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      profileId?: string;
      dataUrl?: string;
      basedOnSig?: string;
    };
    if (!parsed?.dataUrl || parsed.dataUrl.length < 32) return null;
    if (profileId && parsed.profileId && parsed.profileId !== profileId) return null;
    const currentSig = avatarDataUrlSig(currentAvatarDataUrl);
    /*
     * Working — черновик поверх КОНКРЕТНОГО сохранённого аватара.
     * Иначе аватар Профиля (working) накладывается на аватар Аккаунта при входе.
     * Legacy без basedOnSig: при наличии текущего аватара не доверяем.
     */
    if (currentSig) {
      if (!parsed.basedOnSig || parsed.basedOnSig !== currentSig) {
        try {
          localStorage.removeItem(WORKING_FLAT_KEY);
        } catch {
          /* ignore */
        }
        return null;
      }
    }
    return parsed.dataUrl;
  } catch {
    return null;
  }
}

export function saveAvatarEditorWorkingFlat(
  dataUrl: string | null,
  profileId?: string,
  basedOnAvatarDataUrl?: string | null,
): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (!dataUrl || dataUrl.length < 32) {
      localStorage.removeItem(WORKING_FLAT_KEY);
      return;
    }
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    const basedOnSig = avatarDataUrlSig(basedOnAvatarDataUrl);
    localStorage.setItem(
      WORKING_FLAT_KEY,
      JSON.stringify({
        profileId: pid,
        dataUrl,
        ...(basedOnSig ? { basedOnSig } : {}),
      }),
    );
  } catch {
    /* quota */
  }
}

export function clearAvatarEditorWorkingFlat(): void {
  try {
    if (typeof localStorage !== 'undefined') localStorage.removeItem(WORKING_FLAT_KEY);
  } catch {
    /* ignore */
  }
}

/** Сбросить исходное фото сессии (закрыли редактор / убрали фото). */
export function clearAvatarEditorSourcePhoto(): void {
  writeSessionSourcePhoto(null);
  purgeLegacySourcePhoto();
}

/**
 * Полный сброс локального редактора (гость/Профиль) при входе в аккаунт.
 * Иначе working/meta/плашка гостя накладываются на облачный аватар.
 */
export function clearAvatarEditorLocalState(): void {
  clearAvatarEditorWorkingFlat();
  clearAvatarEditorSourcePhoto();
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(META_KEY);
      localStorage.removeItem('updown_avatar_3d_polish');
    }
  } catch {
    /* ignore */
  }
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem('updown_avatar_pending');
    }
  } catch {
    /* ignore */
  }
}

export function loadAvatarEditorProject(
  profileId?: string,
  currentAvatarDataUrl?: string | null,
): AvatarEditorProject | null {
  purgeLegacySourcePhoto();
  try {
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(META_KEY) : null;
    if (!raw) return null;
    const meta = JSON.parse(raw) as AvatarEditorProjectMeta;
    if (!meta || typeof meta !== 'object') return null;
    if (pid && meta.profileId && meta.profileId !== pid) return null;
    const sourcePhotoDataUrl = readSessionSourcePhoto();
    /* Явный current (открытый редактор) или профиль — отсекает stale working Профиль↔Аккаунт */
    const currentAvatar =
      currentAvatarDataUrl !== undefined
        ? currentAvatarDataUrl
        : (getPlayerProfile().avatarDataUrl ?? null);
    const workingFlatDataUrl = readWorkingFlat(pid, currentAvatar);
    const version = typeof meta.projectVersion === 'number' ? meta.projectVersion : 1;
    let baseMode: 'template' | 'photo' = meta.baseMode === 'photo' ? 'photo' : 'template';
    /* v1: save всегда писал photo при наличии source — не доверяем */
    if (version < 2 && sourcePhotoDataUrl) {
      baseMode = 'template';
    }
    if (baseMode === 'photo' && !sourcePhotoDataUrl) {
      baseMode = 'template';
    }
    let initialsSource: AvatarInitialsSource = 'capitals';
    let initialsStyle: AvatarInitialsStyle = 'off';
    if (isAvatarInitialsSource(meta.initialsSource) && isAvatarInitialsStyle(meta.initialsStyle)) {
      initialsSource = meta.initialsSource;
      initialsStyle = meta.initialsStyle;
    } else {
      const migrated = migrateLegacyInitialsMode(meta.initialsMode);
      initialsSource = migrated.initialsSource;
      initialsStyle = migrated.initialsStyle;
    }
    return {
      ...meta,
      baseMode,
      initialsSource,
      initialsStyle,
      sourcePhotoDataUrl,
      workingFlatDataUrl,
      hasSourcePhoto: Boolean(sourcePhotoDataUrl),
      projectVersion: version,
    };
  } catch {
    return null;
  }
}

export function saveAvatarEditorProject(project: {
  profileId?: string;
  templateId: AvatarEditorTemplateId;
  initialsSource: AvatarInitialsSource;
  initialsStyle: AvatarInitialsStyle;
  initialsColor: string;
  badgeText: string;
  activeFrameId: AvatarFrameId | null;
  baseMode: 'template' | 'photo';
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  sourcePhotoDataUrl: string | null;
}): void {
  try {
    const profileId = project.profileId ?? getPlayerProfile().profileId ?? '';
    const hasSessionPhoto = Boolean(project.sourcePhotoDataUrl && project.sourcePhotoDataUrl.length >= 32);
    /* Фото базы в сохранении авы — только если реально выбран режим photo; иначе не тащим в meta. */
    const baseMode: 'template' | 'photo' =
      project.baseMode === 'photo' && hasSessionPhoto ? 'photo' : 'template';
    const meta: AvatarEditorProjectMeta = {
      profileId,
      templateId: project.templateId,
      initialsSource: isAvatarInitialsSource(project.initialsSource)
        ? project.initialsSource
        : 'capitals',
      /* badge не персистим локально — только в облачном PNG аккаунта */
      initialsStyle:
        isAvatarInitialsStyle(project.initialsStyle) && project.initialsStyle !== 'badge'
          ? project.initialsStyle
          : 'off',
      initialsColor: project.initialsColor,
      badgeText: '',
      activeFrameId: project.activeFrameId,
      baseMode,
      photoScale: project.photoScale,
      photoOffsetX: project.photoOffsetX,
      photoOffsetY: project.photoOffsetY,
      hasSourcePhoto: false,
      projectVersion: PROJECT_VERSION,
      updatedAt: new Date().toISOString(),
    };
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    purgeLegacySourcePhoto();
    if (hasSessionPhoto && baseMode === 'photo') {
      writeSessionSourcePhoto(project.sourcePhotoDataUrl);
    } else {
      writeSessionSourcePhoto(null);
    }
  } catch {
    /* quota / private mode */
  }
}

/** Держать исходное фото только в session (пока редактор открыт / до F5). */
export function rememberAvatarEditorSourcePhoto(dataUrl: string | null): void {
  if (dataUrl && dataUrl.length >= 32) writeSessionSourcePhoto(dataUrl);
  else clearAvatarEditorSourcePhoto();
}
