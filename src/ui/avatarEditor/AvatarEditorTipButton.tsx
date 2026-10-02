/**
 * Кнопка редактора аватарки с фирменным космическим тултипом (вместо native title).
 * Показ с задержкой — меньше мелькания и залипаний (desktop hover / mobile long-press feel).
 */

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
  type Ref,
} from 'react';
import { MenuCapsuleCosmicTip } from '../MenuCapsuleCosmicTip';

const TIP_SHOW_DELAY_MS = 380;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) return;
  if (typeof ref === 'function') ref(value);
  else (ref as { current: T | null }).current = value;
}

export const AvatarEditorTipButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    tipText: string;
    tipDetail?: string;
    tipWide?: boolean;
    tipPreferBelow?: boolean;
    tipClassName?: string;
    children?: ReactNode;
  }
>(function AvatarEditorTipButton(
  {
    tipText,
    tipDetail,
    tipWide = false,
    tipPreferBelow = true,
    tipClassName = 'avatar-editor-glyph-tip',
    children,
    onPointerEnter,
    onPointerLeave,
    onFocus,
    onBlur,
    ...rest
  },
  ref,
) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const tipId = useId();
  const showTimerRef = useRef<number | null>(null);

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
        {...rest}
        ref={(el) => {
          btnRef.current = el;
          assignRef(ref, el);
        }}
        title={undefined}
        aria-describedby={tipOpen ? tipId : undefined}
        onPointerEnter={(e) => {
          scheduleShow();
          onPointerEnter?.(e);
        }}
        onPointerLeave={(e) => {
          hideTip();
          onPointerLeave?.(e);
        }}
        onFocus={(e) => {
          scheduleShow();
          onFocus?.(e);
        }}
        onBlur={(e) => {
          hideTip();
          onBlur?.(e);
        }}
      >
        {children}
      </button>
      <MenuCapsuleCosmicTip
        open={tipOpen}
        anchorRef={btnRef}
        tipId={tipId}
        text={tipText}
        detail={tipDetail}
        wide={tipWide}
        preferBelow={tipPreferBelow}
        className={tipClassName}
      />
    </>
  );
});
