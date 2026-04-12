/**
 * Выбор уровня одного бота офлайн по клику на имя (портал, как мобильный попап ИИ).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AIDifficulty } from '../game/GameEngine';
import { OfflineAiDifficultyOptionList } from './OfflineAiDifficultyOptionList';

type Props = {
  open: boolean;
  anchorEl: HTMLElement | null;
  playerName: string;
  current: AIDifficulty;
  onSelect: (level: AIDifficulty) => void;
  onClose: () => void;
};

export function OfflineAiDifficultyPopover({ open, anchorEl, playerName, current, onSelect, onClose }: Props) {
  const layerRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const updatePos = useCallback(() => {
    if (!open || !anchorEl) return;
    const r = anchorEl.getBoundingClientRect();
    const estW = Math.min(300, window.innerWidth - 16);
    let left = r.left;
    left = Math.min(left, window.innerWidth - estW - 8);
    left = Math.max(8, left);
    setPos({ top: r.bottom + 6, left });
  }, [open, anchorEl]);

  useLayoutEffect(() => {
    updatePos();
  }, [updatePos]);

  useEffect(() => {
    if (!open) return;
    const onRelayout = () => updatePos();
    window.addEventListener('resize', onRelayout);
    window.addEventListener('scroll', onRelayout, true);
    return () => {
      window.removeEventListener('resize', onRelayout);
      window.removeEventListener('scroll', onRelayout, true);
    };
  }, [open, updatePos]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (layerRef.current?.contains(t)) return;
      if (anchorEl?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorEl]);

  if (!open || !anchorEl) return null;

  return createPortal(
    <div
      ref={layerRef}
      className="ai-difficulty-popover offline-ai-difficulty-popover ai-difficulty-popover-layer"
      style={{
        position: 'fixed',
        top: pos.top,
        left: pos.left,
        zIndex: 240,
        boxSizing: 'border-box',
        minWidth: Math.min(288, window.innerWidth - 16),
        maxWidth: 'min(92vw, 300px)',
      }}
      role="dialog"
      aria-label={`Уровень сложности: ${playerName}`}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="ai-difficulty-popover-head">
        <div className="ai-difficulty-popover-title">Бот: {playerName}</div>
        <button
          type="button"
          className="ai-difficulty-popover-dismiss"
          aria-label="Закрыть"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
        >
          ×
        </button>
      </div>
      <OfflineAiDifficultyOptionList current={current} onSelect={onSelect} />
    </div>,
    document.body
  );
}
