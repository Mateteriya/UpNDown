/**
 * Круглое превью шаблона / режима инициалов.
 * Hover/active: ободок с переливом + аккуратные искры + лёгкий подъём кнопки.
 */

import { useEffect, useId, useRef, useState } from 'react';
import {
  AVATAR_INITIALS_COLORS,
  paintAvatarEditorBase,
  paintAvatarInitialsGlyphPreview,
  type AvatarEditorTemplateId,
  type AvatarInitialsMode,
} from '../../lib/avatarEditorTemplates';
import { MenuCapsuleCosmicTip } from '../MenuCapsuleCosmicTip';

const PREVIEW_SIZE = 72;

export interface AvatarPresetThumbProps {
  templateId: AvatarEditorTemplateId;
  initialsMode: AvatarInitialsMode;
  displayName: string;
  /** Цвет инициалов на превью (панель Aa). */
  initialsColor?: string;
  active?: boolean;
  ariaLabel: string;
  onClick: () => void;
  className?: string;
  /** Для AvatarPresetRail + стрелок. */
  presetId?: string;
  /** Превью режима инициалов (контрастные буквы на «дорогом» фоне). */
  glyphPreview?: boolean;
  /** Фирменный космический тултип (заголовок). */
  tipText?: string;
  /** Пояснение под заголовком. */
  tipDetail?: string;
}

export function AvatarPresetThumb({
  templateId,
  initialsMode,
  displayName,
  initialsColor = AVATAR_INITIALS_COLORS[0],
  active,
  ariaLabel,
  onClick,
  className,
  presetId,
  glyphPreview = false,
  tipText,
  tipDetail,
}: AvatarPresetThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const hasTip = Boolean(tipText);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    if (glyphPreview) {
      paintAvatarInitialsGlyphPreview(ctx, PREVIEW_SIZE, displayName, initialsMode, initialsColor);
    } else {
      paintAvatarEditorBase(ctx, PREVIEW_SIZE, templateId, displayName, initialsMode, initialsColor);
    }
  }, [templateId, initialsMode, displayName, initialsColor, glyphPreview]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-preset-id={presetId ?? templateId}
        className={[
          'avatar-editor-preset-thumb',
          active ? 'avatar-editor-preset-thumb--active' : '',
          initialsMode === 'badge' ? 'avatar-editor-preset-thumb--badge' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        aria-describedby={hasTip && tipOpen ? tipId : undefined}
        title={hasTip ? undefined : ariaLabel}
        onPointerEnter={() => {
          if (hasTip) setTipOpen(true);
        }}
        onPointerLeave={() => setTipOpen(false)}
        onFocus={() => {
          if (hasTip) setTipOpen(true);
        }}
        onBlur={() => setTipOpen(false)}
      >
        <span className="avatar-editor-preset-thumb__rim" aria-hidden>
          <span className="avatar-editor-preset-thumb__rim-spin" />
        </span>
        <canvas
          ref={canvasRef}
          className="avatar-editor-preset-thumb__canvas"
          width={PREVIEW_SIZE}
          height={PREVIEW_SIZE}
          aria-hidden
        />
      </button>
      {hasTip ? (
        <MenuCapsuleCosmicTip
          open={tipOpen}
          anchorRef={btnRef}
          tipId={tipId}
          text={tipText}
          detail={tipDetail}
          preferBelow
          className="avatar-editor-glyph-tip"
        />
      ) : null}
    </>
  );
}
