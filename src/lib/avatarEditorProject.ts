/**
 * Слои редактора аватарки отдельно от «запечённого» JPEG профиля.
 * Иначе при повторном входе инициалы/рамка рисуются поверх уже впечатанных.
 */

import { getPlayerProfile } from '../game/persistence';
import type { AvatarEditorTemplateId, AvatarInitialsMode } from './avatarEditorTemplates';
import type { AvatarFrameId } from './avatarEditorFrames';

const META_KEY = 'updown_avatar_editor_meta';
const SOURCE_PHOTO_KEY = 'updown_avatar_editor_source_photo';

export type AvatarEditorProjectMeta = {
  profileId: string;
  templateId: AvatarEditorTemplateId;
  initialsMode: AvatarInitialsMode;
  initialsColor: string;
  badgeText: string;
  activeFrameId: AvatarFrameId | null;
  baseMode: 'template' | 'photo';
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  hasSourcePhoto: boolean;
  updatedAt: string;
};

export type AvatarEditorProject = AvatarEditorProjectMeta & {
  sourcePhotoDataUrl: string | null;
};

function readSourcePhoto(): string | null {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(SOURCE_PHOTO_KEY) : null;
    if (!raw || raw.length < 32) return null;
    return raw;
  } catch {
    return null;
  }
}

function writeSourcePhoto(dataUrl: string | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (dataUrl && dataUrl.length >= 32) {
      localStorage.setItem(SOURCE_PHOTO_KEY, dataUrl);
    } else {
      localStorage.removeItem(SOURCE_PHOTO_KEY);
    }
  } catch {
    /* quota */
  }
}

export function loadAvatarEditorProject(profileId?: string): AvatarEditorProject | null {
  try {
    const pid = profileId ?? getPlayerProfile().profileId ?? '';
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(META_KEY) : null;
    if (!raw) return null;
    const meta = JSON.parse(raw) as AvatarEditorProjectMeta;
    if (!meta || typeof meta !== 'object') return null;
    if (pid && meta.profileId && meta.profileId !== pid) return null;
    const sourcePhotoDataUrl = meta.hasSourcePhoto ? readSourcePhoto() : null;
    return { ...meta, sourcePhotoDataUrl };
  } catch {
    return null;
  }
}

export function saveAvatarEditorProject(project: {
  profileId?: string;
  templateId: AvatarEditorTemplateId;
  initialsMode: AvatarInitialsMode;
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
    const hasSourcePhoto = Boolean(project.sourcePhotoDataUrl && project.sourcePhotoDataUrl.length >= 32);
    const meta: AvatarEditorProjectMeta = {
      profileId,
      templateId: project.templateId,
      initialsMode: project.initialsMode,
      initialsColor: project.initialsColor,
      badgeText: project.badgeText,
      activeFrameId: project.activeFrameId,
      baseMode: hasSourcePhoto && project.baseMode === 'photo' ? 'photo' : project.baseMode,
      photoScale: project.photoScale,
      photoOffsetX: project.photoOffsetX,
      photoOffsetY: project.photoOffsetY,
      hasSourcePhoto,
      updatedAt: new Date().toISOString(),
    };
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(META_KEY, JSON.stringify(meta));
    writeSourcePhoto(hasSourcePhoto ? project.sourcePhotoDataUrl : null);
  } catch {
    /* quota / private mode */
  }
}
