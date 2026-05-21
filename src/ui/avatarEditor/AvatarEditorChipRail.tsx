/**
 * Одна строка чипов с кнопкой «+N» / «Свернуть» для переполнения.
 */

import { Children, useState, type ReactNode } from 'react';

export interface AvatarEditorChipRailProps {
  /** Сколько элементов видно в свёрнутом виде */
  collapsedVisible?: number;
  className?: string;
  children: ReactNode;
}

export function AvatarEditorChipRail({ collapsedVisible = 6, className, children }: AvatarEditorChipRailProps) {
  const [expanded, setExpanded] = useState(false);
  const items = Children.toArray(children).filter(Boolean);
  const overflow = items.length > collapsedVisible;
  const visible = expanded || !overflow ? items : items.slice(0, collapsedVisible);
  const hiddenCount = items.length - collapsedVisible;

  return (
    <div className={['avatar-editor-chip-rail', expanded ? 'avatar-editor-chip-rail--expanded' : '', className].filter(Boolean).join(' ')}>
      <div className="avatar-editor-chip-rail__track">{visible}</div>
      {overflow ? (
        <button
          type="button"
          className="avatar-editor-chip-rail__toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? 'Свернуть' : `+${hiddenCount}`}
        </button>
      ) : null}
    </div>
  );
}
