/**
 * Редактор аватарки: превью, шаблоны, рисование, стикеры, рамки, 3D-финиш, палитра.
 * Стили: src/styles/avatar-editor.css (подключается из main.tsx ПОСЛЕ index.css).
 */

import { useCallback, useEffect, useId, useRef, useState, startTransition, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  AVATAR_BADGE_MAX_CHARS,
  AVATAR_EDITOR_BG_TEMPLATES,
  AVATAR_EDITOR_STYLE_TEMPLATES,
  AVATAR_INITIALS_COLORS,
  AVATAR_INITIALS_SOURCES,
  AVATAR_INITIALS_STYLE_CHIPS,
  defaultAvatarBadgeText,
  hitTestAvatarBadge,
  measureAvatarBadgeLayout,
  normalizeAvatarBadgeText,
  paintAvatarEditorBase,
  drawPhotoWithTransform,
  paintAvatarInitials,
  resolveAvatarInitialsText,
  clipAvatarCanvasToCircle,
  isAvatarInitialsColor,
  isAvatarInitialsSource,
  isAvatarInitialsStyle,
  type AvatarEditorTemplateId,
  type AvatarInitialsSource,
  type AvatarInitialsStyle,
} from '../lib/avatarEditorTemplates';
import {
  AVATAR_EDITOR_STICKERS,
  STICKER_GLYPH_COLORS,
  drawAvatarSticker,
  isPremiumSticker,
  type AvatarStickerId,
} from '../lib/avatarEditorStickers';
import { isPremiumAvatarJokerStickerEnabled } from '../lib/featureFlags';
import { useAuth } from '../contexts/AuthContext';
import {
  AVATAR_EDITOR_FRAMES,
  drawAvatarFrameOnLayer,
  loadAvatarFrameImage,
  type AvatarFrameId,
} from '../lib/avatarEditorFrames';
import { bake3dPolishToBase, getAvatar3dPolishFlag, setAvatar3dPolishFlag } from '../lib/avatar3dFinish';
import {
  compressImageToDataUrl,
  exportCircularAvatarJpeg,
  MAX_AVATAR_IMAGE_SIZE_BYTES,
} from '../lib/avatarImage';
import { paintBrushStrokeSegment, type DashStrokeState } from '../lib/avatarNeonBrush';
import {
  floodFillBrushLayer,
  paintBrushStamp,
  type BrushStampId,
} from '../lib/avatarBrushTools';
import {
  canUseInPageCamera,
  captureSelfieDataUrl,
  captureVideoElementDataUrl,
  openGalleryPicker,
  openNativeCameraPicker,
  preferNativeCameraPicker,
} from '../lib/avatarCamera';
import { persistAvatarToProfile } from '../lib/profileAvatarSave';
import { loadAvatarEditorProject, saveAvatarEditorProject, clearAvatarEditorSourcePhoto, rememberAvatarEditorSourcePhoto, saveAvatarEditorWorkingFlat, clearAvatarEditorWorkingFlat } from '../lib/avatarEditorProject';
import { AvatarPresetThumb } from './avatarEditor/AvatarPresetThumb';
import { AvatarPresetRail } from './avatarEditor/AvatarPresetRail';
import { AvatarStickerBtn } from './avatarEditor/AvatarStickerBtn';
import { AvatarEditorTipButton } from './avatarEditor/AvatarEditorTipButton';
import { AvatarPolishGlyph } from './icons/AvatarPolishGlyph';
import { AvatarNeonColorPicker, BRUSH_QUICK_COLORS, brushSwatchPreviewStyle } from './AvatarNeonColorPicker';
import { MenuCapsuleCosmicTip } from './MenuCapsuleCosmicTip';
import { MenuNamePlaqueEditMark, MenuNamePlaqueConfirmMark } from './MenuEntryActions';
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

/* Толщина кисти на холсте 512 — три ступени с явной разницей */
const BRUSH_SIZES = [3, 11, 24] as const;
const BRUSH_SIZE_DOT_PX = [8, 17, 30] as const;
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

function sourceAriaLabel(source: AvatarInitialsSource, tr: TFunc): string {
  switch (source) {
    case 'first':
      return tr('avatarEditor.sourceFirst');
    case 'firstDigits':
      return tr('avatarEditor.sourceFirstDigits');
    case 'capitals':
    default:
      return tr('avatarEditor.sourceCapitals');
  }
}

function sourceTipDetail(source: AvatarInitialsSource, tr: TFunc): string {
  switch (source) {
    case 'first':
      return tr('avatarEditor.sourceFirstDetail');
    case 'firstDigits':
      return tr('avatarEditor.sourceFirstDigitsDetail');
    case 'capitals':
    default:
      return tr('avatarEditor.sourceCapitalsDetail');
  }
}

