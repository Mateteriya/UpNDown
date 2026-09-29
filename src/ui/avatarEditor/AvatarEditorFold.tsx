/**
 * Сворачиваемая секция редактора (иконка + шеврон, минимум текста).
 */

import { useId, useState, type ReactNode } from 'react';

export interface AvatarEditorFoldProps {
  /** Для a11y; на экране можно скрыть через iconOnly. */
  label: string;
  icon?: ReactNode;
  /** Только иконка в шапке (label уходит в aria-label). */
  iconOnly?: boolean;
  hint?: string;
  preview?: ReactNode;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function AvatarEditorFold({
  label,
  icon,
  iconOnly = false,
  hint,
  preview,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  className,
  children,
}: AvatarEditorFoldProps) {
  const [openUncontrolled, setOpenUncontrolled] = useState(defaultOpen);
  const open = openProp ?? openUncontrolled;
  const panelId = useId();

  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenUncontrolled(next);
    onOpenChange?.(next);
  };

  return (
    <div className={['avatar-editor-fold', open ? 'avatar-editor-fold--open' : '', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className={['avatar-editor-fold__head', iconOnly ? 'avatar-editor-fold__head--icon' : ''].filter(Boolean).join(' ')}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={label}
        onClick={() => setOpen(!open)}
      >
        {icon ? <span className="avatar-editor-fold__icon" aria-hidden>{icon}</span> : null}
        {!iconOnly ? (
          <span className="avatar-editor-fold__titles">
            <span className="avatar-editor-fold__label">{label}</span>
            {hint ? <span className="avatar-editor-fold__hint">{hint}</span> : null}
          </span>
        ) : null}
        {!open && preview ? <span className="avatar-editor-fold__preview">{preview}</span> : null}
        <span className="avatar-editor-fold__chev" aria-hidden />
      </button>
      <div id={panelId} className="avatar-editor-fold__body" aria-hidden={!open}>
        <div className="avatar-editor-fold__inner">{children}</div>
      </div>
    </div>
  );
}
