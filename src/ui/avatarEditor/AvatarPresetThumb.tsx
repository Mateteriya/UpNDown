/**
 * Круглое превью шаблона / режима инициалов.
 * Hover/active: ободок с переливом + аккуратные искры + лёгкий подъём кнопки.
 */

import { memo, useEffect, useId, useRef, useState } from 'react';
import {
  AVATAR_INITIALS_COLORS,
  paintAvatarEditorBase,
  paintAvatarInitialsGlyphPreview,
  type AvatarEditorTemplateId,
  type AvatarInitialsSource,
  type AvatarInitialsStyle,
} from '../../lib/avatarEditorTemplates';
import { MenuCapsuleCosmicTip } from '../MenuCapsuleCosmicTip';

const PREVIEW_SIZE = 72;

export interface AvatarPresetThumbProps {
  templateId: AvatarEditorTemplateId;
  initialsSource?: AvatarInitialsSource;
  initialsStyle?: AvatarInitialsStyle;
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
  /** source = превью состава; style = превью расположения. */
  glyphPreviewKind?: 'source' | 'style';
  /** Фирменный космический тултип (заголовок). */
  tipText?: string;
  /** Пояснение под заголовком. */
  tipDetail?: string;
  /** Значок премиум (как у стикеров). */
  premiumBadge?: boolean;
}

export const AvatarPresetThumb = memo(function AvatarPresetThumb({
  templateId,
  initialsSource = 'capitals',
  initialsStyle = 'off',
  displayName,
  initialsColor = AVATAR_INITIALS_COLORS[0],
  active,
  ariaLabel,
  onClick,
  className,
  presetId,
  glyphPreview = false,
  glyphPreviewKind = 'style',
  tipText,
  tipDetail,
  premiumBadge = false,
}: AvatarPresetThumbProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const hasTip = Boolean(tipText);
  const showTimerRef = useRef<number | null>(null);
  const TIP_SHOW_DELAY_MS = 380;

  const clearShowTimer = () => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const scheduleShow = () => {
    if (!hasTip) return;
    clearShowTimer();
    showTimerRef.current = window.setTimeout(() => {
      showTimerRef.current = null;
      setTipOpen(true);
    }, TIP_SHOW_DELAY_MS);
  };

  const hideTip = () => {
    clearShowTimer();
    setTipOpen(false);
  };

  useEffect(() => () => clearShowTimer(), []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PREVIEW_SIZE;
    canvas.height = PREVIEW_SIZE;
    if (glyphPreview) {
      paintAvatarInitialsGlyphPreview(
        ctx,
        PREVIEW_SIZE,
        displayName,
        initialsSource,
        initialsStyle,
        initialsColor,
        { previewKind: glyphPreviewKind },
      );
    } else {
      paintAvatarEditorBase(
        ctx,
        PREVIEW_SIZE,
        templateId,
        displayName,
        initialsSource,
        initialsStyle,
        initialsColor,
      );
    }
  }, [
    templateId,
    initialsSource,
    initialsStyle,
    displayName,
    initialsColor,
    glyphPreview,
    glyphPreviewKind,
  ]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        data-preset-id={presetId ?? templateId}
        className={[
          'avatar-editor-preset-thumb',
          active ? 'avatar-editor-preset-thumb--active' : '',
          initialsStyle === 'badge' ? 'avatar-editor-preset-thumb--badge' : '',
          className,
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={onClick}
        aria-label={ariaLabel}
        aria-pressed={active}
        aria-describedby={hasTip && tipOpen ? tipId : undefined}
        title={hasTip ? undefined : ariaLabel}
        onPointerEnter={scheduleShow}
        onPointerLeave={hideTip}
        onFocus={scheduleShow}
        onBlur={hideTip}
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
        {premiumBadge ? (
          <span className="avatar-editor-preset-thumb__premium" aria-hidden>
            ✦
          </span>
        ) : null}
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
});
