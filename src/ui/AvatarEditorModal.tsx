/**
 * Редактор аватарки: превью, шаблоны, рисование, стикеры, рамки, 3D-финиш, палитра.
 * Стили: src/styles/avatar-editor.css (подключается из main.tsx ПОСЛЕ index.css).
 */

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AVATAR_BADGE_MAX_CHARS,
  AVATAR_EDITOR_BG_TEMPLATES,
  AVATAR_EDITOR_STYLE_TEMPLATES,
  AVATAR_INITIALS_COLORS,
  AVATAR_INITIALS_MODES,
  defaultAvatarBadgeText,
  hitTestAvatarBadge,
  measureAvatarBadgeLayout,
  normalizeAvatarBadgeText,
  paintAvatarEditorBase,
  drawPhotoWithTransform,
  paintAvatarInitialsByMode,
  clipAvatarCanvasToCircle,
  isAvatarInitialsColor,
  isAvatarInitialsMode,
  type AvatarEditorTemplateId,
  type AvatarInitialsMode,
} from '../lib/avatarEditorTemplates';
import {
  AVATAR_EDITOR_STICKERS,
  drawAvatarSticker,
  type AvatarStickerId,
} from '../lib/avatarEditorStickers';
import {
  AVATAR_EDITOR_FRAMES,
  drawAvatarFrameOnLayer,
  loadAvatarFrameImage,
  type AvatarFrameId,
} from '../lib/avatarEditorFrames';
import { bake3dPolishToBase } from '../lib/avatar3dFinish';
import {
  compressImageToDataUrl,
  exportCircularAvatarJpeg,
  MAX_AVATAR_IMAGE_SIZE_BYTES,
} from '../lib/avatarImage';
import { paintNeonBrushStroke } from '../lib/avatarNeonBrush';
import {
  canUseInPageCamera,
  captureSelfieDataUrl,
  captureVideoElementDataUrl,
  openGalleryPicker,
  openNativeCameraPicker,
  preferNativeCameraPicker,
} from '../lib/avatarCamera';
import { persistAvatarToProfile } from '../lib/profileAvatarSave';
import { loadAvatarEditorProject, saveAvatarEditorProject } from '../lib/avatarEditorProject';
import { AvatarPresetThumb } from './avatarEditor/AvatarPresetThumb';
import { AvatarPresetRail } from './avatarEditor/AvatarPresetRail';
import { AvatarPolishGlyph } from './icons/AvatarPolishGlyph';
import { AvatarNeonColorPicker, BRUSH_QUICK_COLORS } from './AvatarNeonColorPicker';
import { MenuCapsuleCosmicTip } from './MenuCapsuleCosmicTip';
import { MenuNamePlaqueEditMark } from './MenuEntryActions';
import { useDesktopProfileUi } from './useDesktopProfileUi';
import { useT, type TFunc } from '../i18n';

const CANVAS_SIZE = 512;

type AvatarEditorBaseId = 'photo' | 'styles' | 'bg' | 'empty';
type AvatarEditorToolId = 'brush' | 'frames' | 'stickers';
type AvatarEditorSectionId = AvatarEditorBaseId | AvatarEditorToolId;

const AVATAR_EDITOR_BASES: AvatarEditorBaseId[] = ['photo', 'styles', 'bg', 'empty'];
const AVATAR_EDITOR_TOOLS: AvatarEditorToolId[] = ['brush', 'frames', 'stickers'];

function sectionLabel(id: AvatarEditorSectionId, tr: TFunc): string {
  switch (id) {
    case 'photo':
      return tr('avatarEditor.foldPhoto');
    case 'styles':
      return tr('avatarEditor.foldVariants');
    case 'bg':
      return tr('avatarEditor.foldBg');
    case 'empty':
      return tr('avatarEditor.foldEmpty');
    case 'brush':
      return tr('avatarEditor.foldBrush');
    case 'frames':
      return tr('avatarEditor.foldFrames');
    case 'stickers':
      return tr('avatarEditor.foldStickers');
  }
}