function styleAriaLabel(style: AvatarInitialsStyle, tr: TFunc): string {
  switch (style) {
    case 'center':
      return tr('avatarEditor.glyphLetters');
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

function styleTipDetail(style: AvatarInitialsStyle, tr: TFunc): string {
  switch (style) {
    case 'center':
      return tr('avatarEditor.glyphLettersDetail');
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
  if (id === 'joker') return tr('avatarEditor.stickerJoker');
  if (id === 'updown') return tr('avatarEditor.stickerUpDown');
  if (id === 'clover') return tr('avatarEditor.stickerClover');
  if (id === 'spade') return tr('avatarEditor.stickerSpade');
  if (id === 'heart') return tr('avatarEditor.stickerHeart');
  if (id === 'diamond') return tr('avatarEditor.stickerDiamond');
  if (id === 'club') return tr('avatarEditor.stickerClub');
  if (id === 'star') return tr('avatarEditor.stickerStar');
  return tr('avatarEditor.stickerSparkle');
}

/** Иконки шаблонов Premium. */
function StickerBtnGlyph({
  id,
  glyph,
}: {
  id: AvatarStickerId;
  glyph: string;
}): ReactNode {
  if (id === 'updown') {
    return (
      <svg className="avatar-editor-sticker-btn__icon" viewBox="0 0 32 32" aria-hidden>
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="6"
          fill="none"
          stroke="#67e8f9"
          strokeWidth="1"
          opacity="0.55"
          transform="rotate(-40 16 16)"
        />
        <ellipse
          cx="16"
          cy="16"
          rx="14"
          ry="6"
          fill="none"
          stroke="#e879f9"
          strokeWidth="1"
          opacity="0.45"
          transform="rotate(40 16 16)"
        />
        <circle cx="27.5" cy="11" r="1.4" fill="#67e8f9" />
        <circle cx="5" cy="20" r="1.3" fill="#e879f9" />
        <path d="M16 2 L25 13.5 H20 V15.5 H12 V13.5 H7 Z" fill="#67e8f9" />
        <path d="M16 30 L25 18.5 H20 V16.5 H12 V18.5 H7 Z" fill="#e879f9" />
        <circle cx="16" cy="16" r="6" fill="rgba(2,6,23,0.92)" stroke="#fde68a" strokeWidth="1.4" />
        <text
          x="16"
          y="19"
          textAnchor="middle"
          fontSize="11"
          fontWeight="900"
          fontFamily='"Exo 2", system-ui, sans-serif'
          fill="#fde68a"
        >
          &amp;
        </text>
      </svg>
    );
  }
  if (id === 'clover') {
    return (
      <svg className="avatar-editor-sticker-btn__icon" viewBox="0 0 32 32" aria-hidden>
        <g fill="#4ade80" stroke="#fde68a" strokeWidth="0.6">
          <path d="M16 15 C16 10 12 7 16 4 C20 7 16 10 16 15 Z" />
          <path d="M16 15 C21 15 24 11 27 15 C24 19 21 15 16 15 Z" />
          <path d="M16 15 C16 20 20 23 16 26 C12 23 16 20 16 15 Z" />
          <path d="M16 15 C11 15 8 11 5 15 C8 19 11 15 16 15 Z" />
        </g>
        <circle cx="16" cy="15" r="2.2" fill="#fde68a" />
        <path
          d="M16 16.5 Q18 22 16.5 28"
          fill="none"
          stroke="#166534"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (id === 'joker') {
    return (
      <svg
        className="avatar-editor-sticker-btn__icon avatar-editor-sticker-btn__icon--joker"
        viewBox="0 0 32 32"
        aria-hidden
      >
        <path
          d="M16 11 L26 17 L16 28.5 L6 17 Z"
          fill="rgba(12,8,35,0.95)"
          stroke="#e879f9"
          strokeWidth="1.5"
        />
        <path
          d="M8 12 L9.2 4 L13.2 9 L16 2.5 L18.8 9 L22.8 4 L24 12 Q16 14.5 8 12 Z"
          fill="#e879f9"
        />
        <circle className="avatar-editor-sticker-btn__bell" cx="9.2" cy="3.6" r="1.5" fill="#67e8f9" />
        <circle className="avatar-editor-sticker-btn__bell" cx="16" cy="2" r="1.5" fill="#fbbf24" />
        <circle className="avatar-editor-sticker-btn__bell" cx="22.8" cy="3.6" r="1.5" fill="#f472b6" />
        <text
          className="avatar-editor-sticker-btn__j-letter"
          x="16"
          y="22"
          textAnchor="middle"
          fontSize="11"
          fontWeight="900"
          fontFamily='"Exo 2", system-ui, sans-serif'
          fill="#fdf4ff"
        >
          J
        </text>
      </svg>
    );
  }
  return glyph;
}

function frameLabel(id: AvatarFrameId, tr: TFunc): string {
  if (id === 'cosmic') return tr('avatarEditor.frameCosmic');
  if (id === 'gold') return tr('avatarEditor.frameGold');
  if (id === 'neon') return tr('avatarEditor.frameNeon');
  if (id === 'orbit') return tr('avatarEditor.frameOrbit');
  return id;
}

type EditorTool = 'brush' | 'eraser' | 'fill' | 'sticker' | 'photo';
type BrushStampOrFree = BrushStampId | null;

type EditorMeta = {
  baseMode: 'template' | 'photo';
  templateId: AvatarEditorTemplateId;
  initialsSource: AvatarInitialsSource;
  initialsStyle: AvatarInitialsStyle;
  initialsColor: string;
  badgeText: string;
  activeFrameId: AvatarFrameId | null;
  photoDataUrl: string | null;
  sourcePhotoDataUrl: string | null;
  photoIsComposite: boolean;
  /**
   * Composite без запечённых инициалов (working flat) — глифы рисуем живьём.
   * false = legacy JPEG профиля, инициалы уже в пикселях.
   */
  compositeSansInitials: boolean;
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
  polishApplied: boolean;
};

type UndoEntry =
  | { kind: 'draw'; draw: ImageData }
  | { kind: 'all'; draw: ImageData; meta: EditorMeta }
  /** Только meta (инициалы/плашка) — без тяжёлого getImageData(512²). */
  | { kind: 'meta'; meta: EditorMeta };

const PHOTO_SCALE_MIN = 0.35;
const PHOTO_SCALE_MAX = 2.8;

/** Короткий отпечаток URL — без копирования мегабайтных data URL в строку dirty. */
function shortUrlSig(url: string | null | undefined): string {
  if (!url) return '';
  if (url.length <= 48) return url;
  return `${url.length}:${url.slice(0, 20)}:${url.slice(-16)}`;
}

/** Дешёвый dirty-fingerprint: meta + поколение слоя рисования (без getImageData 512²). */
function fingerprintEditorState(meta: EditorMeta, drawGen: number): string {
  return [
    meta.baseMode,
    meta.templateId,
    meta.initialsSource,
    meta.initialsStyle,
    meta.initialsColor,
    meta.badgeText,
    meta.activeFrameId ?? '',
    shortUrlSig(meta.photoDataUrl),
    shortUrlSig(meta.sourcePhotoDataUrl),
    meta.photoIsComposite ? '1' : '0',
    meta.compositeSansInitials ? '1' : '0',
    meta.photoScale,
    meta.photoOffsetX,
    meta.photoOffsetY,
    meta.polishApplied ? '1' : '0',
    String(drawGen),
  ].join('|');
}

function readAvatarEditorBoot(
  displayName: string,
  initialAvatarDataUrl: string | null,
): {
  templateId: AvatarEditorTemplateId;
  initialsSource: AvatarInitialsSource;
  initialsStyle: AvatarInitialsStyle;
  initialsColor: string;
  badgeText: string;
  activeFrameId: AvatarFrameId | null;
  baseMode: 'template' | 'photo';
  photoDataUrl: string | null;
  sourcePhotoDataUrl: string | null;
  photoIsComposite: boolean;
  compositeSansInitials: boolean;
  photoScale: number;
  photoOffsetX: number;
  photoOffsetY: number;
} {
  const project = loadAvatarEditorProject();
  const baked =
    initialAvatarDataUrl && initialAvatarDataUrl.length >= 32 ? initialAvatarDataUrl : null;
  const working =
    project?.workingFlatDataUrl && project.workingFlatDataUrl.length >= 32
      ? project.workingFlatDataUrl
      : null;

  const restoredSource =
    project && isAvatarInitialsSource(project.initialsSource) ? project.initialsSource : 'capitals';
  const restoredStyle =
    project && isAvatarInitialsStyle(project.initialsStyle) ? project.initialsStyle : 'off';
  const restoredColor =
    project && isAvatarInitialsColor(project.initialsColor)
      ? project.initialsColor
      : AVATAR_INITIALS_COLORS[0];
  const restoredBadge =
    project?.badgeText?.length
      ? normalizeAvatarBadgeText(project.badgeText)
      : defaultAvatarBadgeText(displayName);

  /*
   * Рабочий flat без инициалов (после save v3) — стикеры есть, глифы живые.
   * Иначе legacy: JPEG профиля (инициалы уже в пикселях).
   */
  if (working) {
    return {
      templateId: project?.templateId ?? 'neutral',
      initialsSource: restoredSource,
      initialsStyle: restoredStyle,
      initialsColor: restoredColor,
      badgeText: restoredBadge,
      activeFrameId: null,
      baseMode: 'photo',
      photoDataUrl: working,
      sourcePhotoDataUrl: project?.sourcePhotoDataUrl ?? null,
      photoIsComposite: true,
      compositeSansInitials: true,
      photoScale: 1,
      photoOffsetX: 0,
      photoOffsetY: 0,
    };
  }

  if (baked) {
    return {
      templateId: project?.templateId ?? 'neutral',
      initialsSource: restoredSource,
      initialsStyle: restoredStyle,
      initialsColor: restoredColor,
      badgeText: restoredBadge,
      activeFrameId: null,
      baseMode: 'photo',
      photoDataUrl: baked,
      sourcePhotoDataUrl: project?.sourcePhotoDataUrl ?? null,
      photoIsComposite: true,
      compositeSansInitials: false,
      photoScale: 1,
      photoOffsetX: 0,
      photoOffsetY: 0,
    };
  }

  if (project) {
    const baseMode: 'template' | 'photo' =
      project.baseMode === 'photo' && project.sourcePhotoDataUrl ? 'photo' : 'template';
    return {
      templateId: project.templateId,
      initialsSource: isAvatarInitialsSource(project.initialsSource) ? project.initialsSource : 'capitals',
      initialsStyle: isAvatarInitialsStyle(project.initialsStyle) ? project.initialsStyle : 'off',
      initialsColor: isAvatarInitialsColor(project.initialsColor)
        ? project.initialsColor
        : AVATAR_INITIALS_COLORS[0],
      badgeText: project.badgeText?.length
        ? normalizeAvatarBadgeText(project.badgeText)
        : defaultAvatarBadgeText(displayName),
      activeFrameId: project.activeFrameId,
      baseMode,
      photoDataUrl: baseMode === 'photo' ? project.sourcePhotoDataUrl : null,
      sourcePhotoDataUrl: project.sourcePhotoDataUrl as string | null,
      photoIsComposite: false,
      compositeSansInitials: false,
      photoScale: project.photoScale || 1,
      photoOffsetX: project.photoOffsetX || 0,
      photoOffsetY: project.photoOffsetY || 0,
    };
  }

  return {
    templateId: 'neutral',
    initialsSource: 'capitals',
    initialsStyle: 'off',
    initialsColor: AVATAR_INITIALS_COLORS[0],
    badgeText: defaultAvatarBadgeText(displayName),
    activeFrameId: null,
    baseMode: 'template',
    photoDataUrl: null,
    sourcePhotoDataUrl: null,
    photoIsComposite: false,
    compositeSansInitials: false,
    photoScale: 1,
    photoOffsetX: 0,
    photoOffsetY: 0,
  };
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
  const { user } = useAuth();
  const premiumJokerOk = isPremiumAvatarJokerStickerEnabled(user?.id);
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
  const dashStrokeRef = useRef<DashStrokeState>({ dist: 0 });
  const drawCheckpointRef = useRef<ImageData | null>(null);
  const compositeRafRef = useRef(0);
  const drawCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const displayCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const canvasRectRef = useRef<DOMRect | null>(null);
  const canvasCursorRef = useRef('crosshair');
  const photoPanRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null);
  const photoImageCacheRef = useRef<{ url: string; img: HTMLImageElement } | null>(null);
  const frameImageRef = useRef<HTMLImageElement | null>(null);
  /** Поколение слоя рисования — для dirty без getImageData. */
  const drawInkGenRef = useRef(0);
  const [drawInkTick, setDrawInkTick] = useState(0);
  const bumpDrawInk = useCallback(() => {
    drawInkGenRef.current += 1;
    setDrawInkTick((n) => n + 1);
  }, []);

  const [boot] = useState(() => readAvatarEditorBoot(displayName, initialAvatarDataUrl));

  const [templateId, setTemplateId] = useState<AvatarEditorTemplateId>(boot.templateId);
  const [initialsSource, setInitialsSource] = useState<AvatarInitialsSource>(boot.initialsSource);
  const [initialsStyle, setInitialsStyle] = useState<AvatarInitialsStyle>(boot.initialsStyle);
  const [initialsColor, setInitialsColor] = useState<string>(boot.initialsColor);
  const [initialsExpanded, setInitialsExpanded] = useState(false);
  /** Палитра висит вместе с панелью инициалов; при «плашке снизу» скрыта */
  const showInitialsColorPalette = initialsExpanded && initialsStyle !== 'badge';
  const [badgeText, setBadgeText] = useState(boot.badgeText);
  const [badgeEditing, setBadgeEditing] = useState(false);
  const [badgeDraft, setBadgeDraft] = useState('');
  const badgeInputRef = useRef<HTMLInputElement | null>(null);
  const [badgePencilTipOpen, setBadgePencilTipOpen] = useState(false);
  const [badgeConfirmTipOpen, setBadgeConfirmTipOpen] = useState(false);
  const badgePencilTipId = useId();
  const badgeConfirmTipId = useId();
  const brushUiId = useId().replace(/:/g, '');
  const initialsColorWrapRef = useRef<HTMLDivElement | null>(null);
  const [baseMode, setBaseMode] = useState<'template' | 'photo'>(boot.baseMode);
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(boot.photoDataUrl);
  const [sourcePhotoDataUrl, setSourcePhotoDataUrl] = useState<string | null>(boot.sourcePhotoDataUrl);
  const [photoIsComposite, setPhotoIsComposite] = useState(boot.photoIsComposite);
  const [compositeSansInitials, setCompositeSansInitials] = useState(boot.compositeSansInitials);
  const [photoScale, setPhotoScale] = useState(boot.photoScale);
  const [photoOffsetX, setPhotoOffsetX] = useState(boot.photoOffsetX);
  const [photoOffsetY, setPhotoOffsetY] = useState(boot.photoOffsetY);
  /* Дефолт — cyan (не чистый белый): штампы сразу читаются как «двойной неон» */
  const [brushColor, setBrushColor] = useState<string>(BRUSH_QUICK_COLORS[1] ?? '#22d3ee');
  const [brushNeon, setBrushNeon] = useState(true);
  const [brushSize, setBrushSize] = useState<number>(BRUSH_SIZES[1]);
  const [brushStroke, setBrushStroke] = useState<'solid' | 'dashed'>('solid');
  const [brushStamp, setBrushStamp] = useState<BrushStampOrFree>(null);
  const [brushPanelSec, setBrushPanelSec] = useState<'color' | 'size' | 'shape' | 'act' | null>(null);
  const [tool, setTool] = useState<EditorTool>('brush');
  const [stickerId, setStickerId] = useState<AvatarStickerId>('star');
  const [stickerColor, setStickerColor] = useState<string>(STICKER_GLYPH_COLORS.star);
  const [stickerPremiumTip, setStickerPremiumTip] = useState(false);
  const [activeFrameId, setActiveFrameId] = useState<AvatarFrameId | null>(boot.activeFrameId);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [polishApplied, setPolishApplied] = useState(() =>
    Boolean(initialAvatarDataUrl && getAvatar3dPolishFlag()),
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [selfieBusy, setSelfieBusy] = useState(false);
  const [inPageCameraOpen, setInPageCameraOpen] = useState(false);
  const [foldSection, setFoldSection] = useState<AvatarEditorSectionId | null>(null);
  const [variantBlockedHint, setVariantBlockedHint] = useState(false);
  const [baseChosen, setBaseChosen] = useState(() => Boolean(initialAvatarDataUrl));
  const [isDirty, setIsDirty] = useState(false);
  const [savedAck, setSavedAck] = useState(false);
  const [toolsLockTipOpen, setToolsLockTipOpen] = useState(false);
  const toolsLockAnchorRef = useRef<HTMLButtonElement | null>(null);
  const toolsLockTipTimerRef = useRef<number | null>(null);
  const savedFingerprintRef = useRef<string | null>(null);
  const savedAckTimerRef = useRef<number | null>(null);

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
      drawCtxRef.current = null;
    }
    const draw = drawCanvasRef.current;
    if (!drawCtxRef.current || drawCtxRef.current.canvas !== draw) {
      drawCtxRef.current = draw.getContext('2d');
    }
    return { base: baseCanvasRef.current, draw };
  }, []);

  const getDisplayCtx = useCallback(() => {
    const display = displayCanvasRef.current;
    if (!display) return null;
    if (display.width !== CANVAS_SIZE || display.height !== CANVAS_SIZE) {
      display.width = CANVAS_SIZE;
      display.height = CANVAS_SIZE;
      displayCtxRef.current = null;
    }
    if (!displayCtxRef.current || displayCtxRef.current.canvas !== display) {
      displayCtxRef.current = display.getContext('2d');
    }
    return displayCtxRef.current;
  }, []);

  const compositeToDisplay = useCallback(() => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    const ctx = getDisplayCtx();
    if (!ctx || !base || !draw) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(draw, 0, 0);
    if (frameImageRef.current) {
      drawAvatarFrameOnLayer(ctx, CANVAS_SIZE, frameImageRef.current);
    }
  }, [getDisplayCtx]);

  /** Быстрый превью во время штриха: без рамки. */
  const blitStrokePreview = useCallback(() => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    const ctx = getDisplayCtx();
    if (!ctx || !base || !draw) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.drawImage(base, 0, 0);
    ctx.drawImage(draw, 0, 0);
  }, [getDisplayCtx]);

  const refreshDrawCheckpoint = useCallback(() => {
    const draw = drawCanvasRef.current;
    const ctx = drawCtxRef.current ?? draw?.getContext('2d');
    if (!draw || !ctx) return;
    drawCheckpointRef.current = ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }, []);

  const getEditorMeta = useCallback(
    (): EditorMeta => ({
      baseMode,
      templateId,
      initialsSource,
      initialsStyle,
      initialsColor,
      badgeText,
      activeFrameId,
      photoDataUrl,
      sourcePhotoDataUrl,
      photoIsComposite,
      compositeSansInitials,
      photoScale,
      photoOffsetX,
      photoOffsetY,
      polishApplied,
    }),
    [
      baseMode,
      templateId,
      initialsSource,
      initialsStyle,
      initialsColor,
      badgeText,
      activeFrameId,
      photoDataUrl,
      sourcePhotoDataUrl,
      photoIsComposite,
      compositeSansInitials,
      photoScale,
      photoOffsetX,
      photoOffsetY,
      polishApplied,
    ],
  );

  const restoreEditorMeta = useCallback((meta: EditorMeta) => {
    setBaseMode(meta.baseMode);
    setTemplateId(meta.templateId);
    setInitialsSource(isAvatarInitialsSource(meta.initialsSource) ? meta.initialsSource : 'capitals');
    setInitialsStyle(isAvatarInitialsStyle(meta.initialsStyle) ? meta.initialsStyle : 'off');
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
    setCompositeSansInitials(Boolean(meta.compositeSansInitials));
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
    const draw = drawCanvasRef.current;
    if (!draw) return null;
    const dCtx = draw.getContext('2d');
    if (!dCtx) return null;
    return {
      kind: 'all',
      draw: dCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      meta: getEditorMeta(),
    };
  }, [getEditorMeta]);

  const paintBaseFromMeta = useCallback(
    (meta: EditorMeta) => {
      const { base } = ensureBuffers();
      const ctx = base.getContext('2d');
      if (!ctx) return;
      const hideBadge = meta.initialsStyle === 'badge';
      /* Legacy JPEG с запечёнными инициалами — не дублируем; working flat — рисуем живьём */
      const paintStyle: AvatarInitialsStyle =
        hideBadge || (meta.photoIsComposite && !meta.compositeSansInitials)
          ? 'off'
          : meta.initialsStyle;
      ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      if (meta.baseMode === 'photo' && meta.photoDataUrl) {
        const cached = photoImageCacheRef.current;
        if (cached?.url === meta.photoDataUrl && cached.img.complete) {
          if (!meta.photoIsComposite) {
            paintAvatarEditorBase(ctx, CANVAS_SIZE, meta.templateId, displayName, 'capitals', 'off');
          }
          drawPhotoWithTransform(
            ctx,
            CANVAS_SIZE,
            cached.img,
            meta.photoScale,
            meta.photoOffsetX,
            meta.photoOffsetY,
          );
          if (paintStyle !== 'off') {
            paintAvatarInitials(
              ctx,
              CANVAS_SIZE,
              displayName,
              meta.initialsSource,
              paintStyle,
              meta.initialsColor,
              meta.badgeText,
            );
          } else if (hideBadge || meta.photoIsComposite) {
            clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
          }
          return;
        }
      }
      paintAvatarEditorBase(
        ctx,
        CANVAS_SIZE,
        meta.templateId,
        displayName,
        meta.initialsSource,
        paintStyle,
        meta.initialsColor,
        meta.badgeText,
      );
      if (hideBadge) clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
    },
    [displayName, ensureBuffers],
  );

  const applyHistoryEntry = useCallback(
    (snap: UndoEntry) => {
      const draw = drawCanvasRef.current;
      if (!draw) return;
      const dCtx = draw.getContext('2d');
      if (!dCtx) return;
      if (snap.kind === 'meta') {
        restoreEditorMeta(snap.meta);
        paintBaseFromMeta(snap.meta);
      } else if (snap.kind === 'all') {
        dCtx.putImageData(snap.draw, 0, 0);
        restoreEditorMeta(snap.meta);
        paintBaseFromMeta(snap.meta);
      } else {
        dCtx.putImageData(snap.draw, 0, 0);
      }
      compositeToDisplay();
      refreshDrawCheckpoint();
      bumpDrawInk();
    },
    [restoreEditorMeta, paintBaseFromMeta, compositeToDisplay, refreshDrawCheckpoint, bumpDrawInk],
  );

  const pushUndoDraw = useCallback(() => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = drawCtxRef.current ?? draw.getContext('2d');
    if (!ctx) return;
    clearRedo();
    undoStackRef.current.push({ kind: 'draw', draw: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [clearRedo]);

  /** Undo без getImageData в pointerdown — снимок заранее (иначе штрих отстаёт на десятки px). */
  const pushUndoDrawCheckpoint = useCallback(() => {
    clearRedo();
    if (drawCheckpointRef.current) {
      undoStackRef.current.push({ kind: 'draw', draw: drawCheckpointRef.current });
    } else {
      const draw = drawCanvasRef.current;
      const ctx = drawCtxRef.current ?? draw?.getContext('2d');
      if (!draw || !ctx) return;
      undoStackRef.current.push({ kind: 'draw', draw: ctx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE) });
    }
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [clearRedo]);

  const pushUndoAll = useCallback(() => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const dCtx = draw.getContext('2d');
    if (!dCtx) return;
    clearRedo();
    /* Только слой рисования + meta — base перерисуем из meta при undo (без 2× getImageData 512²). */
    undoStackRef.current.push({
      kind: 'all',
      draw: dCtx.getImageData(0, 0, CANVAS_SIZE, CANVAS_SIZE),
      meta: getEditorMeta(),
    });
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, [getEditorMeta, clearRedo]);

  /** Undo для смены инициалов/цвета/плашки — без синхронного getImageData(512²). */
  const pushUndoMeta = useCallback(() => {
    clearRedo();
    undoStackRef.current.push({ kind: 'meta', meta: getEditorMeta() });
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
    const hideBadge = initialsStyle === 'badge';
    /* Legacy JPEG с запечёнными инициалами — не дублируем; working flat — живьём; badge — HTML */
    const paintStyle: AvatarInitialsStyle =
      hideBadge || (photoIsComposite && !compositeSansInitials) ? 'off' : initialsStyle;

    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

    if (baseMode === 'photo' && photoDataUrl) {
      try {
        const img = await loadPhotoImage(photoDataUrl);
        if (gen !== redrawGenRef.current) return;
        if (!photoIsComposite) {
          paintAvatarEditorBase(ctx, CANVAS_SIZE, templateId, displayName, 'capitals', 'off');
        }
        drawPhotoWithTransform(ctx, CANVAS_SIZE, img, photoScale, photoOffsetX, photoOffsetY);
        if (paintStyle !== 'off') {
          paintAvatarInitials(
            ctx,
            CANVAS_SIZE,
            displayName,
            initialsSource,
            paintStyle,
            initialsColor,
            badgeText,
          );
        } else if (hideBadge || photoIsComposite) {
          clipAvatarCanvasToCircle(ctx, CANVAS_SIZE);
        }
      } catch {
        if (gen !== redrawGenRef.current) return;
        paintAvatarEditorBase(
          ctx,
          CANVAS_SIZE,
          templateId,
          displayName,
          initialsSource,
          paintStyle,
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
        initialsSource,
        paintStyle,
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
    initialsSource,
    initialsStyle,
    initialsColor,
    badgeText,
    badgeEditing,
    photoIsComposite,
    compositeSansInitials,
    displayName,
    photoScale,
    photoOffsetX,
    photoOffsetY,
    ensureBuffers,
    compositeToDisplay,
    loadPhotoImage,
  ]);

  useEffect(() => {
    ensureBuffers();
    let cancelled = false;
    void redrawBase().then(() => {
      if (cancelled) return;
      /* checkpoint только перед штрихом — не getImageData на каждый open/redraw */
      if (savedFingerprintRef.current === null) {
        savedFingerprintRef.current = fingerprintEditorState(getEditorMeta(), drawInkGenRef.current);
        setIsDirty(false);
      }
    });
    return () => {
      cancelled = true;
    };
    /* не зависеть от getEditorMeta: иначе polishApplied → перерисовка base и снос 3D-финиша */
    // eslint-disable-next-line react-hooks/exhaustive-deps -- getEditorMeta только для первичного fingerprint
  }, [ensureBuffers, redrawBase]);

  useEffect(() => {
    if (!initialsExpanded) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setInitialsExpanded(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [initialsExpanded]);

  useEffect(() => {
    if (savedFingerprintRef.current === null) return;
    const id = window.requestAnimationFrame(() => {
      const fp = fingerprintEditorState(getEditorMeta(), drawInkGenRef.current);
      const dirty = fp !== savedFingerprintRef.current;
      setIsDirty(dirty);
      if (dirty) setSavedAck(false);
    });
    return () => window.cancelAnimationFrame(id);
  }, [
    getEditorMeta,
    baseMode,
    templateId,
    initialsSource,
    initialsStyle,
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
    drawInkTick,
  ]);

  useEffect(() => {
    return () => {
      if (savedAckTimerRef.current != null) window.clearTimeout(savedAckTimerRef.current);
    };
  }, []);

  const selectBackground = (id: AvatarEditorTemplateId) => {
    pushUndoAll();
    /* Фон меняем отдельно — стикеры/кисть на draw оставляем */
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      setCompositeSansInitials(false);
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
    /* Готовый «образ» — новый фон; draw (стикеры) сохраняем */
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      setCompositeSansInitials(false);
      photoImageCacheRef.current = null;
    }
    setVariantBlockedHint(false);
    setTemplateId(id);
    setInitialsStyle('off');
    setActiveFrameId(null);
    setBaseMode('template');
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  const selectEmptyBase = () => {
    pushUndoAll();
    if (photoIsComposite) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      setCompositeSansInitials(false);
      photoImageCacheRef.current = null;
    }
    setTemplateId('none');
    setInitialsStyle('off');
    setActiveFrameId(null);
    setBaseMode('template');
    setPolishApplied(false);
    setError(null);
    setBaseChosen(true);
  };

  /** Сброс запечённых старых инициалов при смене типа (не наслаивать). */
  const clearBakedInitialsIfNeeded = () => {
    if (photoIsComposite && !compositeSansInitials) {
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      setCompositeSansInitials(false);
      photoImageCacheRef.current = null;
      setBaseMode('template');
    }
  };

  const selectInitialsSource = (source: AvatarInitialsSource) => {
    pushUndoMeta();
    clearBakedInitialsIfNeeded();
    startTransition(() => {
      setInitialsSource(source);
      setInitialsStyle((prev) => (prev === 'off' ? 'center' : prev));
      if (AVATAR_EDITOR_STYLE_TEMPLATES.some((t) => t.id === templateId)) {
        setTemplateId('neutral');
      }
      setVariantBlockedHint(false);
      setPolishApplied(false);
      setError(null);
      setBaseChosen(true);
    });
  };

  const selectInitialsStyle = (style: AvatarInitialsStyle) => {
    pushUndoMeta();
    clearBakedInitialsIfNeeded();
    startTransition(() => {
      setInitialsStyle(style);
      if (style === 'badge') {
        if (!badgeText) setBadgeText(defaultAvatarBadgeText(displayName));
      } else {
        setBadgeEditing(false);
      }
      if (style !== 'off' && AVATAR_EDITOR_STYLE_TEMPLATES.some((t) => t.id === templateId)) {
        setTemplateId('neutral');
      }
      setVariantBlockedHint(false);
      setPolishApplied(false);
      setError(null);
      setBaseChosen(true);
    });
  };

  const openBadgeEditor = useCallback(() => {
    setBadgePencilTipOpen(false);
    setBadgeConfirmTipOpen(false);
    setBadgeDraft(badgeText || defaultAvatarBadgeText(displayName));
    setBadgeEditing(true);
  }, [badgeText, displayName]);

  const cancelBadgeEditor = useCallback(() => {
    setBadgeEditing(false);
    setBadgeConfirmTipOpen(false);
    setBadgeDraft(badgeText);
  }, [badgeText]);

  const commitBadgeEditor = useCallback(() => {
    const next = normalizeAvatarBadgeText(badgeDraft) || defaultAvatarBadgeText(displayName);
    if (next !== badgeText) {
      pushUndoMeta();
      setBadgeText(next);
      setPolishApplied(false);
    }
    setBadgeConfirmTipOpen(false);
    setBadgeEditing(false);
  }, [badgeDraft, badgeText, displayName, pushUndoMeta]);

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
    if (color === initialsColor) return;
    pushUndoMeta();
    startTransition(() => {
      if (photoIsComposite && !compositeSansInitials) {
        setPhotoDataUrl(null);
        setPhotoIsComposite(false);
        setCompositeSansInitials(false);
        photoImageCacheRef.current = null;
        setBaseMode('template');
      }
      setInitialsColor(color);
      setPolishApplied(false);
      setError(null);
    });
  };

  const closeInitialsPanel = useCallback(() => {
    setInitialsExpanded(false);
  }, []);

  const openInitialsPanel = useCallback(() => {
    setFoldSection((cur) =>
      cur === 'brush' || cur === 'frames' || cur === 'stickers' ? null : cur,
    );
    setInitialsExpanded(true);
  }, []);

  const toggleInitialsExpanded = useCallback(() => {
    setInitialsExpanded((v) => {
      if (v) return false;
      setFoldSection((cur) =>
        cur === 'brush' || cur === 'frames' || cur === 'stickers' ? null : cur,
      );
      return true;
    });
  }, []);

  const onInitialsColorBtnClick = useCallback(() => {
    if (initialsExpanded) {
      closeInitialsPanel();
      return;
    }
    openInitialsPanel();
  }, [initialsExpanded, closeInitialsPanel, openInitialsPanel]);

  const onInitialsThumbClick = useCallback(() => {
    if (initialsExpanded) {
      closeInitialsPanel();
      return;
    }
    openInitialsPanel();
  }, [initialsExpanded, closeInitialsPanel, openInitialsPanel]);

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
  const stageOpen =
    foldSection === 'photo' || foldSection === 'styles' || foldSection === 'bg';
  const toolsFoldOpen =
    foldSection === 'brush' || foldSection === 'frames' || foldSection === 'stickers';
  const noPhotoBesideClear = Boolean(sourcePhotoDataUrl || (photoDataUrl && !photoIsComposite)) && !baseTabOpen;

  useEffect(() => {
    if (foldSection === 'brush') {
      /* Вход в Кисть — сразу свободная кисть, не залипший штамп */
      setTool('brush');
      setBrushStamp(null);
      return;
    }
    setBrushPanelSec(null);
  }, [foldSection]);

  useEffect(() => {
    return () => {
      if (compositeRafRef.current) cancelAnimationFrame(compositeRafRef.current);
    };
  }, []);

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
    clearAvatarEditorSourcePhoto();
    setPhotoIsComposite(false);
    setCompositeSansInitials(false);
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
    /*
     * Стикеры/кисть на draw — просто стереть.
     * На сохранённой аве (composite) они уже в JPEG: сбрасываем композит на шаблон,
     * иначе кнопка «Очистить» визуально ничего не делает.
     */
    if (photoIsComposite) {
      pushUndoAll();
      const draw = drawCanvasRef.current;
      const ctx = drawCtxRef.current ?? draw?.getContext('2d');
      if (ctx && draw) ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
      setPhotoDataUrl(null);
      setPhotoIsComposite(false);
      setCompositeSansInitials(false);
      photoImageCacheRef.current = null;
      setBaseMode('template');
      setPolishApplied(false);
      setActiveFrameId(null);
      bumpDrawInk();
      refreshDrawCheckpoint();
      return;
    }
    pushUndoDraw();
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = drawCtxRef.current ?? draw.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    compositeToDisplay();
    refreshDrawCheckpoint();
    bumpDrawInk();
  };

  const applyFrame = (frameId: AvatarFrameId) => {
    pushUndoAll();
    /* Рамка — оверлей; не сбрасываем composite и не воскрешаем фото */
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
    if (polishApplied) return;
    const { base, draw } = ensureBuffers();
    pushUndoAll();
    bake3dPolishToBase(base, draw, CANVAS_SIZE);
    setPolishApplied(true);
    bumpDrawInk();
    refreshDrawCheckpoint();
    compositeToDisplay();
  };

  const canvasPoint = (clientX: number, clientY: number) => {
    const canvas = displayCanvasRef.current;
    if (!canvas) return null;
    const rect =
      drawingRef.current && canvasRectRef.current
        ? canvasRectRef.current
        : canvas.getBoundingClientRect();
    const scale = CANVAS_SIZE / rect.width;
    return {
      x: (clientX - rect.left) * scale,
      y: (clientY - rect.top) * scale,
    };
  };

  const placeSticker = (x: number, y: number) => {
    if (isPremiumSticker(stickerId) && !premiumJokerOk) {
      setStickerPremiumTip(true);
      return;
    }
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    drawAvatarSticker(ctx, x, y, stickerId, stickerColor, 1);
    compositeToDisplay();
  };

  const placeBrushStamp = (x: number, y: number, stamp: BrushStampId) => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d');
    if (!ctx) return;
    paintBrushStamp(ctx, x, y, stamp, brushColor, brushSize, brushNeon);
    compositeToDisplay();
  };

  const applyBrushFill = (x: number, y: number) => {
    const draw = drawCanvasRef.current;
    if (!draw) return;
    const ctx = draw.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;
    const ok = floodFillBrushLayer(ctx, CANVAS_SIZE, x, y, brushColor, brushNeon);
    if (ok) compositeToDisplay();
  };

  const strokeTo = (x: number, y: number) => {
    ensureBuffers();
    const ink = drawCtxRef.current;
    if (!ink) return;
    const last = lastPointRef.current;
    const from = last ?? { x, y };

    if (tool === 'eraser') {
      ink.save();
      ink.globalCompositeOperation = 'destination-out';
      /* Жирнее кисти: ластик иначе ощущается «тонкой ниткой» */
      const eraseSize = Math.max(brushSize * 2.4, brushSize + 10);
      paintBrushStrokeSegment(ink, from.x, from.y, x, y, eraseSize, '#000000', 'solid', false);
      ink.restore();
    } else {
      ink.globalCompositeOperation = 'source-over';
      paintBrushStrokeSegment(
        ink,
        from.x,
        from.y,
        x,
        y,
        brushSize,
        brushColor,
        brushStroke,
        brushNeon,
        brushStroke === 'dashed' ? dashStrokeRef.current : undefined,
      );
    }
    lastPointRef.current = { x, y };
    blitStrokePreview();
  };

  const endStroke = () => {
    drawingRef.current = false;
    undoPushedForStrokeRef.current = false;
    lastPointRef.current = null;
    dashStrokeRef.current = { dist: 0 };
    canvasRectRef.current = null;
    photoPanRef.current = null;
    if (compositeRafRef.current) {
      cancelAnimationFrame(compositeRafRef.current);
      compositeRafRef.current = 0;
    }
    compositeToDisplay();
    refreshDrawCheckpoint();
    bumpDrawInk();
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = canvasPoint(e.clientX, e.clientY);
    if (!p) return;

    if (initialsStyle === 'badge' && !badgeEditing) {
      if (hitTestAvatarBadge(CANVAS_SIZE, badgeText, p.x, p.y)) {
        openBadgeEditor();
        return;
      }
    }

    if (tool === 'sticker') {
      pushUndoDraw();
      placeSticker(p.x, p.y);
      refreshDrawCheckpoint();
      bumpDrawInk();
      return;
    }

    if (tool === 'fill') {
      pushUndoDraw();
      applyBrushFill(p.x, p.y);
      refreshDrawCheckpoint();
      bumpDrawInk();
      return;
    }

    if (tool === 'brush' && brushStamp) {
      pushUndoDraw();
      placeBrushStamp(p.x, p.y, brushStamp);
      refreshDrawCheckpoint();
      bumpDrawInk();
      return;
    }

    if (tool === 'photo' && photoDataUrl && baseMode === 'photo') {
      pushUndoAll();
      photoPanRef.current = { startX: p.x, startY: p.y, ox: photoOffsetX, oy: photoOffsetY };
      e.currentTarget.setPointerCapture(e.pointerId);
      return;
    }

    e.currentTarget.setPointerCapture(e.pointerId);
    canvasRectRef.current = e.currentTarget.getBoundingClientRect();
    drawingRef.current = true;
    dashStrokeRef.current = { dist: 0 };
    if (!undoPushedForStrokeRef.current) {
      pushUndoDrawCheckpoint();
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
    if (!drawingRef.current && initialsStyle === 'badge' && !badgeEditing) {
      const p = canvasPoint(e.clientX, e.clientY);
      const hot = Boolean(p && hitTestAvatarBadge(CANVAS_SIZE, badgeText, p.x, p.y));
      e.currentTarget.style.cursor = hot ? 'pointer' : canvasCursorRef.current;
    } else if (!drawingRef.current) {
      e.currentTarget.style.cursor = canvasCursorRef.current;
    }
    if (!drawingRef.current || tool === 'sticker' || tool === 'fill' || brushStamp) return;

    const native = e.nativeEvent;
    const coalesced =
      typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : null;
    if (coalesced && coalesced.length > 0) {
      for (const ev of coalesced) {
        const p = canvasPoint(ev.clientX, ev.clientY);
        if (p) strokeTo(p.x, p.y);
      }
      return;
    }
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
    rememberAvatarEditorSourcePhoto(dataUrl);
    setPhotoIsComposite(false);
    setCompositeSansInitials(false);
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

  const handleSave = async (): Promise<boolean> => {
    const base = baseCanvasRef.current;
    const draw = drawCanvasRef.current;
    if (!base || !draw) return false;
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
      /* Плашка впечатывается в круг без внешних полей — в капсуле лицо заполняет кольцо */
      let out = exportCircularAvatarJpeg(base, exportDraw, undefined, {
        keepBadgeOutside: false,
        paintBadge:
          initialsStyle === 'badge'
            ? (ctx, avatarSize, ox, oy) => {
                ctx.save();
                ctx.translate(ox, oy);
                paintAvatarInitials(
                  ctx,
                  avatarSize,
                  displayName,
                  initialsSource,
                  'badge',
                  initialsColor,
                  badgeText,
                );
                ctx.restore();
              }
            : undefined,
      });
      out = await compressImageToDataUrl(out);

      /* Рабочий слой без инициалов — при следующем открытии глифы меняются чисто */
      let bakedWorking: string | null = null;
      try {
        const flat = document.createElement('canvas');
        flat.width = CANVAS_SIZE;
        flat.height = CANVAS_SIZE;
        const fctx = flat.getContext('2d');
        if (fctx) {
          if (photoIsComposite && compositeSansInitials && photoDataUrl) {
            const img = await loadPhotoImage(photoDataUrl);
            fctx.drawImage(img, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
            fctx.drawImage(draw, 0, 0);
          } else if (photoIsComposite && !compositeSansInitials) {
            /* Legacy JPEG с запечёнными инициалами — отдельный clean-слой не восстановить */
            clearAvatarEditorWorkingFlat();
          } else if (baseMode === 'photo' && photoDataUrl) {
            paintAvatarEditorBase(fctx, CANVAS_SIZE, templateId, displayName, 'capitals', 'off');
            const img = await loadPhotoImage(photoDataUrl);
            drawPhotoWithTransform(fctx, CANVAS_SIZE, img, photoScale, photoOffsetX, photoOffsetY);
            clipAvatarCanvasToCircle(fctx, CANVAS_SIZE);
            fctx.drawImage(draw, 0, 0);
          } else {
            paintAvatarEditorBase(fctx, CANVAS_SIZE, templateId, displayName, 'capitals', 'off');
            fctx.drawImage(draw, 0, 0);
          }
          if (!(photoIsComposite && !compositeSansInitials)) {
            const working = flat.toDataURL('image/jpeg', 0.92);
            saveAvatarEditorWorkingFlat(working);
            photoImageCacheRef.current = null;
            setPhotoDataUrl(working);
            setPhotoIsComposite(true);
            setCompositeSansInitials(true);
            setBaseMode('photo');
            /* Трансформ уже вшит в flat — иначе следующий кадр наложит его второй раз */
            setPhotoScale(1);
            setPhotoOffsetX(0);
            setPhotoOffsetY(0);
            const dctx = drawCtxRef.current ?? draw.getContext('2d');
            if (dctx) dctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
            bumpDrawInk();
            bakedWorking = working;
          }
        }
      } catch {
        /* quota / decode — профиль всё равно сохраним */
      }

      saveAvatarEditorProject({
        templateId,
        initialsSource,
        initialsStyle,
        initialsColor,
        badgeText,
        activeFrameId,
        baseMode: 'photo',
        photoScale: bakedWorking ? 1 : photoScale,
        photoOffsetX: bakedWorking ? 0 : photoOffsetX,
        photoOffsetY: bakedWorking ? 0 : photoOffsetY,
        sourcePhotoDataUrl,
      });
      setAvatar3dPolishFlag(polishApplied);
      onSave(out);
      const savedMeta: EditorMeta = bakedWorking
        ? {
            ...getEditorMeta(),
            baseMode: 'photo',
            photoDataUrl: bakedWorking,
            photoIsComposite: true,
            compositeSansInitials: true,
            photoScale: 1,
            photoOffsetX: 0,
            photoOffsetY: 0,
          }
        : getEditorMeta();
      savedFingerprintRef.current = fingerprintEditorState(savedMeta, drawInkGenRef.current);
      setIsDirty(false);
      setSavedAck(true);
      if (savedAckTimerRef.current != null) window.clearTimeout(savedAckTimerRef.current);
      savedAckTimerRef.current = window.setTimeout(() => setSavedAck(false), 1600);
      return true;
    } catch {
      setError(tr('avatarEditor.saveFail'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const leaveEditor = useCallback(() => {
    /* Закрыли редактор — исходное фото сессии забываем (не предлагать «вернуть» вечно) */
    clearAvatarEditorSourcePhoto();
    onCancel();
  }, [onCancel]);

  const handleDone = async () => {
    if (isDirty) {
      const ok = await handleSave();
      if (!ok) return;
    }
    leaveEditor();
  };

  const selectBrushColor = (c: string) => {
    setTool('brush');
    setBrushColor(c);
  };

  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') leaveEditor();
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
  }, [leaveEditor, handleUndo, handleRedo]);

  const canvasCursor =
    tool === 'sticker' || brushStamp
      ? 'copy'
      : tool === 'photo'
        ? 'grab'
        : tool === 'eraser' || tool === 'fill'
          ? 'cell'
          : 'crosshair';
  canvasCursorRef.current = canvasCursor;
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
        : tool === 'fill'
          ? tr('avatarEditor.hintFill')
          : tool === 'eraser'
            ? tr('avatarEditor.hintEraser')
            : brushStamp
              ? tr('avatarEditor.hintStamp')
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
      onClick={(e) => e.target === e.currentTarget && leaveEditor()}
      role="presentation"
    >
      <div
        className={[
          'avatar-editor-modal-card',
          isDesktopProfileUi ? 'avatar-editor-modal-card--desktop' : '',
          stageOpen ? 'avatar-editor-modal-card--stage' : 'avatar-editor-modal-card--hub',
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
        <AvatarEditorTipButton
          type="button"
          className="avatar-editor-modal-close"
          onClick={leaveEditor}
          aria-label={tr('common.close')}
          tipText={tr('common.close')}
        >
          ×
        </AvatarEditorTipButton>
        <div className="avatar-editor-left-col">
          <div className="avatar-editor-hero">
          <h2 id="avatar-editor-title" className="avatar-editor-modal-card__title">
            {tr('avatarEditor.title')}
          </h2>
          <div className="avatar-editor-hero__wing avatar-editor-hero__wing--left">
            <AvatarEditorTipButton
              type="button"
              className="avatar-editor-history-btn avatar-editor-hero__slot avatar-editor-hero__slot--top"
              onClick={handleUndo}
              disabled={!canUndo}
              tipText={tr('avatarEditor.backTitle')}
              aria-label={tr('avatarEditor.back')}
            >
              <span className="avatar-editor-history-btn__icon" aria-hidden>
                ↶
              </span>
              <span className="avatar-editor-history-btn__label">{tr('avatarEditor.back')}</span>
            </AvatarEditorTipButton>
            <p className="avatar-editor-hero__eyebrow avatar-editor-hero__slot avatar-editor-hero__slot--mid">{tr('avatarEditor.avatar')}</p>
            <AvatarEditorTipButton
              type="button"
              className="avatar-editor-history-btn avatar-editor-hero__slot avatar-editor-hero__slot--bottom"
              onClick={handleRedo}
              disabled={!canRedo}
              tipText={tr('avatarEditor.forwardTitle')}
              aria-label={tr('avatarEditor.forward')}
            >
              <span className="avatar-editor-history-btn__icon" aria-hidden>
                ↷
              </span>
              <span className="avatar-editor-history-btn__label">{tr('avatarEditor.forward')}</span>
            </AvatarEditorTipButton>
          </div>
          <div
            className={[
              'avatar-editor-preview-ring',
              'avatar-editor-hero__canvas',
              initialsStyle === 'badge' || badgeEditing ? 'avatar-editor-preview-ring--badge' : '',
              badgeEditing ? 'avatar-editor-preview-ring--badge-edit' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <canvas
              ref={displayCanvasRef}
              className={[
                'avatar-editor-canvas',
                tool === 'brush' && !brushStamp
                  ? `avatar-editor-canvas--brush-${brushStroke}`
                  : '',
                tool === 'eraser' ? 'avatar-editor-canvas--eraser' : '',
                tool === 'fill' ? 'avatar-editor-canvas--fill' : '',
                tool === 'sticker' || brushStamp ? 'avatar-editor-canvas--stamp' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{ cursor: canvasCursor }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endStroke}
              onPointerCancel={endStroke}
              aria-label={tr('avatarEditor.canvas')}
              title={
                tool === 'brush' && !brushStamp
                  ? tr('avatarEditor.hintDraw')
                  : tool === 'eraser'
                    ? tr('avatarEditor.hintEraser')
                    : tool === 'fill'
                      ? tr('avatarEditor.hintFill')
                      : undefined
              }
            />
            {initialsStyle === 'badge'
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
                          <MenuNamePlaqueConfirmMark
                            className="avatar-editor-badge-plate__confirm"
                            onConfirm={commitBadgeEditor}
                            tipOpen={badgeConfirmTipOpen}
                            onTipOpenChange={setBadgeConfirmTipOpen}
                            tipId={badgeConfirmTipId}
                            tipText={tr('common.save')}
                            ariaLabel={tr('common.save')}
                          />
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
                <AvatarEditorTipButton
                  type="button"
                  className="avatar-editor-clear-btn"
                  onClick={clearDrawing}
                  tipText={tr('avatarEditor.clear')}
                  tipDetail={tr('avatarEditor.clearTitle')}
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
                </AvatarEditorTipButton>
                <AvatarEditorTipButton
                  type="button"
                  className={[
                    'avatar-editor-no-photo-btn',
                    variantBlockedHint ? 'avatar-editor-no-photo-btn--nudge' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={handleRemovePhoto}
                  tipText={
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
                </AvatarEditorTipButton>
              </div>
            ) : (
              <AvatarEditorTipButton
                type="button"
                className="avatar-editor-clear-btn avatar-editor-hero__slot avatar-editor-hero__slot--top"
                onClick={clearDrawing}
                tipText={tr('avatarEditor.clear')}
                tipDetail={tr('avatarEditor.clearTitle')}
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
              </AvatarEditorTipButton>
            )}
            {photoDataUrl && baseTabOpen ? (
              <AvatarEditorTipButton
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
                tipText={
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
              </AvatarEditorTipButton>
            ) : null}
            <AvatarEditorTipButton
              type="button"
              className={[
                'avatar-editor-3d-btn',
                'avatar-editor-hero__slot',
                'avatar-editor-hero__slot--bottom',
                polishApplied ? 'avatar-editor-3d-btn--applied' : '',
              ].join(' ')}
              onClick={apply3dPolish}
              disabled={polishApplied}
              aria-pressed={polishApplied}
              tipText={tr('avatarEditor.polishTitle')}
              aria-label={tr('avatarEditor.polish')}
            >
              <AvatarPolishGlyph className="avatar-editor-3d-btn__glyph" />
            </AvatarEditorTipButton>
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
            <AvatarEditorTipButton
              type="button"
              className="avatar-editor-restore-photo-btn avatar-editor-hero__restore-photo"
              onClick={restorePhotoMode}
              tipText={tr('avatarEditor.restorePhoto')}
            >
              {tr('avatarEditor.restorePhoto')}
            </AvatarEditorTipButton>
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
              {initialsStyle !== 'badge' ? (
                <div
                  className="avatar-editor-initials-rail__color-wrap"
                  ref={initialsColorWrapRef}
                >
                  <AvatarEditorTipButton
                    type="button"
                    className={[
                      'avatar-editor-initials-rail__tag',
                      showInitialsColorPalette ? 'avatar-editor-initials-rail__tag--open' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    aria-label={tr('avatarEditor.initialsColor')}
                    aria-expanded={showInitialsColorPalette}
                    aria-haspopup="listbox"
                    tipText={tr('avatarEditor.initialsColor')}
                    onClick={onInitialsColorBtnClick}
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
                  </AvatarEditorTipButton>
                  {showInitialsColorPalette ? (
                    <div
                      className="avatar-editor-initials-colors"
                      role="listbox"
                      aria-label={tr('avatarEditor.initialsColor')}
                    >
                      {AVATAR_INITIALS_COLORS.map((c) => (
                        <AvatarEditorTipButton
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
                          tipText={tr('avatarEditor.initialsColorOf', { c })}
                          onClick={() => selectInitialsColor(c)}
                        />
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
              <AvatarPresetThumb
                presetId={`chip-${initialsStyle}`}
                templateId="aurora"
                initialsSource={initialsSource}
                initialsStyle={initialsStyle}
                initialsColor={initialsColor}
                displayName={displayName}
                glyphPreview
                glyphPreviewKind="style"
                tipText={styleAriaLabel(initialsStyle, tr)}
                tipDetail={styleTipDetail(initialsStyle, tr)}
                active={!initialsExpanded}
                ariaLabel={styleAriaLabel(initialsStyle, tr)}
                onClick={onInitialsThumbClick}
                className={
                  initialsStyle === 'off'
                    ? 'avatar-editor-preset-thumb--glyph-off avatar-editor-initials-chip__thumb'
                    : 'avatar-editor-preset-thumb--glyph avatar-editor-initials-chip__thumb'
                }
              />
              <AvatarEditorTipButton
                type="button"
                className="avatar-editor-initials-chip__more"
                aria-expanded={initialsExpanded}
                aria-label={
                  initialsExpanded ? tr('avatarEditor.initialsCollapse') : tr('avatarEditor.initialsScrollMore')
                }
                tipText={
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
              </AvatarEditorTipButton>
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
                  <AvatarEditorTipButton
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
                    tipText={baseChosen ? sectionLabel(id, tr) : tr('avatarEditor.toolsLocked')}
                    tipDetail={baseChosen ? undefined : tr('avatarEditor.toolsLockedDetail')}
                    aria-label={baseChosen ? sectionLabel(id, tr) : tr('avatarEditor.toolsLocked')}
                    aria-describedby={
                      !baseChosen && toolsLockTipOpen ? 'avatar-editor-tools-lock-tip' : undefined
                    }
                    onClick={(e) => {
                      if (!baseChosen) {
                        showToolsLockedTip(e.currentTarget);
                        return;
                      }
                      setInitialsExpanded(false);
                      startTransition(() => {
                        setFoldSection((cur) => (cur === id ? null : id));
                      });
                    }}
                    aria-pressed={foldSection === id ? true : undefined}
                  >
                    <HubSectionGlyph id={id} />
                  </AvatarEditorTipButton>
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
              aria-label={tr('avatarEditor.initials')}
            >
              <div className="avatar-editor-initials-rail__band">
                <span className="avatar-editor-initials-rail__band-label" id="avatar-editor-initials-source-label">
                  {tr('avatarEditor.initialsSource')}
                </span>
                <div
                  className="avatar-editor-initials-rail__row avatar-editor-initials-rail__row--source"
                  role="list"
                  aria-labelledby="avatar-editor-initials-source-label"
                >
                  {AVATAR_INITIALS_SOURCES.map((source) => {
                    const sample =
                      resolveAvatarInitialsText(displayName || 'Анна 17', source) ||
                      (source === 'first' ? 'А' : source === 'firstDigits' ? 'А17' : 'АБ');
                    return (
                      <AvatarEditorTipButton
                        key={source}
                        type="button"
                        role="listitem"
                        className={[
                          'avatar-editor-initials-source-chip',
                          initialsStyle !== 'off' && initialsSource === source
                            ? 'avatar-editor-initials-source-chip--active'
                            : '',
                          initialsStyle === 'badge' ? 'avatar-editor-initials-source-chip--disabled' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-pressed={initialsStyle !== 'off' && initialsSource === source}
                        aria-label={sourceAriaLabel(source, tr)}
                        tipText={sourceAriaLabel(source, tr)}
                        tipDetail={sourceTipDetail(source, tr)}
                        disabled={initialsStyle === 'badge'}
                        onClick={() => selectInitialsSource(source)}
                      >
                        <span
                          className="avatar-editor-initials-source-chip__sample"
                          style={{ color: initialsColor }}
                          aria-hidden
                        >
                          {sample}
                        </span>
                        <span className="avatar-editor-initials-source-chip__caption">
                          {source === 'first'
                            ? 'А'
                            : source === 'firstDigits'
                              ? 'А+№'
                              : 'АБВ'}
                        </span>
                      </AvatarEditorTipButton>
                    );
                  })}
                  {initialsStyle !== 'off' ? (
                    <AvatarEditorTipButton
                      type="button"
                      role="listitem"
                      className="avatar-editor-initials-source-chip avatar-editor-initials-source-chip--off"
                      aria-label={styleAriaLabel('off', tr)}
                      tipText={styleAriaLabel('off', tr)}
                      tipDetail={styleTipDetail('off', tr)}
                      onClick={() => selectInitialsStyle('off')}
                    >
                      <span className="avatar-editor-initials-source-chip__sample" aria-hidden>
                        ✕
                      </span>
                      <span className="avatar-editor-initials-source-chip__caption">
                        {tr('avatarEditor.glyphOff')}
                      </span>
                    </AvatarEditorTipButton>
                  ) : null}
                </div>
              </div>

              <div className="avatar-editor-initials-rail__band">
                <span className="avatar-editor-initials-rail__band-label" id="avatar-editor-initials-style-label">
                  {tr('avatarEditor.initialsStyle')}
                </span>
                <div
                  className="avatar-editor-initials-rail__row avatar-editor-initials-rail__row--style"
                  role="list"
                  aria-labelledby="avatar-editor-initials-style-label"
                >
                  {AVATAR_INITIALS_STYLE_CHIPS.map((style) => (
                    <AvatarPresetThumb
                      key={style}
                      presetId={`sty-${style}`}
                      templateId="aurora"
                      initialsSource={initialsSource}
                      initialsStyle={style}
                      initialsColor={initialsColor}
                      displayName={displayName}
                      glyphPreview
                      glyphPreviewKind="style"
                      tipText={styleAriaLabel(style, tr)}
                      tipDetail={styleTipDetail(style, tr)}
                      active={initialsStyle === style}
                      ariaLabel={styleAriaLabel(style, tr)}
                      onClick={() => selectInitialsStyle(style)}
                      premiumBadge={style === 'badge'}
                      className="avatar-editor-preset-thumb--glyph avatar-editor-preset-thumb--style-chip"
                    />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {toolsFoldOpen ? (
            <div
              className={[
                'avatar-editor-tools-fold',
                foldSection ? `avatar-editor-tools-fold--${foldSection}` : '',
              ]
                .filter(Boolean)
                .join(' ')}
              role="region"
              aria-label={foldSection ? sectionLabel(foldSection, tr) : undefined}
            >
              {foldSection === 'brush' ? (
                <div
                  className={[
                    'avatar-editor-brush-dock',
                    brushNeon ? 'avatar-editor-brush-dock--neon' : 'avatar-editor-brush-dock--flat',
                    brushPanelSec ? `avatar-editor-brush-dock--open-${brushPanelSec}` : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div className="avatar-editor-brush-tabs" role="tablist" aria-label={tr('avatarEditor.brush')}>
                    {(
                      [
                        {
                          id: 'color' as const,
                          label: tr('avatarEditor.brushSecColor'),
                          glyph: (
                            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                              <circle cx="8.2" cy="10" r="5.2" fill="#22d3ee" />
                              <circle cx="15.8" cy="9.2" r="5.4" fill="#e879f9" />
                              <circle cx="12" cy="15.6" r="4.8" fill="#fbbf24" />
                              <circle cx="12" cy="11.2" r="2.2" fill="#ecfeff" opacity="0.9" />
                            </svg>
                          ),
                        },
                        {
                          id: 'size' as const,
                          label: tr('avatarEditor.brushSecSize'),
                          glyph: (
                            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                              <rect x="3" y="4.2" width="18" height="2.4" rx="1.2" fill="#67e8f9" />
                              <rect x="3" y="10.2" width="18" height="4" rx="2" fill="#a78bfa" />
                              <rect x="3" y="16.4" width="18" height="5.6" rx="2.6" fill="#f472b6" />
                            </svg>
                          ),
                        },
                        {
                          id: 'shape' as const,
                          label: tr('avatarEditor.brushSecShape'),
                          glyph: (
                            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                              <defs>
                                <linearGradient id={`brush-shape-g-${brushUiId}`} x1="0.2" y1="0" x2="0.9" y2="1">
                                  <stop stopColor="#fde68a" />
                                  <stop offset="0.45" stopColor="#f472b6" />
                                  <stop offset="1" stopColor="#a78bfa" />
                                </linearGradient>
                              </defs>
                              <path
                                d="M12 2.6 14.6 9h6.6l-5.3 3.9 2 6.2L12 15.4 6.1 19.1l2-6.2L2.8 9H9.4Z"
                                fill={`url(#brush-shape-g-${brushUiId})`}
                              />
                            </svg>
                          ),
                        },
                        {
                          id: 'act' as const,
                          label: tr('avatarEditor.brushSecAct'),
                          glyph: (
                            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                              <path
                                d="M14.8 4.2 18.4 7.8 10.2 16H6.6v-3.6L14.8 4.2Z"
                                fill="#fda4af"
                              />
                              <path d="M5 19h14" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />
                              <path
                                d="M15.6 13.2c1.2 0 2.2 1.1 2.2 2.2 0 1.4-2.2 3-2.2 3s-2.2-1.6-2.2-3c0-1.1 1-2.2 2.2-2.2Z"
                                fill="#67e8f9"
                              />
                            </svg>
                          ),
                        },
                      ] as const
                    ).map((tab) => (
                      <AvatarEditorTipButton
                        key={tab.id}
                        type="button"
                        role="tab"
                        className={[
                          'avatar-editor-brush-tab',
                          `avatar-editor-brush-tab--${tab.id}`,
                          brushPanelSec === tab.id ? 'is-on' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        aria-selected={brushPanelSec === tab.id}
                        aria-expanded={brushPanelSec === tab.id}
                        tipText={tab.label}
                        aria-label={tab.label}
                        onClick={() => {
                          const next = brushPanelSec === tab.id ? null : tab.id;
                          setBrushPanelSec(next);
                          /* Штамп активен только на вкладке «Штампы» */
                          if (next !== 'shape') setBrushStamp(null);
                          /* Уход со штампов → снова кисть (не сбрасываем fill/eraser) */
                          if (brushPanelSec === 'shape' && next !== 'shape') {
                            setTool('brush');
                          }
                        }}
                      >
                        <span className="avatar-editor-brush-tab__glyph">{tab.glyph}</span>
                      </AvatarEditorTipButton>
                    ))}
                  </div>

                  {brushPanelSec === 'color' ? (
                    <div
                      className="avatar-editor-brush-panel avatar-editor-brush-panel--color"
                      role="tabpanel"
                      aria-label={tr('avatarEditor.brushSecColor')}
                    >
                      {BRUSH_QUICK_COLORS.map((c) => (
                        <button
                          key={c}
                          type="button"
                          className={[
                            'avatar-editor-color',
                            brushNeon ? 'avatar-editor-color--neon' : 'avatar-editor-color--flat',
                            tool !== 'eraser' && brushColor === c ? 'avatar-editor-color--active' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          style={brushSwatchPreviewStyle(c, brushNeon)}
                          onClick={() => {
                            selectBrushColor(c);
                            if (tool === 'eraser') setTool('brush');
                          }}
                          aria-label={tr('avatarEditor.colorOf', { c })}
                        />
                      ))}
                      <div className="avatar-editor-brush-mode" role="group" aria-label={tr('avatarEditor.brushMode')}>
                        <AvatarEditorTipButton
                          type="button"
                          className={[
                            'avatar-editor-brush-mode__btn',
                            'avatar-editor-brush-mode__btn--neon',
                            brushNeon ? 'is-on' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-pressed={brushNeon}
                          tipText={tr('avatarEditor.neonTitle')}
                          aria-label={tr('avatarEditor.neon')}
                          onClick={() => setBrushNeon(true)}
                        >
                          <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden>
                            <circle cx="10" cy="10" r="3.2" fill="currentColor" />
                            <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.4" opacity="0.55" />
                            <circle cx="10" cy="10" r="9" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.28" />
                          </svg>
                        </AvatarEditorTipButton>
                        <AvatarEditorTipButton
                          type="button"
                          className={[
                            'avatar-editor-brush-mode__btn',
                            'avatar-editor-brush-mode__btn--flat',
                            !brushNeon ? 'is-on' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          aria-pressed={!brushNeon}
                          tipText={tr('avatarEditor.flatTitle')}
                          aria-label={tr('avatarEditor.flat')}
                          onClick={() => setBrushNeon(false)}
                        >
                          <svg viewBox="0 0 20 20" width="13" height="13" aria-hidden>
                            <rect x="4" y="4" width="12" height="12" rx="2.5" fill="currentColor" />
                          </svg>
                        </AvatarEditorTipButton>
                      </div>
                      <AvatarNeonColorPicker
                        color={brushColor}
                        onChange={(c) => {
                          selectBrushColor(c);
                          if (tool === 'eraser') setTool('brush');
                        }}
                        neonBrush={brushNeon}
                        onNeonBrushChange={setBrushNeon}
                        hideExternalModeToggle
                        triggerLabel=""
                        className="avatar-editor-brush-palette"
                      />
                    </div>
                  ) : null}

                  {brushPanelSec === 'size' ? (
                    <div
                      className="avatar-editor-brush-panel avatar-editor-brush-panel--size"
                      role="tabpanel"
                      aria-label={tr('avatarEditor.brushSecSize')}
                    >
                      <div className="avatar-editor-brush-tips" role="group" aria-label={tr('avatarEditor.brushTip')}>
                        <AvatarEditorTipButton
                          type="button"
                          className={[
                            'avatar-editor-brush-tip',
                            'avatar-editor-brush-tip--solid',
                            brushStroke === 'solid' ? 'is-on' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setBrushStroke('solid');
                            setTool('brush');
                            setBrushStamp(null);
                          }}
                          tipText={tr('avatarEditor.brushTipSolid')}
                          aria-label={tr('avatarEditor.brushTipSolid')}
                          aria-pressed={brushStroke === 'solid'}
                        >
                          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                            <path
                              d="M3.5 16.5c2.2-3.4 4.6-5.2 7.2-5.6 2.8-.4 5.2.7 8.8 4.6"
                              fill="none"
                              stroke="#67e8f9"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                            />
                          </svg>
                        </AvatarEditorTipButton>
                        <AvatarEditorTipButton
                          type="button"
                          className={[
                            'avatar-editor-brush-tip',
                            'avatar-editor-brush-tip--dashed',
                            brushStroke === 'dashed' ? 'is-on' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setBrushStroke('dashed');
                            setTool('brush');
                            setBrushStamp(null);
                          }}
                          tipText={tr('avatarEditor.brushTipDashed')}
                          aria-label={tr('avatarEditor.brushTipDashed')}
                          aria-pressed={brushStroke === 'dashed'}
                        >
                          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden>
                            <path
                              d="M3.5 16.5c2.2-3.4 4.6-5.2 7.2-5.6 2.8-.4 5.2.7 8.8 4.6"
                              fill="none"
                              stroke="#e879f9"
                              strokeWidth="3.2"
                              strokeLinecap="round"
                              strokeDasharray="3.2 4.2"
                            />
                          </svg>
                        </AvatarEditorTipButton>
                      </div>
                      {BRUSH_SIZES.map((s, i) => {
                        const sizeColors = ['#67e8f9', '#a78bfa', '#f472b6'] as const;
                        const c = sizeColors[i % sizeColors.length]!;
                        const dot = BRUSH_SIZE_DOT_PX[i] ?? 12;
                        return (
                          <AvatarEditorTipButton
                            key={s}
                            type="button"
                            className={[
                              'avatar-editor-brush-size',
                              `avatar-editor-brush-size--${i === 0 ? 'sm' : i === 1 ? 'md' : 'lg'}`,
                              tool === 'brush' && !brushStamp && brushSize === s ? 'is-on' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            onClick={() => {
                              setTool('brush');
                              setBrushStamp(null);
                              setBrushSize(s);
                            }}
                            tipText={tr('avatarEditor.brushSize', { n: s })}
                            aria-label={tr('avatarEditor.brushSize', { n: s })}
                            aria-pressed={tool === 'brush' && !brushStamp && brushSize === s}
                          >
                            <span
                              className="avatar-editor-brush-size__dot"
                              style={{
                                width: dot,
                                height: dot,
                                background: c,
                                boxShadow: `0 0 10px ${c}aa, 0 0 4px ${c}`,
                              }}
                              aria-hidden
                            />
                          </AvatarEditorTipButton>
                        );
                      })}
                    </div>
                  ) : null}

                  {brushPanelSec === 'shape' ? (
                    <div
                      className="avatar-editor-brush-panel avatar-editor-brush-panel--shape"
                      role="tabpanel"
                      aria-label={tr('avatarEditor.brushSecShape')}
                    >
                      <AvatarNeonColorPicker
                        color={brushColor}
                        onChange={(c) => {
                          selectBrushColor(c);
                          setBrushNeon(true);
                          if (tool === 'eraser') setTool('brush');
                        }}
                        neonBrush
                        onNeonBrushChange={() => setBrushNeon(true)}
                        hideExternalModeToggle
                        hidePanelModeToggle
                        title={tr('avatarEditor.stampNeonColors')}
                        tipText={tr('avatarEditor.stampNeonColors')}
                        triggerLabel=""
                        className="avatar-editor-stamp-palette"
                      />
                      {(
                        [
                          { id: 'circle' as const, label: tr('avatarEditor.brushShapeCircle'), fill: '#67e8f9' },
                          { id: 'star' as const, label: tr('avatarEditor.brushShapeStar'), fill: '#fbbf24' },
                          { id: 'heart' as const, label: tr('avatarEditor.brushShapeHeart'), fill: '#fb7185' },
                          { id: 'smile' as const, label: tr('avatarEditor.brushShapeSmile'), fill: '#a78bfa' },
                          { id: 'bolt' as const, label: tr('avatarEditor.brushShapeBolt'), fill: '#fde047' },
                        ] as const
                      ).map(({ id, label, fill }) => (
                        <AvatarEditorTipButton
                          key={id}
                          type="button"
                          className={[
                            'avatar-editor-brush-shape',
                            `avatar-editor-brush-shape--${id}`,
                            tool === 'brush' && brushStamp === id ? 'is-on' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setTool('brush');
                            setBrushStamp((cur) => (cur === id ? null : id));
                          }}
                          tipText={label}
                          aria-label={label}
                          aria-pressed={tool === 'brush' && brushStamp === id}
                        >
                          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                            {id === 'circle' ? (
                              <>
                                <circle cx="12" cy="12" r="7.4" fill={fill} opacity="0.95" />
                                <circle cx="12" cy="12" r="3.6" fill="#ecfeff" opacity="0.85" />
                              </>
                            ) : id === 'star' ? (
                              <>
                                <path
                                  d="M12 3.2 14.4 9.1h6.2l-5 3.7 1.9 6-5.5-3.8-5.5 3.8 1.9-6-5-3.7h6.2Z"
                                  fill={fill}
                                />
                                <path
                                  d="M12 7.2 13.1 10.2h3.1l-2.5 1.85.95 3-2.65-1.85-2.65 1.85.95-3-2.5-1.85h3.1Z"
                                  fill="#fff7ed"
                                  opacity="0.8"
                                />
                              </>
                            ) : id === 'heart' ? (
                              <>
                                <path
                                  d="M12 19.2s-7.2-4.4-7.2-9.1A3.9 3.9 0 0 1 12 7.4a3.9 3.9 0 0 1 7.2 2.7c0 4.7-7.2 9.1-7.2 9.1Z"
                                  fill={fill}
                                />
                                <path
                                  d="M12 16.4s-4.2-2.6-4.2-5.3A2.2 2.2 0 0 1 12 9.6a2.2 2.2 0 0 1 4.2 1.5c0 2.7-4.2 5.3-4.2 5.3Z"
                                  fill="#ffe4e6"
                                  opacity="0.75"
                                />
                              </>
                            ) : id === 'smile' ? (
                              <>
                                <circle cx="12" cy="12" r="7.4" fill={fill} />
                                <circle cx="9.1" cy="10.1" r="1.35" fill="#020617" opacity="0.7" />
                                <circle cx="9.1" cy="10.1" r="1.1" fill="#e2e8f0" />
                                <circle cx="9.1" cy="10.1" r="0.7" fill="#1e1b4b" />
                                <circle cx="14.9" cy="10.2" r="1.35" fill="#020617" opacity="0.7" />
                                <circle cx="14.9" cy="10.2" r="1.1" fill="#e2e8f0" />
                                <circle cx="14.9" cy="10.2" r="0.7" fill="#1e1b4b" />
                                <path
                                  d="M8.6 15.5c0.95 1.55 4.7 1.65 5.9-.05"
                                  fill="none"
                                  stroke="#312e81"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                />
                              </>
                            ) : (
                              <>
                                <path
                                  d="M13.2 2.8 8.4 12h3.2L9.6 21.2 17.2 10.8h-3.4Z"
                                  fill={fill}
                                />
                                <path
                                  d="M12.6 6.2 10.2 12h1.9L10.8 17.6 15.2 11.2h-1.9Z"
                                  fill="#fffbeb"
                                  opacity="0.8"
                                />
                              </>
                            )}
                          </svg>
                        </AvatarEditorTipButton>
                      ))}
                    </div>
                  ) : null}

                  {brushPanelSec === 'act' ? (
                    <div
                      className="avatar-editor-brush-panel avatar-editor-brush-panel--act"
                      role="tabpanel"
                      aria-label={tr('avatarEditor.brushSecAct')}
                    >
                      <AvatarEditorTipButton
                        type="button"
                        className={[
                          'avatar-editor-brush-act',
                          'avatar-editor-brush-act--eraser',
                          tool === 'eraser' ? 'is-on' : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                        onClick={() => {
                          setBrushStamp(null);
                          setTool((cur) => (cur === 'eraser' ? 'brush' : 'eraser'));
                        }}
                        tipText={tr('avatarEditor.eraserBrushOnly')}
                        aria-label={tr('avatarEditor.eraser')}
                        aria-pressed={tool === 'eraser'}
                      >
                        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                          <path
                            d="M15.8 4.4 19.6 8.2 10.3 17.5H6.5v-3.8L15.8 4.4Z"
                            fill="#fda4af"
                          />
                          <path d="M5 19.2h14" stroke="#fb7185" strokeWidth="2" strokeLinecap="round" />
                        </svg>
                      </AvatarEditorTipButton>
                      <div className="avatar-editor-brush-act-wrap avatar-editor-brush-act-wrap--fill">
                        <AvatarEditorTipButton
                          type="button"
                          className={[
                            'avatar-editor-brush-act',
                            'avatar-editor-brush-act--fill',
                            tool === 'fill' ? 'is-on' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          onClick={() => {
                            setBrushStamp(null);
                            setTool((cur) => (cur === 'fill' ? 'brush' : 'fill'));
                          }}
                          tipText={tr('avatarEditor.fillTitle')}
                          aria-label={tr('avatarEditor.fill')}
                          aria-pressed={tool === 'fill'}
                          aria-haspopup="listbox"
                          aria-expanded={tool === 'fill'}
                        >
                          <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden>
                            <path
                              d="M6.2 12.2 12 6.4l5.8 5.8-4.2 4.2a2.4 2.4 0 0 1-3.4 0l-4-4.2Z"
                              fill="#67e8f9"
                            />
                            <path
                              d="M16.8 15.6c1.4 0 2.5 1.3 2.5 2.6 0 1.6-2.5 3.4-2.5 3.4s-2.5-1.8-2.5-3.4c0-1.3 1.1-2.6 2.5-2.6Z"
                              fill="#22d3ee"
                            />
                          </svg>
                        </AvatarEditorTipButton>
                        {tool === 'fill' ? (
                          <div
                            className="avatar-editor-initials-colors avatar-editor-fill-colors"
                            role="listbox"
                            aria-label={tr('avatarEditor.brushSecColor')}
                          >
                            {AVATAR_INITIALS_COLORS.map((c) => (
                              <AvatarEditorTipButton
                                key={c}
                                type="button"
                                role="option"
                                aria-selected={brushColor === c}
                                className={[
                                  'avatar-editor-initials-colors__swatch',
                                  brushColor === c ? 'avatar-editor-initials-colors__swatch--active' : '',
                                ]
                                  .filter(Boolean)
                                  .join(' ')}
                                style={{ background: c }}
                                aria-label={tr('avatarEditor.colorOf', { c })}
                                tipText={tr('avatarEditor.colorOf', { c })}
                                onClick={() => selectBrushColor(c)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {foldSection === 'frames' ? (
                <AvatarPresetRail
                  className="avatar-editor-tools-fold__chips avatar-editor-preset-rail--chips"
                  enabled
                  activeId={activeFrameId}
                  itemIds={AVATAR_EDITOR_FRAMES.map((f) => f.id)}
                  onSelectId={(id) => applyFrame(id as AvatarFrameId)}
                  aria-label={tr('avatarEditor.foldFrames')}
                >
                  {AVATAR_EDITOR_FRAMES.map((f) => (
                    <AvatarEditorTipButton
                      key={f.id}
                      type="button"
                      data-preset-id={f.id}
                      role="listitem"
                      className={[
                        'avatar-editor-frame-btn',
                        activeFrameId === f.id ? 'avatar-editor-frame-btn--active' : '',
                      ].join(' ')}
                      onClick={() => applyFrame(f.id)}
                      tipText={frameLabel(f.id, tr)}
                      aria-pressed={activeFrameId === f.id}
                    >
                      <img src={f.src} alt="" className="avatar-editor-frame-btn__img" />
                    </AvatarEditorTipButton>
                  ))}
                </AvatarPresetRail>
              ) : null}

              {foldSection === 'stickers' ? (
                <div
                  className="avatar-editor-stickers-grid"
                  role="group"
                  aria-label={tr('avatarEditor.foldStickers')}
                >
                  <div className="avatar-editor-stickers-grid__row">
                    <AvatarNeonColorPicker
                      color={stickerColor}
                      onChange={(c) => {
                        setStickerColor(c);
                        setTool('sticker');
                      }}
                      neonBrush
                      onNeonBrushChange={() => {}}
                      hideExternalModeToggle
                      hidePanelModeToggle
                      title={tr('avatarEditor.stickerColors')}
                      tipText={tr('avatarEditor.stickerColors')}
                      triggerLabel=""
                      className="avatar-editor-sticker-palette"
                    />
                    {AVATAR_EDITOR_STICKERS.slice(0, 4).map((s) => {
                      const locked = Boolean(s.premium && !premiumJokerOk);
                      const glyphColor =
                        tool === 'sticker' && stickerId === s.id
                          ? stickerColor
                          : STICKER_GLYPH_COLORS[s.id];
                      const iconGlyph = s.id === 'joker' || s.id === 'updown' || s.id === 'clover';
                      return (
                        <AvatarStickerBtn
                          key={s.id}
                          stickerId={s.id}
                          className={[
                            'avatar-editor-sticker-btn',
                            s.premium ? 'avatar-editor-sticker-btn--premium' : '',
                            s.id === 'updown' ? 'avatar-editor-sticker-btn--brand' : '',
                            s.id === 'clover' ? 'avatar-editor-sticker-btn--clover' : '',
                            locked ? 'avatar-editor-sticker-btn--locked' : '',
                            tool === 'sticker' && stickerId === s.id
                              ? 'avatar-editor-sticker-btn--active'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          glyph={<StickerBtnGlyph id={s.id} glyph={s.glyph} />}
                          glyphStyle={
                            iconGlyph
                              ? undefined
                              : {
                                  color: glyphColor,
                                  textShadow: `0 0 8px ${glyphColor}aa, 0 0 2px ${glyphColor}`,
                                }
                          }
                          premiumBadge={Boolean(s.premium)}
                          tipText={stickerLabel(s.id, tr)}
                          tipDetail={
                            locked
                              ? tr('avatarEditor.stickerJokerLocked')
                              : s.premium
                                ? tr('avatarEditor.stickerPremium')
                                : undefined
                          }
                          active={tool === 'sticker' && stickerId === s.id}
                          locked={locked}
                          onLocked={() => setStickerPremiumTip(true)}
                          onSelect={() => {
                            setStickerPremiumTip(false);
                            setTool('sticker');
                            setStickerId(s.id);
                          }}
                        />
                      );
                    })}
                  </div>
                  <div className="avatar-editor-stickers-grid__row">
                    {AVATAR_EDITOR_STICKERS.slice(4).map((s) => {
                      const locked = Boolean(s.premium && !premiumJokerOk);
                      const glyphColor =
                        tool === 'sticker' && stickerId === s.id
                          ? stickerColor
                          : STICKER_GLYPH_COLORS[s.id];
                      const iconGlyph = s.id === 'joker' || s.id === 'updown' || s.id === 'clover';
                      return (
                        <AvatarStickerBtn
                          key={s.id}
                          stickerId={s.id}
                          className={[
                            'avatar-editor-sticker-btn',
                            s.premium ? 'avatar-editor-sticker-btn--premium' : '',
                            s.id === 'updown' ? 'avatar-editor-sticker-btn--brand' : '',
                            s.id === 'clover' ? 'avatar-editor-sticker-btn--clover' : '',
                            locked ? 'avatar-editor-sticker-btn--locked' : '',
                            tool === 'sticker' && stickerId === s.id
                              ? 'avatar-editor-sticker-btn--active'
                              : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                          glyph={<StickerBtnGlyph id={s.id} glyph={s.glyph} />}
                          glyphStyle={
                            iconGlyph
                              ? undefined
                              : {
                                  color: glyphColor,
                                  textShadow: `0 0 8px ${glyphColor}aa, 0 0 2px ${glyphColor}`,
                                }
                          }
                          premiumBadge={Boolean(s.premium)}
                          tipText={stickerLabel(s.id, tr)}
                          tipDetail={
                            locked
                              ? tr('avatarEditor.stickerJokerLocked')
                              : s.premium
                                ? tr('avatarEditor.stickerPremium')
                                : undefined
                          }
                          active={tool === 'sticker' && stickerId === s.id}
                          locked={locked}
                          onLocked={() => setStickerPremiumTip(true)}
                          onSelect={() => {
                            setStickerPremiumTip(false);
                            setTool('sticker');
                            setStickerId(s.id);
                          }}
                        />
                      );
                    })}
                  </div>
                  {stickerPremiumTip ? (
                    <p className="avatar-editor-stickers-grid__premium-tip" role="status">
                      {tr('avatarEditor.stickerJokerLocked')}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <div className="avatar-editor-left-actions">
            <AvatarEditorTipButton
              type="button"
              className="avatar-editor-modal-btn avatar-editor-left-cancel"
              onClick={leaveEditor}
              disabled={saving}
              tipText={tr('common.cancel')}
            >
              <span className="avatar-editor-left-cancel__label">{tr('common.cancel')}</span>
            </AvatarEditorTipButton>
            <AvatarEditorTipButton
              type="button"
              className={[
                'avatar-editor-modal-btn',
                'avatar-editor-left-save',
                isDirty ? 'avatar-editor-left-save--dirty' : '',
                savedAck && !isDirty ? 'avatar-editor-left-save--saved' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => void handleSave()}
              disabled={saving}
              tipText={
                isDirty
                  ? tr('avatarEditor.unsavedChanges')
                  : savedAck
                    ? tr('avatarEditor.saved')
                    : tr('common.save')
              }
              aria-label={
                isDirty
                  ? tr('avatarEditor.unsavedChanges')
                  : savedAck
                    ? tr('avatarEditor.saved')
                    : tr('common.save')
              }
            >
              {isDirty ? <span className="avatar-editor-left-save__dirty-dot" aria-hidden /> : null}
              <span className="avatar-editor-left-save__label">
                {saving ? '…' : savedAck && !isDirty ? tr('avatarEditor.saved') : tr('common.save')}
              </span>
            </AvatarEditorTipButton>
            <AvatarEditorTipButton
              type="button"
              className="avatar-editor-modal-btn avatar-editor-left-done"
              onClick={() => void handleDone()}
              disabled={saving}
              tipText={tr('avatarEditor.doneTitle')}
              aria-label={tr('avatarEditor.done')}
            >
              <span className="avatar-editor-left-done__stack">
                <span className="avatar-editor-left-done__label">{tr('avatarEditor.doneApply')}</span>
                <span className="avatar-editor-left-done__label avatar-editor-left-done__label--sub">
                  {tr('avatarEditor.doneClose')}
                </span>
              </span>
            </AvatarEditorTipButton>
          </div>
        </div>
        </div>

        <div className="avatar-editor-modal-body">
          <div
            className={[
              'avatar-editor-atelier',
              stageOpen ? 'avatar-editor-atelier--stage' : 'avatar-editor-atelier--hub',
              foldSection === 'styles' || foldSection === 'bg' ? 'avatar-editor-atelier--round-photo' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            {stageOpen ? (
                <div
                  className={[
                    'avatar-editor-stage',
                    foldSection === 'photo' ? 'avatar-editor-stage--photo' : '',
                    foldSection === 'styles' ? 'avatar-editor-stage--styles' : '',
                    foldSection === 'bg' ? 'avatar-editor-stage--bg' : '',
                    'avatar-editor-stage--docked',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  role="region"
                  aria-label={sectionLabel(foldSection, tr)}
                >
                  <AvatarEditorTipButton
                    type="button"
                    className={[
                      'avatar-editor-hub__tile',
                      `avatar-editor-hub__tile--${foldSection}`,
                      'avatar-editor-hub__tile--active',
                      'avatar-editor-stage__dock-tab',
                    ].join(' ')}
                    onClick={() => setFoldSection(null)}
                    tipText={tr('avatarEditor.sectionCollapseHint')}
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
                  </AvatarEditorTipButton>

                  {foldSection === 'photo' ? (
                    <div className="avatar-editor-photo-panel">
                      <h3 className="avatar-editor-photo-panel__title">{tr('avatarEditor.foldPhoto')}</h3>
                      <div
                        className="avatar-editor-photo-deck avatar-editor-photo-deck--stage"
                        role="group"
                        aria-label={tr('avatarEditor.foldPhoto')}
                      >
                      <AvatarEditorTipButton
                        type="button"
                        className="avatar-editor-photo-action avatar-editor-photo-action--cam"
                        disabled={selfieBusy || saving || inPageCameraOpen}
                        onClick={() => void handleSelfie()}
                        tipText={tr('avatarEditor.photoTake')}
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
                      </AvatarEditorTipButton>
                      <AvatarEditorTipButton
                        type="button"
                        className="avatar-editor-photo-action avatar-editor-photo-action--gal"
                        disabled={saving || inPageCameraOpen}
                        onClick={() => openGalleryPicker(galleryInputRef.current)}
                        tipText={tr('avatarEditor.photoPick')}
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
                      </AvatarEditorTipButton>
                      {sourcePhotoDataUrl ? (
                        <AvatarEditorTipButton
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
                          tipText={tr('avatarEditor.restorePhoto')}
                          aria-label={tr('avatarEditor.restorePhoto')}
                        >
                          <img src={sourcePhotoDataUrl} alt="" className="avatar-editor-photo-live__img" />
                        </AvatarEditorTipButton>
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
                            initialsSource="capitals"
                            initialsStyle="off"
                            displayName={displayName}
                            active={baseMode !== 'photo' && templateId === tpl.id}
                            tipText={templateAriaLabel(tpl.id, tr)}
                            ariaLabel={templateAriaLabel(tpl.id, tr)}
                            onClick={() => startTransition(() => selectBackground(tpl.id))}
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
                        initialsStyle === 'off' &&
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
                          initialsSource="capitals"
                          initialsStyle="off"
                          displayName={displayName}
                          active={templateId === tpl.id && initialsStyle === 'off' && baseMode !== 'photo'}
                          tipText={templateAriaLabel(tpl.id, tr)}
                          ariaLabel={templateAriaLabel(tpl.id, tr)}
                          onClick={() => startTransition(() => selectStylePreset(tpl.id))}
                        />
                      ))}
                    </AvatarPresetRail>
                    </>
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
                  <AvatarEditorTipButton
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
                        startTransition(() => setFoldSection(null));
                        return;
                      }
                      startTransition(() => {
                        setFoldSection((cur) => (cur === id ? null : id));
                      });
                    }}
                    aria-label={sectionLabel(id, tr)}
                    tipText={
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
                  </AvatarEditorTipButton>
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
