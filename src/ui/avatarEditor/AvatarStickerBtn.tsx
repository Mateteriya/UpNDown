/**
 * Кнопка стикера в редакторе аватарки + фирменный космический тултип.
 */

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { AvatarStickerId } from '../../lib/avatarEditorStickers';
import { MenuCapsuleCosmicTip } from '../MenuCapsuleCosmicTip';

const TIP_SHOW_DELAY_MS = 380;

export function AvatarStickerBtn({
  stickerId,
  className,
  glyph,
  glyphStyle,
  premiumBadge,
  tipText,
  tipDetail,
  active,
  locked,
  onSelect,
  onLocked,
}: {
  stickerId: AvatarStickerId;
  className: string;
  glyph: ReactNode;
  glyphStyle?: CSSProperties;
  premiumBadge?: boolean;
  tipText: string;
  tipDetail?: string;
  active: boolean;
  locked: boolean;
  onSelect: () => void;
  onLocked?: () => void;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const showTimerRef = useRef<number | null>(null);
  const glyphClass =
    stickerId === 'joker' || stickerId === 'updown' || stickerId === 'clover'
      ? `avatar-editor-sticker-btn__glyph avatar-editor-sticker-btn__glyph--${stickerId}`
      : 'avatar-editor-sticker-btn__glyph';

  const clearShowTimer = () => {
    if (showTimerRef.current != null) {
      window.clearTimeout(showTimerRef.current);
      showTimerRef.current = null;
    }
  };

  const scheduleShow = () => {
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

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={className}
        onClick={() => {
          if (locked) {
            onLocked?.();
            return;
          }
          onSelect();
        }}
        aria-label={tipDetail ? `${tipText}. ${tipDetail}` : tipText}
        aria-pressed={active}
        aria-describedby={tipOpen ? tipId : undefined}
        onPointerEnter={scheduleShow}
        onPointerLeave={hideTip}
        onFocus={scheduleShow}
        onBlur={hideTip}
      >
        <span className={glyphClass} style={glyphStyle} aria-hidden>
          {glyph}
        </span>
        {premiumBadge ? (
          <span className="avatar-editor-sticker-btn__premium" aria-hidden>
            ✦
          </span>
        ) : null}
      </button>
      <MenuCapsuleCosmicTip
        open={tipOpen}
        anchorRef={btnRef}
        tipId={tipId}
        text={tipText}
        detail={tipDetail}
        preferBelow
        className="avatar-editor-glyph-tip"
      />
    </>
  );
}