function HubArcLabel({ sectionId, text }: { sectionId: AvatarEditorSectionId; text: string }) {
  const uid = useId().replace(/:/g, '');
  const pathId = `hub-arc-${sectionId}-${uid}`;
  const gradId = `hub-crystal-${sectionId}-${uid}`;
  const stops =
    sectionId === 'photo'
      ? (['#ffffff', '#22d3ee', '#e879f9', '#f0abfc'] as const)
      : sectionId === 'styles'
        ? (['#fff7ed', '#facc15', '#fb7185', '#a78bfa'] as const)
        : sectionId === 'bg'
          ? (['#ffffff', '#22d3ee', '#38bdf8', '#c4b5fd'] as const)
          : sectionId === 'empty'
            ? (['#ffffff', '#67e8f9', '#e879f9', '#fde68a'] as const)
            : sectionId === 'brush'
              ? (['#ffffff', '#38bdf8', '#60a5fa', '#a78bfa'] as const)
              : sectionId === 'frames'
                ? (['#ffffff', '#f0abfc', '#e879f9', '#818cf8'] as const)
                : (['#fffbeb', '#fde047', '#f472b6', '#34d399'] as const);
  const oval = sectionId === 'photo';
  /* Длинные подписи («Варианты») — более длинная дуга + мельче кегль в CSS */
  const longLabel = !oval && text.replace(/\s/g, '').length >= 7;
  const pathD = oval
    ? 'M 38,23 A 90,14 0 0 1 102,23'
    : longLabel
      ? 'M 4,66 A 54,54 0 0 0 96,66'
      : 'M 12.3,76.4 A 46,46 0 0 0 87.7,76.4';
  return (
    <svg
      className={[
        'avatar-editor-hub__arc',
        oval ? 'avatar-editor-hub__arc--oval avatar-editor-hub__arc--oval-mid' : '',
        longLabel ? 'avatar-editor-hub__arc--long' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      viewBox={oval ? '0 0 140 46' : '0 0 100 100'}
      aria-hidden
    >
      <defs>
        <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={stops[0]}>
            <animate attributeName="stop-color" values={`${stops[0]};${stops[1]};${stops[0]}`} dur="3.2s" repeatCount="indefinite" />
          </stop>
          <stop offset="40%" stopColor={stops[1]}>
            <animate attributeName="stop-color" values={`${stops[1]};${stops[2]};${stops[1]}`} dur="2.8s" repeatCount="indefinite" />
          </stop>
          <stop offset="70%" stopColor={stops[2]}>
            <animate attributeName="stop-color" values={`${stops[2]};${stops[3]};${stops[2]}`} dur="3.5s" repeatCount="indefinite" />
          </stop>
          <stop offset="100%" stopColor={stops[3]}>
            <animate attributeName="stop-color" values={`${stops[3]};${stops[0]};${stops[3]}`} dur="3s" repeatCount="indefinite" />
          </stop>
        </linearGradient>
        <path id={pathId} d={pathD} fill="none" />
      </defs>
      <text
        className={`avatar-editor-hub__arc-text avatar-editor-hub__arc-text--${sectionId}`}
        fill={`url(#${gradId})`}
        dominantBaseline={oval ? 'middle' : undefined}
      >
        <textPath href={`#${pathId}`} startOffset="50%" textAnchor="middle" {...(oval ? {} : { side: 'right' as const })}>
          {text}
        </textPath>
      </text>
    </svg>
  );
}

function HubSectionGlyph({ id }: { id: AvatarEditorSectionId }) {
  const uid = useId().replace(/:/g, '');
  if (id === 'photo') {
    return (
      <span className="avatar-editor-hub__glyph-pair" aria-hidden>
        <span className="avatar-editor-hub__glyph avatar-editor-hub__glyph--photo-cam">
          <svg className="avatar-editor-hub__glyph-svg" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M9.4 5.2 8.2 6.8H5.5A2.3 2.3 0 0 0 3.2 9.1v8.2A2.3 2.3 0 0 0 5.5 19.6h13a2.3 2.3 0 0 0 2.3-2.3V9.1a2.3 2.3 0 0 0-2.3-2.3h-2.7l-1.2-1.6H9.4Zm2.6 3.7a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 1.7a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"
            />
          </svg>
        </span>
        <span className="avatar-editor-hub__glyph avatar-editor-hub__glyph--photo-gal">
          <svg className="avatar-editor-hub__glyph-svg" viewBox="0 0 24 24" aria-hidden>
            <path
              fill="currentColor"
              d="M5.2 4.2h13.6A2.6 2.6 0 0 1 21.4 6.8v10.4a2.6 2.6 0 0 1-2.6 2.6H5.2a2.6 2.6 0 0 1-2.6-2.6V6.8A2.6 2.6 0 0 1 5.2 4.2Zm1.4 2.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm1.1 10.2h9.8l-3.3-4.4-2.4 3.1-1.6-2-2.5 3.3Z"
            />
          </svg>
        </span>
      </span>
    );
  }
  if (id === 'empty') {
    return <span className="avatar-editor-hub__glyph avatar-editor-hub__glyph--empty" aria-hidden />;
  }
  if (id === 'brush') {
    const gWood = `ae-b-wood-${uid}`;
    const gMetal = `ae-b-metal-${uid}`;
    const gBristle = `ae-b-br-${uid}`;
    const gPaint = `ae-b-paint-${uid}`;
    return (
      <span className="avatar-editor-hub__glyph avatar-editor-hub__glyph--brush" aria-hidden>
        <svg className="avatar-editor-hub__glyph-svg" viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id={gWood} x1="20" y1="1" x2="11" y2="11" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fde68a" />
              <stop offset="0.45" stopColor="#f59e0b" />
              <stop offset="1" stopColor="#92400e" />
            </linearGradient>
            <linearGradient id={gMetal} x1="16" y1="8" x2="10" y2="14" gradientUnits="userSpaceOnUse">
              <stop stopColor="#ffffff" />
              <stop offset="0.4" stopColor="#cbd5e1" />
              <stop offset="1" stopColor="#64748b" />
            </linearGradient>
            <linearGradient id={gBristle} x1="11" y1="12" x2="3" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#bae6fd" />
              <stop offset="0.5" stopColor="#0ea5e9" />
              <stop offset="1" stopColor="#075985" />
            </linearGradient>
            <linearGradient id={gPaint} x1="1" y1="17" x2="8" y2="24" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fb7185" />
              <stop offset="0.45" stopColor="#c084fc" />
              <stop offset="1" stopColor="#22d3ee" />
            </linearGradient>
          </defs>
          {/* деревянная рукоять */}
          <path
            d="M13.9 1.9c1-.95 2.55-.9 3.5.15l4.55 4.9c.95 1.02.9 2.55-.15 3.5l-1.35 1.2-6.85-7.4 1.3-1.35Z"
            fill={`url(#${gWood})`}
          />
          <path
            d="M15.55 3.05c.4-.15.85 0 1.15.4l3.35 3.6"
            stroke="#fff7ed"
            strokeWidth="0.85"
            strokeLinecap="round"
            opacity="0.55"
          />
          {/* металлический ободок */}
          <path
            d="M19.9 9.35 14.7 14.1l-2.7-2.9 5.2-4.75 2.7 2.9Z"
            fill={`url(#${gMetal})`}
          />
          <path d="M18.55 10.65 14.5 14.35" stroke="#f8fafc" strokeWidth="0.6" opacity="0.75" />
          <path d="M17.55 9.7 13.5 13.4" stroke="#475569" strokeWidth="0.5" opacity="0.55" />
          {/* щетина веером */}
          <path
            d="M13.55 12.55c.55 1.15-.15 2.15-1.25 3.2L4.55 22.9c-.85.8-2.15.45-2.45-.7-.2-.7.2-1.35.8-1.85l7.35-6.85c1.05-1 2.35-1.55 3.3-.95Z"
            fill={`url(#${gBristle})`}
          />
          {/* капля краски на кончике */}
          <path
            d="M2.35 19.35c1.55.15 2.85 1.2 3.2 2.7-1.85 1.25-4.35.55-5-.95-.3-.7.2-1.4.9-1.55.3-.07.6-.1.9-.2Z"
            fill={`url(#${gPaint})`}
          />
          <circle cx="2.15" cy="21.55" r="1.15" fill="#f472b6" />
          <circle cx="4.05" cy="22.45" r="0.8" fill="#22d3ee" />
          <circle cx="3.15" cy="20.55" r="0.55" fill="#fde047" opacity="0.95" />
        </svg>
      </span>
    );
  }
  if (id === 'stickers') {
    const gStar = `ae-st-star-${uid}`;
    const gCore = `ae-st-core-${uid}`;
    return (
      <span className="avatar-editor-hub__glyph avatar-editor-hub__glyph--stickers" aria-hidden>
        <svg className="avatar-editor-hub__glyph-svg" viewBox="0 0 24 24" fill="none">
          <defs>
            <linearGradient id={gStar} x1="4" y1="2" x2="20" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#fda4af" />
              <stop offset="0.4" stopColor="#e11d48" />
              <stop offset="1" stopColor="#7e22ce" />
            </linearGradient>
            <radialGradient id={gCore} cx="50%" cy="42%" r="42%">
              <stop stopColor="#fef08a" />
              <stop offset="0.55" stopColor="#facc15" />
              <stop offset="1" stopColor="#eab308" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* ровная 5-конечная звезда */}
          <path
            d="M12 2.2 14.55 9.1H21.8l-5.85 4.25 2.25 6.95L12 16.35 5.8 20.3l2.25-6.95L2.2 9.1h7.25L12 2.2Z"
            fill={`url(#${gStar})`}
          />
          <path
            d="M12 2.2 14.55 9.1H21.8l-5.85 4.25 2.25 6.95L12 16.35 5.8 20.3l2.25-6.95L2.2 9.1h7.25L12 2.2Z"
            fill={`url(#${gCore})`}
          />
          <path
            d="M12 4.35 13.95 9.75l.2.55h5.65l-4.55 3.3-.45.33.17.55 1.7 5.25-4.5-3.25-.47-.34-.47.34-4.5 3.25 1.7-5.25.17-.55-.45-.33-4.55-3.3h5.65l.2-.55L12 4.35Z"
            stroke="#fecdd3"
            strokeWidth="0.7"
            strokeLinejoin="round"
            opacity="0.55"
          />
          {/* маленький блик-стикер */}
          <circle cx="17.8" cy="5.2" r="1.55" fill="#67e8f9" opacity="0.95" />
          <circle cx="18.15" cy="4.85" r="0.55" fill="#ecfeff" opacity="0.9" />
        </svg>
      </span>
    );
  }
  return <span className={`avatar-editor-hub__glyph avatar-editor-hub__glyph--${id}`} aria-hidden />;
}
const MAX_UNDO = 24;

const BRUSH_SIZES = [4, 8, 14] as const;
const GLYPH_MODES: AvatarInitialsMode[] = [...AVATAR_INITIALS_MODES];

function templateAriaLabel(id: AvatarEditorTemplateId, tr: TFunc): string {
  switch (id) {
    case 'monogram':
      return tr('avatarEditor.monogram');
    case 'soft-disk':
      return tr('avatarEditor.softDisk');
    case 'status-ring':
      return tr('avatarEditor.statusRing');
    case 'silhouette':
      return tr('avatarEditor.silhouette');
    case 'bluff':
      return tr('avatarEditor.bluff');
    case 'lucky-7':
      return tr('avatarEditor.lucky7');
    case 'mirror':
      return tr('avatarEditor.mirror');
    case 'player-rise':
      return tr('avatarEditor.playerRise');
    case 'nebula':
      return tr('avatarEditor.nebula');
    case 'aurora':
      return tr('avatarEditor.aurora');
    case 'ember':
      return tr('avatarEditor.ember');
    case 'violet-crown':
      return tr('avatarEditor.violetCrown');
    case 'deep-space':
      return tr('avatarEditor.deepSpace');
    case 'prism':
      return tr('avatarEditor.prism');
    case 'none':
      return tr('avatarEditor.none');
    case 'elite-black':
      return tr('avatarEditor.eliteBlack');
    case 'neutral':
      return tr('avatarEditor.neutral');
    case 'plaid-iris':
      return tr('avatarEditor.plaidIris');
    case 'plaid-sand':
      return tr('avatarEditor.plaidSand');
    default:
      return id;
  }
}

function glyphAriaLabel(mode: AvatarInitialsMode, tr: TFunc): string {
  switch (mode) {
    case 'letters':
      return tr('avatarEditor.glyphLetters');
    case 'letters-digits':
      return tr('avatarEditor.glyphLettersDigits');
    case 'arc':
      return tr('avatarEditor.glyphArc');
    case 'ghost':
      return tr('avatarEditor.glyphGhost');
    case 'neon':
      return tr('avatarEditor.glyphNeon');
    case 'badge':
      return tr('avatarEditor.glyphBadge');
    case 'off':
    default:
      return tr('avatarEditor.glyphOff');
  }
}

function glyphTipDetail(mode: AvatarInitialsMode, tr: TFunc): string {
  switch (mode) {
    case 'letters':
      return tr('avatarEditor.glyphLettersDetail');
    case 'letters-digits':
      return tr('avatarEditor.glyphLettersDigitsDetail');
    case 'arc':
      return tr('avatarEditor.glyphArcDetail');
    case 'ghost':
      return tr('avatarEditor.glyphGhostDetail');
    case 'neon':
      return tr('avatarEditor.glyphNeonDetail');
    case 'badge':
      return tr('avatarEditor.glyphBadgeDetail');
    case 'off':
    default:
      return tr('avatarEditor.glyphOffDetail');
  }
}

function stickerLabel(id: AvatarStickerId, tr: TFunc): string {
  if (id === 'spade') return tr('avatarEditor.stickerSpade');
  if (id === 'heart') return tr('avatarEditor.stickerHeart');
  if (id === 'diamond') return tr('avatarEditor.stickerDiamond');
  if (id === 'club') return tr('avatarEditor.stickerClub');
  if (id === 'star') return tr('avatarEditor.stickerStar');
  if (id === 'sparkle') return tr('avatarEditor.stickerSparkle');
  return tr('avatarEditor.stickerRing');
}

function frameLabel(id: AvatarFrameId, tr: TFunc): string {
  if (id === 'cosmic') return tr('avatarEditor.frameCosmic');
  if (id === 'gold') return tr('avatarEditor.frameGold');
  if (id === 'neon') return tr('avatarEditor.frameNeon');
  if (id === 'orbit') return tr('avatarEditor.frameOrbit');
  return id;
}

type EditorTool = 'brush' | 'eraser' | 'sticker' | 'photo';

type EditorMeta = {
  baseMode: 'template' | 'photo';
  templateId: AvatarEditorTemplateId;
  initialsMode: AvatarInitialsMode;
  initialsColor: string;
  badgeText: string;
  activeFrameId: AvatarFrameId | null;
  photoDataUrl: string | null;
  sourcePhotoDataUrl: string | null;
  photoIsComposite: boolean;
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  polishApplied: boolean;
};

type UndoEntry =
  | { kind: 'draw'; draw: ImageData }
  | { kind: 'all'; base: ImageData; draw: ImageData; meta: EditorMeta };

const PHOTO_SCALE_MIN = 0.35;
const PHOTO_SCALE_MAX = 2.8;

function fingerprintEditorState(meta: EditorMeta, draw: HTMLCanvasElement | null): string {
  let drawSig = '0';
  if (draw) {
    const ctx = draw.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      const { data } = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      let h = 2166136261;
      let ink = 0;
      for (let i = 3; i < data.length; i += 48) {
        const a = data[i]!;
        if (a > 10) ink += 1;
        h ^= data[i - 3]! | (data[i - 2]! << 8) | (a << 16);
        h = Math.imul(h, 16777619);
      }
      drawSig = ink === 0 ? '0' : String(h >>> 0);
    }
  }
  return [
    meta.baseMode,
    meta.templateId,
    meta.initialsMode,
    meta.initialsColor,
    meta.badgeText,
    meta.activeFrameId ?? '',
    meta.photoDataUrl ?? '',
    meta.sourcePhotoDataUrl ?? '',
    meta.photoIsComposite ? '1' : '0',
    meta.photoScale,
    meta.photoOffsetX,
    meta.photoOffsetY,
    meta.polishApplied ? '1' : '0',
    drawSig,
  ].join('|');
}

export interface AvatarEditorModalProps {
  displayName: string;
  initialAvatarDataUrl?: string | null;
  onSave: (avatarDataUrl: string | null) => void;
  onCancel: () => void;
  /** Сразу после выбора/селфи — до «Сохранить» (камера на телефоне часто перезагружает вкладку). */
  onPhotoCaptured?: (avatarDataUrl: string) => void;
}

