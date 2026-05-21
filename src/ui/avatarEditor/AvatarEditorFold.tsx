/**
 * Сворачиваемая секция редактора (анимация grid, aria-expanded).
 */

import { useId, useState, type ReactNode } from 'react';

export interface AvatarEditorFoldProps {
  label: string;
  preview?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  children: ReactNode;
}

export function AvatarEditorFold({
  label,
  preview,
  defaultOpen = false,
  className,
  children,
}: AvatarEditorFoldProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();

  return (
    <div className={['avatar-editor-fold', open ? 'avatar-editor-fold--open' : '', className].filter(Boolean).join(' ')}>
      <button
        type="button"
        className="avatar-editor-fold__head"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="avatar-editor-fold__label">{label}</span>
        {!open && preview ? <span className="avatar-editor-fold__preview">{preview}</span> : null}
        <span className="avatar-editor-fold__chev" aria-hidden />
      </button>
      <div id={panelId} className="avatar-editor-fold__body" aria-hidden={!open}>
        <div className="avatar-editor-fold__inner">{children}</div>
      </div>
    </div>
  );
}