export function AvatarEditorModal({
  displayName,
  initialAvatarDataUrl = null,
  onSave,
  onCancel,
  onPhotoCaptured,
}: AvatarEditorModalProps) {
  const tr = useT();
  const isDesktopProfileUi = useDesktopProfileUi();
  const displayCanvasRef = useRef<HTMLCanvasElement>(null);
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const undoStackRef = useRef<UndoEntry[]>([]);
  const redoStackRef = useRef<UndoEntry[]>([]);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const drawingRef = useRef(false);
  const undoPushedForStrokeRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const photoPanRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const photoImageCacheRef = useRef<{ url: string; img: HTMLImageElement } | null>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);

  const boot = (() => {
    const project = loadAvatarEditorProject();
    if (project?.sourcePhotoDataUrl) {
      return {
        templateId: project.templateId,
        initialsMode: isAvatarInitialsMode(project.initialsMode) ? project.initialsMode : 'off',
        initialsColor: isAvatarInitialsColor(project.initialsColor)
          ? project.initialsColor
          : AVATAR_INITIALS_COLORS[0],
        badgeText: project.badgeText?.length
          ? normalizeAvatarBadgeText(project.badgeText)
          : defaultAvatarBadgeText(displayName),
        activeFrameId: project.activeFrameId,
        baseMode: (project.baseMode === 'photo' ? 'photo' : 'template') as 'template' | 'photo',
        photoDataUrl: project.sourcePhotoDataUrl as string | null,
        sourcePhotoDataUrl: project.sourcePhotoDataUrl as string | null,
        photoIsComposite: false,
        photoScale: project.photoScale || 1,
        photoOffsetX: project.photoOffsetX || 0,
        photoOffsetY: project.photoOffsetY || 0,
      };
    }
    if (project && !project.hasSourcePhoto) {
      return {
        templateId: project.templateId,
        initialsMode: isAvatarInitialsMode(project.initialsMode) ? project.initialsMode : 'off',
        initialsColor: isAvatarInitialsColor(project.initialsColor)
          ? project.initialsColor
          : AVATAR_INITIALS_COLORS[0],
        badgeText: project.badgeText?.length
          ? normalizeAvatarBadgeText(project.badgeText)
          : defaultAvatarBadgeText(displayName),
        activeFrameId: project.activeFrameId,
        baseMode: 'template' as const,
        photoDataUrl: null as string | null,
        sourcePhotoDataUrl: null as string | null,
        photoIsComposite: false,
        photoScale: 1,
        photoOffsetX: 0,
        photoOffsetY: 0,
      };
    }
    /* Старый «запечённый» JPEG без исходника — только просмотр, слои не накладываем сверху */
    return {
      templateId: 'neutral' as AvatarEditorTemplateId,
      initialsMode: 'off' as AvatarInitialsMode,
      initialsColor: AVATAR_INITIALS_COLORS[0],
      badgeText: defaultAvatarBadgeText(displayName),
      activeFrameId: null as AvatarFrameId | null,
      baseMode: (initialAvatarDataUrl ? 'photo' : 'template') as 'template' | 'photo',
      photoDataUrl: initialAvatarDataUrl,
      sourcePhotoDataUrl: null as string | null,
      photoIsComposite: Boolean(initialAvatarDataUrl),
      photoScale: 1,
      photoOffsetX: 0,
      photoOffsetY: 0,
    };
  })();

  const [templateId, setTemplateId] = useState<AvatarEditorTemplateId>(boot.templateId);
  const [initialsMode, setInitialsMode] = useState<AvatarInitialsMode>(boot.initialsMode);
  const [initialsColor, setInitialsColor] = useState<string>(boot.initialsColor);
  const [initialsColorOpen, setInitialsColorOpen] = useState(false);
  const [initialsExpanded, setInitialsExpanded] = useState(false);
  const [badgeText, setBadgeText] = useState(boot.badgeText);
  const [badgeEditing, setBadgeEditing] = useState(false);
  const [badgeDraft, setBadgeDraft] = useState('');
  const badgeInputRef = useRef<HTMLInputElement | null>(null);
  const [badgePencilTipOpen, setBadgePencilTipOpen] = useState(false);
  const badgePencilTipId = useId();
  const initialsColorWrapRef = useRef<HTMLDivElement | null>(null);
  const [baseMode, setBaseMode] = useState<'template' | 'photo'>(boot.baseMode);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(boot.photoDataUrl);
  const [sourcePhotoDataUrl, setSourcePhotoDataUrl] = useState<string | null>(boot.sourcePhotoDataUrl);
  const [photoIsComposite, setPhotoIsComposite] = useState(boot.photoIsComposite);
  const [photoScale, setPhotoScale] = useState(boot.photoScale);
  const [photoOffsetX, setPhotoOffsetX] = useState(boot.photoOffsetX);
  const [photoOffsetY, setPhotoOffsetY] = useState(boot.photoOffsetY);
  const [brushColor, setBrushColor] = useState<string>(BRUSH_QUICK_COLORS[0]);
  const [brushNeon, setBrushNeon] = useState(true);
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1]);
  const [tool, setTool] = useState<EditorTool>('brush');
  const [stickerId, setStickerId] = useState<AvatarStickerId>('star');
  const [activeFrameId, setActiveFrameId] = useState<AvatarFrameId | null>(boot.activeFrameId);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [polishApplied, setPolishApplied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [inPageCameraOpen, setInPageCameraOpen] = useState(false);
  const [foldSection, setFoldSection] = useState<AvatarEditorSectionId | null>(null);
  const [variantBlockedHint, setVariantBlockedHint] = useState(false);
  const [baseChosen, setBaseChosen] = useState(() => Boolean(initialAvatarDataUrl));
  const [isDirty, setIsDirty] = useState(false);
  const [toolsLockTipOpen, setToolsLockTipOpen] = useState(false);
  const toolsLockAnchorRef = useRef<HTMLButtonElement | null>(null);
  const toolsLockTipTimerRef = useRef<number | null>(null);
  const savedFingerprintRef = useRef<string | null>(null);

  const ensureBuffers = useCallback(() => {
    if (!baseCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      baseCanvasRef.current = c;
    }
    if (!drawCanvasRef.current) {
      const c = document.createElement('canvas');
      c.width = CANVAS_SIZE;
      c.height = CANVAS_SIZE;
      drawCanvasRef.current = c;
    }
    return { base: baseCanvasRef.current, draw: drawCanvasRef.current };
  }, []);

  const compositeToDisplay = useCallback(() => {
    const display = displayCanvasRef.current;
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!display || !base || !draw) return;
    const ctx = display.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(draw, 0, 0);
    if (frameImageRef.current) {
      drawAvatarFrameOnLayer(ctx, CANVAS_SIZE, frameImageRef.current);
    }
  }, []);

  const getEditorMeta = useCallback(
    (): EditorMeta => ({
      baseMode,
      templateId,
      initialsMode,
      initialsColor,
      badgeText,
      activeFrameId,
      photoDataUrl,
      sourcePhotoDataUrl,
      photoIsComposite,
      photoScale,
      photoOffsetX,
      photoOffsetY,
      polishApplied,
    }),
    [
      baseMode,
      templateId,
      initialsMode,
      initialsColor,
      badgeText,
      activeFrameId,
      photoDataUrl,
      sourcePhotoDataUrl,
      photoIsComposite,
      photoScale,
      photoOffsetX,
      photoOffsetY,
      polishApplied,
    ],
  );

  const restoreEditorMeta = useCallback((meta: EditorMeta) => {
    setBaseMode(meta.baseMode);
    setTemplateId(meta.templateId);
    setInitialsMode(isAvatarInitialsMode(meta.initialsMode) ? meta.initialsMode : 'off');
    setInitialsColor(isAvatarInitialsColor(meta.initialsColor) ? meta.initialsColor : AVATAR_INITIALS_COLORS[0]);
    setBadgeText(
      typeof meta.badgeText === 'string' && meta.badgeText.length
        ? normalizeAvatarBadgeText(meta.badgeText)
        : defaultAvatarBadgeText(displayName),
    );
    setBadgeEditing(false);
    setActiveFrameId(meta.activeFrameId ?? null);
    setPhotoDataUrl(meta.photoDataUrl);
    setSourcePhotoDataUrl(meta.sourcePhotoDataUrl ?? null);
    setPhotoIsComposite(Boolean(meta.photoIsComposite));
    setPhotoScale(meta.photoScale);
    setPhotoOffsetX(meta.photoOffsetX);
    setPhotoOffsetY(meta.photoOffsetY);
    setPolishApplied(meta.polishApplied);
    if (meta.photoDataUrl !== photoImageCacheRef.current?.url) {
      photoImageCacheRef.current = null;
    }
  }, [displayName]);

  const clearRedo = useCallback(() => {
    redoStackRef.current = [];
    setCanRedo(false);
  }, []);

  const captureFullState = useCallback((): UndoEntry | null => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return null;
    const bCtx = base.getContext('2d');
    const dCtx = draw.getContext('2d');
    if (!bCtx || !dCtx) return null;
    return {
      kind: 'all',
      base: bCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      draw: dCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      meta: getEditorMeta(),
    };
  }, [getEditorMeta]);

  const applyHistoryEntry = useCallback(
    (snap: UndoEntry) => {
      const base = baseCanvasRef.current;
      const draw = drawCanvasRef.current;
      if (!base || !draw) return;
      const bCtx = base.getContext('2d');
      const dCtx = draw.getContext('2d');
      if (!bCtx || !dCtx) return;
      if (snap.kind === 'all') {
        bCtx.putImageData(snap.base, 0, 0);
        dCtx.putImageData(snap.draw, 0, 0);
        restoreEditorMeta(snap.meta);
      } else {
        dCtx.putImageData(snap.draw, 0, 0);
      }
      compositeToDisplay();
    },
    [restoreEditorMeta, compositeToDisplay],
  );

  const pushUndoDraw = useCallback(() => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    clearRedo();
    undoStackRef.current.push({ kind: 'draw', draw: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [clearRedo]);

  const pushUndoAll = useCallback(() => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return;
    const bCtx = base.getContext('2d');
    const dCtx = draw.getContext('2d');
    if (!bCtx || !dCtx) return;
    clearRedo();
    undoStackRef.current.push({
      kind: 'all',
      base: bCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      draw: dCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      meta: getEditorMeta(),
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [getEditorMeta, clearRedo]);

  const handleUndo = useCallback(() => {
    if (undoStackRef.current.length === 0) return;
    const current = captureFullState();
    if (!current) return;
    redoStackRef.current.push(current);
    if (redoStackRef.current.length > MAX_UNDO) redoStackRef.current.shift();

    const snap = undoStackRef.current.pop()!;
    applyHistoryEntry(snap);
    setCanUndo(undoStackRef.current.length > 0);
    setCanRedo(true);
  }, [captureFullState, applyHistoryEntry]);

  const handleRedo = useCallback(() => {
    if (redoStackRef.current.length === 0) return;
    const current = captureFullState();
    if (!current) return;
    undoStackRef.current.push(current);
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();

    const snap = redoStackRef.current.pop()!;
    applyHistoryEntry(snap);
    setCanRedo(redoStackRef.current.length > 0);
    setCanUndo(true);
  }, [captureFullState, applyHistoryEntry]);

  const loadPhotoImage = useCallback((url: string) => {
    if (photoImageCacheRef.current?.url === url) {
      return Promise.resolve(photoImageCacheRef.current.img);
    }
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        photoImageCacheRef.current = { url, img };
        resolve(img);
      };
      img.onerror = () => reject(new Error('photo'));
      img.src = url;
    });
  }, []);

  const redrawGenRef = useRef(0);

  const redrawBase = useCallback(async () => {
    const gen = ++redrawGenRef.current;
    const { base } = ensureBuffers();
    const ctx = base.getContext('2d');
    if (!ctx) return;
    const hideBadge = initialsMode === 'badge';
    /* Запечённый JPEG — без повторного слоя инициалов; badge — HTML-оверлей */
    const paintMode = photoIsComposite || hideBadge ? 'off' : initialsMode;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (baseMode === 'photo' && photoDataUrl) {
      try {
        const img = await loadPhotoImage(photoDataUrl);
        if (gen !== redrawGenRef.current) return;
        paintAvatarEditorBase(ctx, CANVAS_SIZE, templateId, displayName, 'off');
        drawPhotoWithTransform(ctx, CANVAS_SIZE, img, photoScale, photoOffsetX, photoOffsetY);
        if (paintMode === 'badge') {
          clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
          paintAvatarInitialsByMode(
            ctx,
            CANVAS_SIZE,
            displayName,
            'badge',
            initialsColor,
            badgeText,
          );
        } else if (paintMode !== 'off') {
          paintAvatarInitialsByMode(
            ctx,
            CANVAS_SIZE,
            displayName,
            paintMode,
            initialsColor,
            badgeText,
          );
        } else if (hideBadge) {
          clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
        }
      } catch {
        if (gen !== redrawGenRef.current) return;
        paintAvatarEditorBase(
          ctx,
          CANVAS_SIZE,
          templateId,
          displayName,
          paintMode,
          initialsColor,
          badgeText,
        );
        if (hideBadge) clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
      }
    } else {
      paintAvatarEditorBase(
        ctx,
        CANVAS_SIZE,
        templateId,
        displayName,
        paintMode,
        initialsColor,
        badgeText,
      );
      if (hideBadge) clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
    }
    if (gen !== redrawGenRef.current) return;
    compositeToDisplay();
  }, [
    baseMode,
    photoDataUrl,
    templateId,
    initialsMode,
    initialsColor,
    badgeText,
    badgeEditing,
    photoIsComposite,
    displayName,
    photoScale,
    photoOffsetX,
    photoOffsetY,
    ensureBuffers,
    compositeToDisplay,
    loadPhotoImage,
  ]);

  useEffect(() => {
    const display = displayCanvasRef.current;
    if (display) {
      display.width = CANVAS_SIZE;
      display.height = CANVAS_SIZE;
    }
    ensureBuffers();
    let cancelled = false;
    void redrawBase().then(() => {
      if (cancelled) return;
      if (savedFingerprintRef.current === null) {
        savedFingerprintRef.current = fingerprintEditorState(getEditorMeta(), drawCanvasRef.current);
        setIsDirty(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ensureBuffers, redrawBase, getEditorMeta]);

  useEffect(() => {
    if (!initialsColorOpen && !initialsExpanded) return;
    const onPointer = (e: PointerEvent) => {
      const wrap = initialsColorWrapRef.current;
      if (initialsColorOpen && wrap && !wrap.contains(e.target as Node)) {
        setInitialsColorOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (initialsColorOpen) {
        setInitialsColorOpen(false);
        return;
      }
      if (initialsExpanded) setInitialsExpanded(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [initialsColorOpen, initialsExpanded]);

  useEffect(() => {
    if (savedFingerprintRef.current === null) return;
    const id = window.requestAnimationFrame(() => {
      const fp = fingerprintEditorState(getEditorMeta(), drawCanvasRef.current);
      setIsDirty(fp !== savedFingerprintRef.current);
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    getEditorMeta,
    baseMode,
    templateId,
    initialsMode,
    initialsColor,
    badgeText,
    activeFrameId,
    photoDataUrl,
    photoScale,
    photoOffsetX,
    photoOffsetY,
    polishApplied,
    canUndo,
    canRedo,
  ]);

  const selectBackground = (id: AvatarEditorTemplateId) => {
    pushUndoAll();
    const draw = drawCanvasRef.current;
    const dctx = draw?.getContext('2d');
    if (dctx && draw) dctx.clearRect(0, 0, draw.width, draw.height);
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      photoImageCacheRef.current = null;
    }
    setTemplateId(id);
    setBaseMode('template');
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  const selectStylePreset = (id: AvatarEditorTemplateId) => {
    pushUndoAll();
    const draw = drawCanvasRef.current;
    const dctx = draw?.getContext('2d');
    if (dctx && draw) dctx.clearRect(0, 0, draw.width, draw.height);
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      photoImageCacheRef.current = null;
    }
    setVariantBlockedHint(false);
    setTemplateId(id);
    setInitialsMode('off');
    setActiveFrameId(null);
    setBaseMode('template');
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  const selectEmptyBase = () => {
    pushUndoAll();
    const draw = drawCanvasRef.current;
    const dctx = draw?.getContext('2d');
    if (dctx && draw) dctx.clearRect(0, 0, draw.width, draw.height);
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      photoImageCacheRef.current = null;
    }
    setTemplateId('none');
    setInitialsMode('off');
    setActiveFrameId(null);
    setBaseMode('template');
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  const selectGlyphMode = (mode: AvatarInitialsMode) => {
    pushUndoAll();
    /* Не рисовать инициалы поверх уже запечённого JPEG */
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      photoImageCacheRef.current = null;
      setBaseMode('template');
    } else if (sourcePhotoDataUrl) {
      setPhotoDataUrl(sourcePhotoDataUrl);
      setBaseMode('photo');
    }
    setInitialsMode(mode);
    if (mode === 'badge' && !badgeText) {
      setBadgeText(defaultAvatarBadgeText(displayName));
    }
    if (mode !== 'badge') setBadgeEditing(false);
    if (mode !== 'off' && AVATAR_EDITOR_STYLE_TEMPLATES.some((t) => t.id === templateId)) {
      setTemplateId('neutral');
      if (!sourcePhotoDataUrl) setBaseMode('template');
    }
    setVariantBlockedHint(false);
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  const openBadgeEditor = useCallback(() => {
    setBadgePencilTipOpen(false);
    setBadgeDraft(badgeText || defaultAvatarBadgeText(displayName));
    setBadgeEditing(true);
  }, [badgeText, displayName]);

  const cancelBadgeEditor = useCallback(() => {
    setBadgeEditing(false);
    setBadgeDraft(badgeText);
  }, [badgeText]);

  const commitBadgeEditor = useCallback(() => {
    const next = normalizeAvatarBadgeText(badgeDraft) || defaultAvatarBadgeText(displayName);
    if (next !== badgeText) {
      pushUndoAll();
      setBadgeText(next);
      setPolishApplied(false);
    }
    setBadgeEditing(false);
  }, [badgeDraft, badgeText, displayName]);

  useEffect(() => {
    if (!badgeEditing) return;
    const id = window.requestAnimationFrame(() => {
      badgeInputRef.current?.focus();
      badgeInputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(id);
  }, [badgeEditing]);

  useEffect(() => {
    if (!badgeEditing) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        cancelBadgeEditor();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [badgeEditing, cancelBadgeEditor]);

  const selectInitialsColor = (color: string) => {
    if (color === initialsColor) {
      setInitialsColorOpen(false);
      return;
    }
    pushUndoAll();
    setInitialsColor(color);
    setInitialsColorOpen(false);
    setPolishApplied(false);
    setError(null);
  };

  const openInitialsPanel = useCallback(() => {
    setInitialsExpanded(true);
  }, []);

  const toggleInitialsExpanded = useCallback(() => {
    setInitialsExpanded((v) => {
      if (v) setInitialsColorOpen(false);
      return !v;
    });
  }, []);

  const showToolsLockedTip = useCallback((anchor: HTMLButtonElement) => {
    toolsLockAnchorRef.current = anchor;
    setToolsLockTipOpen(true);
    if (toolsLockTipTimerRef.current != null) {
      window.clearTimeout(toolsLockTipTimerRef.current);
    }
    toolsLockTipTimerRef.current = window.setTimeout(() => {
      setToolsLockTipOpen(false);
      toolsLockTipTimerRef.current = null;
    }, 5200);
  }, []);

  const dismissToolsLockedTip = useCallback(() => {
    if (toolsLockTipTimerRef.current != null) {
      window.clearTimeout(toolsLockTipTimerRef.current);
      toolsLockTipTimerRef.current = null;
    }
    setToolsLockTipOpen(false);
  }, []);

  useEffect(() => {
    return () => {
      if (toolsLockTipTimerRef.current != null) {
        window.clearTimeout(toolsLockTipTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (baseChosen && toolsLockTipOpen) {
      dismissToolsLockedTip();
    }
  }, [baseChosen, toolsLockTipOpen, dismissToolsLockedTip]);

  const baseTabOpen =
    foldSection === 'photo' ||
    foldSection === 'styles' ||
    foldSection === 'bg' ||
    foldSection === 'empty';
  const noPhotoBesideClear = Boolean(sourcePhotoDataUrl || (photoDataUrl && !photoIsComposite)) && !baseTabOpen;

  const restorePhotoMode = () => {
    if (!sourcePhotoDataUrl) return;
    pushUndoAll();
    setPhotoDataUrl(sourcePhotoDataUrl);
    setPhotoIsComposite(false);
    setBaseMode('photo');
    setTool('photo');
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  const handleRemovePhoto = () => {
    redrawGenRef.current += 1;
    pushUndoAll();
    setPhotoDataUrl(null);
    setSourcePhotoDataUrl(null);
    setPhotoIsComposite(false);
    photoImageCacheRef.current = null;
    setPhotoScale(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setBaseMode('template');
    setTool('brush');
    setPolishApplied(false);
    setVariantBlockedHint(false);
    if (selfieInputRef.current) selfieInputRef.current.value = '';
    if (galleryInputRef.current) galleryInputRef.current.value = '';
  };

  const changePhotoScale = (delta: number) => {
    if (!photoDataUrl || baseMode !== 'photo') return;
    pushUndoAll();
    setPhotoScale((s) => Math.min(PHOTO_SCALE_MAX, Math.max(PHOTO_SCALE_MIN, Math.round((s + delta) * 100) / 100)));
  };

  const clearDrawing = () => {
    pushUndoDraw();
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    compositeToDisplay();
  };

  const applyFrame = (frameId: AvatarFrameId) => {
    pushUndoAll();
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      photoImageCacheRef.current = null;
      setBaseMode(sourcePhotoDataUrl ? 'photo' : 'template');
      if (sourcePhotoDataUrl) setPhotoDataUrl(sourcePhotoDataUrl);
    }
    setError(null);
    setActiveFrameId((prev) => (prev === frameId ? null : frameId));
  };

  useEffect(() => {
    if (!activeFrameId) {
      frameImageRef.current = null;
      compositeToDisplay();
      return;
    }
    const def = AVATAR_EDITOR_FRAMES.find((f) => f.id === activeFrameId);
    if (!def) {
      frameImageRef.current = null;
      compositeToDisplay();
      return;
    }
    let cancelled = false;
    void loadAvatarFrameImage(def.src)
      .then((img) => {
        if (cancelled) return;
        frameImageRef.current = img;
        compositeToDisplay();
      })
      .catch(() => {
        if (cancelled) return;
        frameImageRef.current = null;
        setError(tr('avatarEditor.frameFail'));
        setActiveFrameId(null);
        compositeToDisplay();
      });
    return () => {
      cancelled = true;
    };
  }, [activeFrameId, compositeToDisplay, tr]);

  const apply3dPolish = () => {
    const { base, draw } = ensureBuffers();
    pushUndoAll();
    bake3dPolishToBase(base, draw, CANVAS_SIZE);
    setPolishApplied(true);
    compositeToDisplay();
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  };

  const placeSticker = (x: number, y: number) => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    drawAvatarSticker(ctx, x, y, stickerId, brushColor, 1);
    compositeToDisplay();
  };

  const strokeTo = (x: number, y: number) => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    const last = lastPointRef.current;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = brushSize;
    if (tool === 'eraser') {
      ctx.globalCompositeOperation = 'destination-out';
      ctx.strokeStyle = 'rgba(0,0,0,1)';
    } else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = brushColor;
    }
    ctx.beginPath();
    if (last) {
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(x, y);
    } else {
      ctx.moveTo(x, y);
      ctx.lineTo(x, y);
    }
    if (tool === 'eraser') {
      ctx.stroke();
    } else if (brushNeon) {
      paintNeonBrushStroke(ctx, brushColor, brushSize);
    } else {
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
    lastPointRef.current = { x, y };
    compositeToDisplay();
  };

  const endStroke = () => {
    drawingRef.current = false;
    undoPushedForStrokeRef.current = false;
    lastPointRef.current = null;
    photoPanRef.current = null;
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = canvasPoint(e.clientX, e.clientY);
    if (!p) return;

    if (initialsMode === 'badge' && !badgeEditing) {
      if (hitTestAvatarBadge(CANVAS_SIZE, badgeText, p.x, p.y)) {
        openBadgeEditor();
        return;
      }
    }

    if (tool === 'sticker') {
      pushUndoDraw();
      placeSticker(p.x, p.y);
      return;
    }

    if (tool === 'photo' && photoDataUrl && baseMode === 'photo') {
      pushUndoAll();
      photoPanRef.current = { startX: p.x, startY: p.y, ox: photoOffsetX, oy: photoOffsetY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    drawingRef.current = true;
    if (!undoPushedForStrokeRef.current) {
      pushUndoDraw();
      undoPushedForStrokeRef.current = true;
    }
    strokeTo(p.x, p.y);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === 'photo' && photoPanRef.current) {
      const p = canvasPoint(e.clientX, e.clientY);
      if (!p) return;
      const pan = photoPanRef.current;
      setPhotoOffsetX(pan.ox + (p.x - pan.startX));
      setPhotoOffsetY(pan.oy + (p.y - pan.startY));
      return;
    }
    if (!drawingRef.current && initialsMode === 'badge' && !badgeEditing) {
      const p = canvasPoint(e.clientX, e.clientY);
      const hot = Boolean(p && hitTestAvatarBadge(CANVAS_SIZE, badgeText, p.x, p.y));
      e.currentTarget.style.cursor = hot ? 'pointer' : '';
    }
    if (!drawingRef.current || tool === 'sticker') return;
    const p = canvasPoint(e.clientX, e.clientY);
    if (p) strokeTo(p.x, p.y);
  };

  const applyPhotoDataUrl = (dataUrl: string) => {
    pushUndoAll();
    setError(null);
    setPolishApplied(false);
    photoImageCacheRef.current = null;
    setPhotoDataUrl(dataUrl);
    setSourcePhotoDataUrl(dataUrl);
    setPhotoIsComposite(false);
    setBaseMode('photo');
    setPhotoScale(1);
    setPhotoOffsetX(0);
    setPhotoOffsetY(0);
    setTool('photo');
    setBaseChosen(true);
    void persistAvatarToProfile(dataUrl)
      .then((compressed) => {
        onPhotoCaptured?.(compressed);
      })
      .catch(() => {
        onPhotoCaptured?.(dataUrl);
      });
  };

  const stopInPageCamera = useCallback(() => {
    for (const t of cameraStreamRef.current?.getTracks() ?? []) t.stop();
    cameraStreamRef.current = null;
    setInPageCameraOpen(false);
  }, []);

  useEffect(() => {
    if (!inPageCameraOpen) return undefined;
    let cancelled = false;
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        cameraStreamRef.current = stream;
        const video = cameraVideoRef.current;
        if (video) {
          video.srcObject = stream;
          await video.play();
        }
      } catch (e) {
        setInPageCameraOpen(false);
        if (preferNativeCameraPicker()) {
          openNativeCameraPicker(selfieInputRef.current);
        } else {
          setError(e instanceof Error ? e.message : tr('nameAvatar.cameraFail'));
        }
      }
    })();
    return () => {
      cancelled = true;
      for (const t of cameraStreamRef.current?.getTracks() ?? []) t.stop();
      cameraStreamRef.current = null;
    };
  }, [inPageCameraOpen]);

  const handleSelfie = async () => {
    if (selfieBusy || saving || inPageCameraOpen) return;
    if (canUseInPageCamera()) {
      setError(null);
      setInPageCameraOpen(true);
      return;
    }
    if (preferNativeCameraPicker()) {
      openNativeCameraPicker(selfieInputRef.current);
      return;
    }
    setSelfieBusy(true);
    setError(null);
    try {
      const dataUrl = await captureSelfieDataUrl();
      applyPhotoDataUrl(dataUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('nameAvatar.cameraFail'));
    } finally {
      setSelfieBusy(false);
    }
  };

  const handleInPageCameraCapture = async () => {
    const video = cameraVideoRef.current;
    if (!video) return;
    setSelfieBusy(true);
    setError(null);
    try {
      applyPhotoDataUrl(await captureVideoElementDataUrl(video));
      stopInPageCamera();
    } catch (e) {
      setError(e instanceof Error ? e.message : tr('nameAvatar.shotFail'));
    } finally {
      setSelfieBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setError(tr('avatarEditor.pickImage'));
      return;
    }
    if (file.size > MAX_AVATAR_IMAGE_SIZE_BYTES) {
      setError(tr('nameAvatar.fileTooBig', { n: Math.round(MAX_AVATAR_IMAGE_SIZE_BYTES / 1024 / 1024) }));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      applyPhotoDataUrl(reader.result as string);
    };
    reader.onerror = () => setError(tr('nameAvatar.readFail'));
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSave = async () => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return;
    setSaving(true);
    setError(null);
    try {
      let exportDraw = draw;
      if (frameImageRef.current) {
        const merged = document.createElement('canvas');
        merged.width = CANVAS_SIZE;
        merged.height = CANVAS_SIZE;
        const mctx = merged.getContext('2d');
        if (mctx) {
          mctx.drawImage(draw, 0, 0);
          drawAvatarFrameOnLayer(mctx, CANVAS_SIZE, frameImageRef.current);
          exportDraw = merged;
        }
      }
      /* База без плашки в превью; на экспорт — с полями + плашка поверх */
      let out = exportCircularAvatarJpeg(base, exportDraw, undefined, {
        keepBadgeOutside: initialsMode === 'badge',
        paintBadge:
          initialsMode === 'badge'
            ? (ctx, avatarSize, ox, oy) => {
                ctx.save();
                ctx.translate(ox, oy);
                paintAvatarInitialsByMode(
                  ctx,
                  avatarSize,
                  displayName,
                  'badge',
                  initialsColor,
                  badgeText,
                );
                ctx.restore();
              }
            : undefined,
      });
      out = await compressImageToDataUrl(out);
      saveAvatarEditorProject({
        templateId,
        initialsMode,
        initialsColor,
        badgeText,
        activeFrameId,
        baseMode: sourcePhotoDataUrl ? 'photo' : 'template',
        photoScale,
        photoOffsetX,
        photoOffsetY,
        sourcePhotoDataUrl,
      });
      onSave(out);
      savedFingerprintRef.current = fingerprintEditorState(getEditorMeta(), drawCanvasRef.current);
      setIsDirty(false);
    } catch {
      setError(tr('avatarEditor.saveFail'));
    } finally {
      setSaving(false);
    }
  };

  const selectBrushColor = (c: string) => {
    setTool('brush');
    setBrushColor(c);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onCancel();
      const mod = ev.ctrlKey || ev.metaKey;
      if (mod && ev.key === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        handleUndo();
      }
      if (mod && (ev.key === 'y' || (ev.key === 'z' && ev.shiftKey))) {
        ev.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel, handleUndo, handleRedo]);

  const canvasCursor =
    tool === 'sticker' ? 'copy' : tool === 'photo' ? 'grab' : tool === 'eraser' ? 'cell' : 'crosshair';
  const badgePlateBaseText =
    normalizeAvatarBadgeText(badgeText) || defaultAvatarBadgeText(displayName);
  const badgePlateLayoutText =
    badgeEditing && badgeDraft
      ? [...badgeDraft].length > [...badgePlateBaseText].length
        ? badgeDraft
        : badgePlateBaseText
      : badgePlateBaseText;

  const hintText = variantBlockedHint
    ? tr('avatarEditor.variantNeedsNoPhoto')
    : tool === 'photo'
      ? tr('avatarEditor.hintDrag')
      : tool === 'sticker'
        ? tr('avatarEditor.hintSticker')
        : photoDataUrl && baseMode === 'photo'
          ? tr('avatarEditor.hintPhotoBg')
          : polishApplied
            ? tr('avatarEditor.hintPolish')
            : tr('avatarEditor.hintDraw');

  return createPortal(
    <div
      className={[
        'avatar-editor-modal-backdrop',
        isDesktopProfileUi ? 'avatar-editor-modal-backdrop--desktop' : '',
      ].join(' ')}
      onClick={(e) => e.target === e.currentTarget && onCancel()}
      role="presentation"
    >
      <div
        className={[
          'avatar-editor-modal-card',
          isDesktopProfileUi ? 'avatar-editor-modal-card--desktop' : '',
          foldSection === null ? 'avatar-editor-modal-card--hub' : 'avatar-editor-modal-card--stage',
        ].join(' ')}
        role="dialog"
        aria-modal="true"
        aria-labelledby="avatar-editor-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="avatar-editor-modal-card__glow" aria-hidden />
        {isDesktopProfileUi ? (
          <>
            <div className="avatar-editor-modal-card__aurora" aria-hidden />
            <div className="avatar-editor-modal-card__stars" aria-hidden />
            <div className="avatar-editor-modal-card__hud" aria-hidden />
          </>
        ) : null}
        <button type="button" className="avatar-editor-modal-close" onClick={onCancel} aria-label={tr('common.close')}>
          ×
        </button>
        <div className="avatar-editor-left-col">
          <div className="avatar-editor-hero">
          <h2 id="avatar-editor-title" className="avatar-editor-modal-card__title">
            {tr('avatarEditor.title')}
          </h2>
          <div className="avatar-editor-hero__wing avatar-editor-hero__wing--left">
            <button
              type="button"
              className="avatar-editor-history-btn avatar-editor-hero__slot avatar-editor-hero__slot--top"
              onClick={handleUndo}
              disabled={!canUndo}
              title={tr('avatarEditor.backTitle')}
              aria-label={tr('avatarEditor.back')}
            >
              <span className="avatar-editor-history-btn__icon" aria-hidden>
                ↶
              </span>
              <span className="avatar-editor-history-btn__label">{tr('avatarEditor.back')}</span>
            </button>
            <p className="avatar-editor-hero__eyebrow avatar-editor-hero__slot avatar-editor-hero__slot--mid">{tr('avatarEditor.avatar')}</p>
            <button
              type="button"
              className="avatar-editor-history-btn avatar-editor-hero__slot avatar-editor-hero__slot--bottom"
              onClick={handleRedo}
              disabled={!canRedo}
              title={tr('avatarEditor.forwardTitle')}
              aria-label={tr('avatarEditor.forward')}
            >
              <span className="avatar-editor-history-btn__icon" aria-hidden>
                ↷
              </span>
              <span className="avatar-editor-history-btn__label">{tr('avatarEditor.forward')}</span>
            </button>
          </div>
          <div
            className={[
              'avatar-editor-preview-ring',
              'avatar-editor-hero__canvas',
              initialsMode === 'badge' || badgeEditing ? 'avatar-editor-preview-ring--badge' : '',
              badgeEditing ? 'avatar-editor-preview-ring--badge-edit' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <canvas
              ref={displayCanvasRef}
              className="avatar-editor-canvas"
              style={{ cursor: canvasCursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              aria-label={tr('avatarEditor.canvas')}
            />
            {initialsMode === 'badge'
              ? (() => {
                  const layout = measureAvatarBadgeLayout(CANVAS_SIZE, badgePlateLayoutText);
                  return (
                    <div
                      className={[
                        'avatar-editor-badge-plate',
                        badgeEditing ? 'avatar-editor-badge-plate--editing' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                      style={{
                        left: `${(layout.x / CANVAS_SIZE) * 100}%`,
                        top: `${(layout.y / CANVAS_SIZE) * 100}%`,
                        width: `${(layout.w / CANVAS_SIZE) * 100}%`,
                        height: `${(layout.h / CANVAS_SIZE) * 100}%`,
                        ['--badge-font' as string]: `calc(${layout.fontPx / CANVAS_SIZE} * 100cqw)`,
                        ['--badge-color' as string]: initialsColor,
                      }}
                    >
                      {badgeEditing ? (
                        <>
                          <input
                            ref={badgeInputRef}
                            className="avatar-editor-badge-plate__input"
                            value={badgeDraft}
                            maxLength={AVATAR_BADGE_MAX_CHARS}
                            spellCheck={false}
                            autoComplete="off"
                            aria-label={tr('avatarEditor.badgeEdit')}
                            placeholder={tr('avatarEditor.badgePlaceholder')}
                            onChange={(e) => setBadgeDraft(normalizeAvatarBadgeText(e.target.value))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                commitBadgeEditor();
                              }
                            }}
                          />
                          <button
                            type="button"
                            className="avatar-editor-badge-edit__save avatar-editor-badge-plate__save"
                            aria-label={tr('common.save')}
                            title={tr('common.save')}
                            onClick={commitBadgeEditor}
                          >
                            <svg viewBox="0 0 16 16" className="avatar-editor-badge-edit__save-icon" aria-hidden>
                              <path
                                d="M3.2 8.2 6.6 11.6 12.8 4.4"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            </svg>
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="avatar-editor-badge-plate__btn"
                            aria-label={tr('avatarEditor.badgeEdit')}
                            onClick={openBadgeEditor}
                          >
                            <span className="avatar-editor-badge-plate__gleam" aria-hidden />
                            <span className="avatar-editor-badge-plate__text">
                              {badgeText || defaultAvatarBadgeText(displayName)}
                            </span>
                            <span
                              className="avatar-editor-badge-plate__spark avatar-editor-badge-plate__spark--a"
                              aria-hidden
                            />
                            <span
                              className="avatar-editor-badge-plate__spark avatar-editor-badge-plate__spark--b"
                              aria-hidden
                            />
                            <span
                              className="avatar-editor-badge-plate__spark avatar-editor-badge-plate__spark--c"
                              aria-hidden
                            />
                          </button>
                          <MenuNamePlaqueEditMark
                            className="avatar-editor-badge-plate__edit-mark"
                            tipOpen={badgePencilTipOpen}
                            onTipOpenChange={setBadgePencilTipOpen}
                            tipId={badgePencilTipId}
                            tipText={tr('avatarEditor.badgeHint')}
                            onClick={openBadgeEditor}
                          />
                        </>
                      )}
                    </div>
                  );
                })()
              : null}
          </div>
          <div
            className={[
              'avatar-editor-hero__wing',
              'avatar-editor-hero__wing--right',
              noPhotoBesideClear ? 'avatar-editor-hero__wing--right-wide' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {noPhotoBesideClear ? (
              <div className="avatar-editor-hero__wing-stack avatar-editor-hero__slot avatar-editor-hero__slot--top">
                <button
                  type="button"
                  className="avatar-editor-clear-btn"
                  onClick={clearDrawing}
                  title={tr('avatarEditor.clear')}
                  aria-label={tr('avatarEditor.clearTitle')}
                >
                  <span className="avatar-editor-clear-btn__glyph" aria-hidden>
                    <svg className="avatar-editor-clear-btn__icon" viewBox="0 0 24 24">
                      <path
                        fill="currentColor"
                        d="M7.05 5.64 12 10.59l4.95-4.95 1.41 1.41L13.41 12l4.95 4.95-1.41 1.41L12 13.41l-4.95 4.95-1.41-1.41L10.59 12 5.64 7.05l1.41-1.41Z"
                      />
                      <circle
                        cx="12"
                        cy="12"
                        r="9.25"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        opacity="0.45"
                      />
                    </svg>
                  </span>
                </button>
                <button
                  type="button"
                  className={[
                    'avatar-editor-no-photo-btn',
                    variantBlockedHint ? 'avatar-editor-no-photo-btn--nudge' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handleRemovePhoto}
                  title={
                    variantBlockedHint
                      ? tr('avatarEditor.variantNeedsNoPhoto')
                      : tr('avatarEditor.noPhoto')
                  }
                  aria-label={tr('avatarEditor.noPhoto')}
                >
                  <span className="avatar-editor-no-photo-btn__glyph" aria-hidden>
                    <svg className="avatar-editor-no-photo-btn__icon" viewBox="0 0 24 24" fill="none">
                      <rect
                        x="3.25"
                        y="5.25"
                        width="17.5"
                        height="13.5"
                        rx="2.25"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      />
                      <circle cx="8.4" cy="10.1" r="1.55" fill="currentColor" />
                      <path
                        d="M5.2 16.4 9.1 12l3.2 3.1 2.4-2.3 4.1 3.6"
                        stroke="currentColor"
                        strokeWidth="1.55"
                        strokeLinejoin="round"
                      />
                      <path
                        d="M4.2 4.4 19.8 19.6"
                        stroke="currentColor"
                        strokeWidth="2.15"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="avatar-editor-clear-btn avatar-editor-hero__slot avatar-editor-hero__slot--top"
                onClick={clearDrawing}
                title={tr('avatarEditor.clear')}
                aria-label={tr('avatarEditor.clearTitle')}
              >
                <span className="avatar-editor-clear-btn__glyph" aria-hidden>
                  <svg className="avatar-editor-clear-btn__icon" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M7.05 5.64 12 10.59l4.95-4.95 1.41 1.41L13.41 12l4.95 4.95-1.41 1.41L12 13.41l-4.95 4.95-1.41-1.41L10.59 12 5.64 7.05l1.41-1.41Z"
                    />
                    <circle
                      cx="12"
                      cy="12"
                      r="9.25"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      opacity="0.45"
                    />
                  </svg>
                </span>
              </button>
            )}
            {photoDataUrl && baseTabOpen ? (
              <button
                type="button"
                className={[
                  'avatar-editor-no-photo-btn',
                  'avatar-editor-hero__slot',
                  'avatar-editor-hero__slot--mid',
                  variantBlockedHint ? 'avatar-editor-no-photo-btn--nudge' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={handleRemovePhoto}
                title={
                  variantBlockedHint
                    ? tr('avatarEditor.variantNeedsNoPhoto')
                    : tr('avatarEditor.noPhoto')
                }
                aria-label={tr('avatarEditor.noPhoto')}
              >
                <span className="avatar-editor-no-photo-btn__glyph" aria-hidden>
                  <svg className="avatar-editor-no-photo-btn__icon" viewBox="0 0 24 24" fill="none">
                    <rect
                      x="3.25"
                      y="5.25"
                      width="17.5"
                      height="13.5"
                      rx="2.25"
                      stroke="currentColor"
                      strokeWidth="1.7"
                    />
                    <circle cx="8.4" cy="10.1" r="1.55" fill="currentColor" />
                    <path
                      d="M5.2 16.4 9.1 12l3.2 3.1 2.4-2.3 4.1 3.6"
                      stroke="currentColor"
                      strokeWidth="1.55"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M4.2 4.4 19.8 19.6"
                      stroke="currentColor"
                      strokeWidth="2.15"
                      strokeLinecap="round"
                    />
                  </svg>
                </span>
              </button>
            ) : null}
            <button
              type="button"
              className={[
                'avatar-editor-3d-btn',
                'avatar-editor-hero__slot',
                'avatar-editor-hero__slot--bottom',
                polishApplied ? 'avatar-editor-3d-btn--applied' : '',
              ].join(' ')}
              onClick={apply3dPolish}
              title={tr('avatarEditor.polishTitle')}
              aria-label={tr('avatarEditor.polish')}
            >
              <AvatarPolishGlyph className="avatar-editor-3d-btn__glyph" />
            </button>
          </div>
          <div className="avatar-editor-preview-meta avatar-editor-hero__meta">
            <p
              className={[
                'avatar-editor-preview-hint',
                variantBlockedHint ? 'avatar-editor-preview-hint--warn' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role={variantBlockedHint ? 'status' : undefined}
            >
              {hintText}
            </p>
            {sourcePhotoDataUrl && baseMode === 'photo' && !photoIsComposite && (
              <div className="avatar-editor-photo-toolbar">
                <button
                  type="button"
                  className={['avatar-editor-photo-tool-btn', tool === 'photo' ? 'avatar-editor-photo-tool-btn--active' : ''].join(' ')}
                  onClick={() => setTool('photo')}
                >
                  {tr('avatarEditor.position')}
                </button>
                <button type="button" className="avatar-editor-photo-zoom-btn" onClick={() => changePhotoScale(-0.08)} aria-label={tr('nameAvatar.zoomOut')}>
                  −
                </button>
                <span className="avatar-editor-photo-zoom-label">{Math.round(photoScale * 100)}%</span>
                <button type="button" className="avatar-editor-photo-zoom-btn" onClick={() => changePhotoScale(0.08)} aria-label={tr('nameAvatar.zoomIn')}>
                  +
                </button>
              </div>
            )}
          </div>
          {sourcePhotoDataUrl && baseMode !== 'photo' && (
            <button type="button" className="avatar-editor-restore-photo-btn avatar-editor-hero__restore-photo" onClick={restorePhotoMode}>
              {tr('avatarEditor.restorePhoto')}
            </button>
          )}
        </div>

        <div className="avatar-editor-left-stack">
          <div className="avatar-editor-dock-row">
            <div
              className={[
                'avatar-editor-initials-chip',
                initialsExpanded ? 'avatar-editor-initials-chip--open' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="group"
              aria-label={tr('avatarEditor.initials')}
            >
              <div
                className="avatar-editor-initials-rail__color-wrap"
                ref={initialsColorWrapRef}
              >
                <button
                  type="button"
                  className={[
                    'avatar-editor-initials-rail__tag',
                    initialsColorOpen ? 'avatar-editor-initials-rail__tag--open' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-label={tr('avatarEditor.initialsColor')}
                  aria-expanded={initialsColorOpen}
                  aria-haspopup="listbox"
                  title={tr('avatarEditor.initialsColor')}
                  onClick={() => {
                    setInitialsExpanded(true);
                    setInitialsColorOpen((v) => !v);
                  }}
                >
                  <svg
                    className="avatar-editor-initials-rail__glyph"
                    viewBox="0 0 24 24"
                    fill="none"
                    style={{ color: initialsColor }}
                  >
                    <text
                      x="12"
                      y="16.5"
                      textAnchor="middle"
                      fill="currentColor"
                      fontFamily='"Exo 2", system-ui, sans-serif'
                      fontWeight="800"
                      fontSize="13"
                      letterSpacing="-0.04em"
                    >
                      Aa
                    </text>
                  </svg>
                  <span
                    className="avatar-editor-initials-rail__color-dot"
                    style={{ background: initialsColor }}
                    aria-hidden
                  />
                </button>
                {initialsColorOpen ? (
                  <div
                    className="avatar-editor-initials-colors"
                    role="listbox"
                    aria-label={tr('avatarEditor.initialsColor')}
                  >
                    {AVATAR_INITIALS_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="option"
                        aria-selected={initialsColor === c}
                        className={[
                          'avatar-editor-initials-colors__swatch',
                          initialsColor === c ? 'avatar-editor-initials-colors__swatch--active' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        style={{ background: c }}
                        aria-label={tr('avatarEditor.initialsColorOf', { c })}
                        title={tr('avatarEditor.initialsColorOf', { c })}
                        onClick={() => selectInitialsColor(c)}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <AvatarPresetThumb
                presetId={`chip-${initialsMode}`}
                templateId="aurora"
                initialsMode={initialsMode}
                initialsColor={initialsColor}
                displayName={displayName}
                glyphPreview
                tipText={glyphAriaLabel(initialsMode, tr)}
                tipDetail={glyphTipDetail(initialsMode, tr)}
                active={!initialsExpanded}
                ariaLabel={glyphAriaLabel(initialsMode, tr)}
                onClick={() => openInitialsPanel()}
                className={
                  initialsMode === 'off'
                    ? 'avatar-editor-preset-thumb--glyph-off avatar-editor-initials-chip__thumb'
                    : 'avatar-editor-preset-thumb--glyph avatar-editor-initials-chip__thumb'
                }
              />
              <button
                type="button"
                className="avatar-editor-initials-chip__more"
                aria-expanded={initialsExpanded}
                aria-label={
                  initialsExpanded ? tr('avatarEditor.initialsCollapse') : tr('avatarEditor.initialsScrollMore')
                }
                title={
                  initialsExpanded ? tr('avatarEditor.initialsCollapse') : tr('avatarEditor.initialsScrollMore')
                }
                onClick={toggleInitialsExpanded}
              >
                <span className="avatar-editor-initials-chip__more-dots" aria-hidden>
                  <i />
                  <i />
                  <i />
                </span>
                <span className="avatar-editor-initials-chip__more-fade" aria-hidden />
              </button>
            </div>

            <nav
              className={[
                'avatar-editor-tools-rail',
                'avatar-editor-tools-rail--bare',
                baseChosen ? 'avatar-editor-tools-rail--live' : 'avatar-editor-tools-rail--locked',
              ].join(' ')}
              aria-label={tr('avatarEditor.toolsDock')}
              aria-disabled={!baseChosen}
            >
              <div className="avatar-editor-tools-rail__track">
                {AVATAR_EDITOR_TOOLS.map((id) => (
                  <button
                    key={id}
                    type="button"
                    className={[
                      'avatar-editor-tools-rail__btn',
                      `avatar-editor-tools-rail__btn--${id}`,
                      foldSection === id ? 'avatar-editor-tools-rail__btn--active' : '',
                      !baseChosen ? 'avatar-editor-tools-rail__btn--locked' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-disabled={!baseChosen}
                    title={baseChosen ? sectionLabel(id, tr) : tr('avatarEditor.toolsLocked')}
                    aria-label={baseChosen ? sectionLabel(id, tr) : tr('avatarEditor.toolsLocked')}
                    aria-describedby={
                      !baseChosen && toolsLockTipOpen ? 'avatar-editor-tools-lock-tip' : undefined
                    }
                    onClick={(e) => {
                      if (!baseChosen) {
                        showToolsLockedTip(e.currentTarget);
                        return;
                      }
                      setFoldSection((cur) => (cur === id ? null : id));
                    }}
                    aria-pressed={foldSection === id ? true : undefined}
                  >
                    <HubSectionGlyph id={id} />
                  </button>
                ))}
              </div>
            </nav>
            <MenuCapsuleCosmicTip
              open={toolsLockTipOpen && !baseChosen}
              anchorRef={toolsLockAnchorRef}
              tipId="avatar-editor-tools-lock-tip"
              text={tr('avatarEditor.toolsLocked')}
              detail={tr('avatarEditor.toolsLockedDetail')}
              preferBelow
              wide
              onDismiss={dismissToolsLockedTip}
              dismissLabel={tr('common.close')}
            />
          </div>

          {initialsExpanded ? (
            <div
              className="avatar-editor-initials-rail avatar-editor-initials-rail--expanded"
              role="list"
              aria-label={tr('avatarEditor.initials')}
            >
              <div className="avatar-editor-initials-rail__grid">
                {GLYPH_MODES.map((mode) => (
                  <AvatarPresetThumb
                    key={mode}
                    presetId={mode}
                    templateId="aurora"
                    initialsMode={mode}
                    initialsColor={initialsColor}
                    displayName={displayName}
                    glyphPreview
                    tipText={glyphAriaLabel(mode, tr)}
                    tipDetail={glyphTipDetail(mode, tr)}
                    active={initialsMode === mode}
                    ariaLabel={glyphAriaLabel(mode, tr)}
                    onClick={() => selectGlyphMode(mode)}
                    className={
                      mode === 'off'
                        ? 'avatar-editor-preset-thumb--glyph-off'
                        : 'avatar-editor-preset-thumb--glyph'
                    }
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="avatar-editor-left-actions">
            <button
              type="button"
              className="avatar-editor-modal-btn avatar-editor-left-cancel"
              onClick={onCancel}
              disabled={saving}
            >
              <span className="avatar-editor-left-cancel__label">{tr('common.cancel')}</span>
            </button>
            <button
              type="button"
              className={[
                'avatar-editor-modal-btn',
                'avatar-editor-left-save',
                isDirty ? 'avatar-editor-left-save--dirty' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => void handleSave()}
              disabled={saving}
              title={isDirty ? tr('avatarEditor.unsavedChanges') : tr('common.save')}
              aria-label={isDirty ? tr('avatarEditor.unsavedChanges') : tr('common.save')}
            >
              {isDirty ? <span className="avatar-editor-left-save__dirty-dot" aria-hidden /> : null}
              <span className="avatar-editor-left-save__label">{saving ? '…' : tr('common.save')}</span>
            </button>
          </div>
        </div>
        </div>

        <div className="avatar-editor-modal-body">
          <div
            className={[
              'avatar-editor-atelier',
              foldSection === null ? 'avatar-editor-atelier--hub' : 'avatar-editor-atelier--stage',
              foldSection === 'styles' || foldSection === 'bg' ? 'avatar-editor-atelier--round-photo' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {foldSection !== null ? (
                <div
                  className={[
                    'avatar-editor-stage',
                    foldSection === 'photo' ? 'avatar-editor-stage--photo' : '',
                    foldSection === 'styles' ? 'avatar-editor-stage--styles' : '',
                    foldSection === 'bg' ? 'avatar-editor-stage--bg' : '',
                    foldSection === 'photo' || foldSection === 'styles' || foldSection === 'bg'
                      ? 'avatar-editor-stage--docked'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="region"
                  aria-label={sectionLabel(foldSection, tr)}
                >
                  {foldSection === 'photo' || foldSection === 'styles' || foldSection === 'bg' ? (
                    <button
                      type="button"
                      className={[
                        'avatar-editor-hub__tile',
                        `avatar-editor-hub__tile--${foldSection}`,
                        'avatar-editor-hub__tile--active',
                        'avatar-editor-stage__dock-tab',
                      ].join(' ')}
                      onClick={() => setFoldSection(null)}
                      title={tr('avatarEditor.sectionCollapseHint')}
                      aria-label={tr('avatarEditor.sectionCollapseHint')}
                      aria-pressed={true}
                    >
                      <span className="avatar-editor-hub__rim" aria-hidden>
                        <span className="avatar-editor-hub__rim-spin" />
                      </span>
                      <HubSectionGlyph id={foldSection} />
                      <HubArcLabel
                        sectionId={foldSection}
                        text={
                          foldSection === 'photo' ? tr('avatarEditor.foldPhotoOwn') : sectionLabel(foldSection, tr)
                        }
                      />
                    </button>
                  ) : (
                    <header className="avatar-editor-stage__head">
                      <HubSectionGlyph id={foldSection} />
                      <h3 className="avatar-editor-stage__title">{sectionLabel(foldSection, tr)}</h3>
                    </header>
                  )}

                  {foldSection === 'photo' ? (
                    <div className="avatar-editor-photo-panel">
                      <h3 className="avatar-editor-photo-panel__title">{tr('avatarEditor.foldPhoto')}</h3>
                      <div
                        className="avatar-editor-photo-deck avatar-editor-photo-deck--stage"
                        role="group"
                        aria-label={tr('avatarEditor.foldPhoto')}
                      >
                      <button
                        type="button"
                        className="avatar-editor-photo-action avatar-editor-photo-action--cam"
                        disabled={selfieBusy || saving || inPageCameraOpen}
                        onClick={() => void handleSelfie()}
                      >
                        <span className="avatar-editor-photo-action__glyph avatar-editor-photo-action__glyph--cam" aria-hidden>
                          <svg className="avatar-editor-photo-action__icon" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M9.4 5.2 8.2 6.8H5.5A2.3 2.3 0 0 0 3.2 9.1v8.2A2.3 2.3 0 0 0 5.5 19.6h13a2.3 2.3 0 0 0 2.3-2.3V9.1a2.3 2.3 0 0 0-2.3-2.3h-2.7l-1.2-1.6H9.4Zm2.6 3.7a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2Zm0 1.7a2.4 2.4 0 1 0 0 4.8 2.4 2.4 0 0 0 0-4.8Z"
                            />
                          </svg>
                        </span>
                        <span className="avatar-editor-photo-action__text">{tr('avatarEditor.photoTake')}</span>
                      </button>
                      <button
                        type="button"
                        className="avatar-editor-photo-action avatar-editor-photo-action--gal"
                        disabled={saving || inPageCameraOpen}
                        onClick={() => openGalleryPicker(galleryInputRef.current)}
                      >
                        <span className="avatar-editor-photo-action__glyph avatar-editor-photo-action__glyph--gal" aria-hidden>
                          <svg className="avatar-editor-photo-action__icon" viewBox="0 0 24 24" aria-hidden>
                            <path
                              fill="currentColor"
                              d="M5.2 4.2h13.6A2.6 2.6 0 0 1 21.4 6.8v10.4a2.6 2.6 0 0 1-2.6 2.6H5.2a2.6 2.6 0 0 1-2.6-2.6V6.8A2.6 2.6 0 0 1 5.2 4.2Zm1.4 2.4a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm1.1 10.2h9.8l-3.3-4.4-2.4 3.1-1.6-2-2.5 3.3Z"
                            />
                          </svg>
                        </span>
                        <span className="avatar-editor-photo-action__text">{tr('avatarEditor.photoPick')}</span>
                      </button>
                      {sourcePhotoDataUrl ? (
                        <button
                          type="button"
                          className={[
                            'avatar-editor-photo-live',
                            baseMode === 'photo' && !photoIsComposite ? 'avatar-editor-photo-live--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            pushUndoAll();
                            setPhotoDataUrl(sourcePhotoDataUrl);
                            setPhotoIsComposite(false);
                            setBaseMode('photo');
                            setTool('photo');
                            setPolishApplied(false);
                            setBaseChosen(true);
                          }}
                          title={tr('avatarEditor.restorePhoto')}
                          aria-label={tr('avatarEditor.restorePhoto')}
                        >
                          <img src={sourcePhotoDataUrl} alt="" className="avatar-editor-photo-live__img" />
                        </button>
                      ) : null}
                      </div>
                    </div>
                  ) : null}

                  {foldSection === 'bg' ? (
                    <div className="avatar-editor-presets avatar-editor-presets--stage avatar-editor-presets--stage-tall" role="group" aria-label={tr('avatarEditor.bg')}>
                      <AvatarPresetRail
                        className="avatar-editor-presets__row avatar-editor-presets__row--stage avatar-editor-presets__row--stage-tall"
                        enabled
                        activeId={baseMode === 'photo' ? null : templateId}
                        itemIds={AVATAR_EDITOR_BG_TEMPLATES.map((t) => t.id)}
                        onSelectId={(id) => selectBackground(id as AvatarEditorTemplateId)}
                        aria-label={tr('avatarEditor.bg')}
                      >
                        {AVATAR_EDITOR_BG_TEMPLATES.map((tpl) => (
                          <AvatarPresetThumb
                            key={tpl.id}
                            presetId={tpl.id}
                            templateId={tpl.id}
                            initialsMode={initialsMode}
                            displayName={displayName}
                            active={baseMode !== 'photo' && templateId === tpl.id}
                            ariaLabel={templateAriaLabel(tpl.id, tr)}
                            onClick={() => selectBackground(tpl.id)}
                          />
                        ))}
                      </AvatarPresetRail>
                    </div>
                  ) : null}

                  {foldSection === 'styles' ? (
                    <>
                      {variantBlockedHint ? (
                        <p className="avatar-editor-stage__tip" role="status">
                          {tr('avatarEditor.variantNeedsNoPhoto')}
                        </p>
                      ) : null}
                    <AvatarPresetRail
                      className="avatar-editor-presets__row avatar-editor-presets__row--stage avatar-editor-presets__row--stage-tall"
                      enabled
                      activeId={
                        templateId &&
                        initialsMode === 'off' &&
                        baseMode !== 'photo' &&
                        AVATAR_EDITOR_STYLE_TEMPLATES.some((t) => t.id === templateId)
                          ? templateId
                          : null
                      }
                      itemIds={AVATAR_EDITOR_STYLE_TEMPLATES.map((t) => t.id)}
                      onSelectId={(id) => selectStylePreset(id as AvatarEditorTemplateId)}
                      aria-label={tr('avatarEditor.foldVariants')}
                    >
                      {AVATAR_EDITOR_STYLE_TEMPLATES.map((tpl) => (
                        <AvatarPresetThumb
                          key={tpl.id}
                          presetId={tpl.id}
                          templateId={tpl.id}
                          initialsMode="off"
                          displayName={displayName}
                          active={templateId === tpl.id && initialsMode === 'off' && baseMode !== 'photo'}
                          ariaLabel={templateAriaLabel(tpl.id, tr)}
                          onClick={() => selectStylePreset(tpl.id)}
                        />
                      ))}
                    </AvatarPresetRail>
                    </>
                  ) : null}

                  {foldSection === 'brush' ? (
                    <div
                      className={[
                        'avatar-editor-tools-line',
                        'avatar-editor-tools-line--stage',
                        brushNeon ? '' : 'avatar-editor-tools-line--flat-brush',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      {BRUSH_QUICK_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={[
                            'avatar-editor-color',
                            brushNeon ? '' : 'avatar-editor-color--flat',
                            tool !== 'eraser' && brushColor === c ? 'avatar-editor-color--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={{ background: c }}
                          onClick={() => selectBrushColor(c)}
                          aria-label={tr('avatarEditor.colorOf', { c })}
                        />
                      ))}
                      <AvatarNeonColorPicker
                        color={brushColor}
                        onChange={selectBrushColor}
                        neonBrush={brushNeon}
                        onNeonBrushChange={setBrushNeon}
                      />
                      {BRUSH_SIZES.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className={[
                            'avatar-editor-size',
                            tool !== 'sticker' && brushSize === s ? 'avatar-editor-size--active' : '',
                          ].join(' ')}
                          onClick={() => {
                            setTool('brush');
                            setBrushSize(s);
                          }}
                          title={tr('avatarEditor.brushSize', { n: s })}
                          aria-label={tr('avatarEditor.brushSize', { n: s })}
                        >
                          {s}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={[
                          'avatar-editor-tool-toggle',
                          tool === 'eraser' ? 'avatar-editor-tool-toggle--active' : '',
                        ].join(' ')}
                        onClick={() => setTool(tool === 'eraser' ? 'brush' : 'eraser')}
                        title={tr('avatarEditor.eraserTitle')}
                        aria-label={tr('avatarEditor.eraser')}
                      >
                        ▭
                      </button>
                    </div>
                  ) : null}

                  {foldSection === 'frames' ? (
                    <AvatarPresetRail
                      className="avatar-editor-decor-section__chips avatar-editor-preset-rail--chips avatar-editor-presets__row--stage"
                      enabled
                      activeId={activeFrameId}
                      itemIds={AVATAR_EDITOR_FRAMES.map((f) => f.id)}
                      onSelectId={(id) => applyFrame(id as AvatarFrameId)}
                      aria-label={tr('avatarEditor.foldFrames')}
                    >
                      {AVATAR_EDITOR_FRAMES.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          data-preset-id={f.id}
                          role="listitem"
                          className={[
                            'avatar-editor-frame-btn',
                            activeFrameId === f.id ? 'avatar-editor-frame-btn--active' : '',
                          ].join(' ')}
                          onClick={() => applyFrame(f.id)}
                          title={frameLabel(f.id, tr)}
                          aria-pressed={activeFrameId === f.id}
                        >
                          <img src={f.src} alt="" className="avatar-editor-frame-btn__img" />
                        </button>
                      ))}
                    </AvatarPresetRail>
                  ) : null}

                  {foldSection === 'stickers' ? (
                    <AvatarPresetRail
                      className="avatar-editor-decor-section__chips avatar-editor-preset-rail--chips avatar-editor-presets__row--stage"
                      enabled
                      activeId={tool === 'sticker' ? stickerId : null}
                      itemIds={AVATAR_EDITOR_STICKERS.map((s) => s.id)}
                      onSelectId={(id) => {
                        setTool('sticker');
                        setStickerId(id as AvatarStickerId);
                      }}
                      aria-label={tr('avatarEditor.foldStickers')}
                    >
                      {AVATAR_EDITOR_STICKERS.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          data-preset-id={s.id}
                          role="listitem"
                          className={[
                            'avatar-editor-sticker-btn',
                            tool === 'sticker' && stickerId === s.id ? 'avatar-editor-sticker-btn--active' : '',
                          ].join(' ')}
                          onClick={() => {
                            setTool('sticker');
                            setStickerId(s.id);
                          }}
                          title={stickerLabel(s.id, tr)}
                          aria-pressed={tool === 'sticker' && stickerId === s.id}
                        >
                          <span className="avatar-editor-sticker-btn__glyph" aria-hidden>
                            {s.glyph}
                          </span>
                        </button>
                      ))}
                    </AvatarPresetRail>
                  ) : null}
                </div>
            ) : null}

            <div
              className="avatar-editor-hub avatar-editor-hub--cyber"
              role="navigation"
              aria-label={tr('avatarEditor.sectionsAll')}
            >
              <div
                className="avatar-editor-hub__bases avatar-editor-hub__bases--column"
                role="group"
                aria-label={tr('avatarEditor.sectionHubHint')}
              >
                {AVATAR_EDITOR_BASES.map((id) => {
                  const photoAsRound =
                    id === 'photo' && (foldSection === 'styles' || foldSection === 'bg');
                  return (
                  <button
                    key={id}
                    type="button"
                    className={[
                      'avatar-editor-hub__tile',
                      `avatar-editor-hub__tile--${id}`,
                      photoAsRound ? 'avatar-editor-hub__tile--photo-round' : '',
                      foldSection === id ? 'avatar-editor-hub__tile--active' : '',
                      (id === 'photo' || id === 'styles' || id === 'bg') && foldSection === id
                        ? 'avatar-editor-hub__tile--ghost'
                        : '',
                      id === 'empty' && templateId === 'none' && baseMode === 'template'
                        ? 'avatar-editor-hub__tile--active'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    onClick={() => {
                      if (id === 'empty') {
                        selectEmptyBase();
                        setFoldSection(null);
                        return;
                      }
                      setFoldSection((cur) => (cur === id ? null : id));
                    }}
                    aria-label={sectionLabel(id, tr)}
                    title={
                      foldSection === id
                        ? tr('avatarEditor.sectionCollapseHint')
                        : sectionLabel(id, tr)
                    }
                    aria-pressed={foldSection === id ? true : undefined}
                    aria-current={foldSection === id ? 'true' : undefined}
                    aria-hidden={
                      (id === 'photo' || id === 'styles' || id === 'bg') && foldSection === id
                        ? true
                        : undefined
                    }
                    tabIndex={
                      (id === 'photo' || id === 'styles' || id === 'bg') && foldSection === id ? -1 : undefined
                    }
                  >
                    <span className="avatar-editor-hub__rim" aria-hidden>
                      <span className="avatar-editor-hub__rim-spin" />
                    </span>
                    <HubSectionGlyph id={id} />
                    {photoAsRound ? null : (
                      <HubArcLabel
                        sectionId={id}
                        text={id === 'photo' ? tr('avatarEditor.foldPhotoOwn') : sectionLabel(id, tr)}
                      />
                    )}
                  </button>
                  );
                })}
              </div>
            </div>
          </div>

          {error && <p className="avatar-editor-error avatar-editor-modal-body__error">{error}</p>}
        </div>

        {inPageCameraOpen && (
          <div className="avatar-editor-inpage-camera" role="region" aria-label={tr('nameAvatar.selfie')}>
            <video ref={cameraVideoRef} className="avatar-editor-inpage-camera__video" playsInline muted autoPlay />
            <div className="avatar-editor-inpage-camera__actions">
              <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--ghost avatar-editor-modal-btn--compact" onClick={stopInPageCamera}>
                {tr('common.cancel')}
              </button>
              <button type="button" className="avatar-editor-modal-btn avatar-editor-modal-btn--primary avatar-editor-modal-btn--compact" disabled={selfieBusy} onClick={() => void handleInPageCameraCapture()}>
                {selfieBusy ? '…' : tr('nameAvatar.shoot')}
              </button>
            </div>
          </div>
        )}

        <div className="avatar-editor-modal-footer">
          <input
            ref={selfieInputRef}
            type="file"
            accept="image/*"
            capture="user"
            className="avatar-editor-file-input"
            onChange={handleFileChange}
          />
          <input
            ref={galleryInputRef}
            type="file"
            accept="image/*"
            className="avatar-editor-file-input"
            onChange={handleFileChange}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
