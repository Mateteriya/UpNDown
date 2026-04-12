/**
 * Выбор уровня сложности офлайн/бот ИИ (localStorage через aiSettings).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AIDifficulty } from '../game/GameEngine';
import { getAiDifficulty, setAiDifficulty } from '../game/aiSettings';

const LEVELS: {
  id: AIDifficulty;
  title: string;
  hint: string;
  ballClass: string;
}[] = [
  {
    id: 'novice',
    title: 'Новичок',
    hint: 'Всегда слабейшая легальная карта',
    ballClass: 'ai-difficulty-ball--novice',
  },
  {
    id: 'amateur',
    title: 'Любитель',
    hint: 'Заказ и взятки, перебор — добирать очки',
    ballClass: 'ai-difficulty-ball--amateur',
  },
  {
    id: 'expert',
    title: 'Эксперт',
    hint: 'Как любитель + темп: не тратить топ на заходе впустую',
    ballClass: 'ai-difficulty-ball--expert',
  },
];

function triggerBallClass(id: AIDifficulty): string {
  return `ai-difficulty-trigger-ball--${id}`;
}

export type AiDifficultyControlLayout = 'mobile' | 'pc';

export function AiDifficultyControl({
  layout,
  offlineApplyDifficultyToAllBots,
}: {
  layout: AiDifficultyControlLayout;
  /** Офлайн: выбор в шапке — один уровень для всех ботов и для новых партий (ai1–ai3 в storage) */
  offlineApplyDifficultyToAllBots?: (level: AIDifficulty) => void;
}) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<AIDifficulty>(() => getAiDifficulty());
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const isMobile = layout === 'mobile';

  const updatePopoverPosition = useCallback(() => {
    if (!isMobile || !open) return;
    const btn = buttonRef.current;
    if (!btn) return;
    const r = btn.getBoundingClientRect();
    const vw = window.innerWidth;
    const margin = 8;
    const estW = Math.min(268, vw * 0.88);
    let left = r.left;
    left = Math.min(left, vw - estW - margin);
    left = Math.max(margin, left);
    setPopoverPos({ top: r.bottom + 6, left });
  }, [isMobile, open]);

  useLayoutEffect(() => {
    updatePopoverPosition();
  }, [updatePopoverPosition]);

  useEffect(() => {
    if (!open || !isMobile) return;
    updatePopoverPosition();
    const onRelayout = () => updatePopoverPosition();
    window.addEventListener('resize', onRelayout);
    window.addEventListener('scroll', onRelayout, true);
    return () => {
      window.removeEventListener('resize', onRelayout);
      window.removeEventListener('scroll', onRelayout, true);
    };
  }, [open, isMobile, updatePopoverPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t)) return;
      if (popoverRef.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('pointerdown', onDoc, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, close]);

  const select = (id: AIDifficulty) => {
    setAiDifficulty(id);
    offlineApplyDifficultyToAllBots?.(id);
    setLevel(id);
    setOpen(false);
  };

  const triggerBallExtra = triggerBallClass(level);

  const popoverInner = (
    <>
      <div className="ai-difficulty-popover-head">
        <div className="ai-difficulty-popover-title">Боты за столом</div>
        <button
          type="button"
          className="ai-difficulty-popover-dismiss"
          aria-label="Закрыть"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          ×
        </button>
      </div>
      <div className="ai-difficulty-popover-list" role="radiogroup" aria-label="Уровень сложности">
        {LEVELS.map((row) => {
          const selected = level === row.id;
          return (
            <button
              key={row.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={['ai-difficulty-option', selected ? 'ai-difficulty-option--selected' : ''].join(' ')}
              onClick={() => select(row.id)}
            >
              <span className="ai-difficulty-option-ball-wrap" aria-hidden>
                <span className={['ai-difficulty-ball', row.ballClass, selected ? 'ai-difficulty-ball--checked' : ''].join(' ')}>
                  {selected ? <span className="ai-difficulty-ball-check">✓</span> : null}
                </span>
              </span>
              <span className="ai-difficulty-option-text">
                <span className="ai-difficulty-option-title">{row.title}</span>
                <span className="ai-difficulty-option-hint">{row.hint}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  const popover =
    open &&
    (isMobile ? (
      createPortal(
        <div
          ref={popoverRef}
          className="ai-difficulty-popover ai-difficulty-popover--portal-mobile ai-difficulty-popover-layer"
          style={{ top: popoverPos.top, left: popoverPos.left }}
          role="dialog"
          aria-label="Уровень сложности ИИ"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {popoverInner}
        </div>,
        document.body
      )
    ) : (
      <div
        ref={popoverRef}
        className="ai-difficulty-popover"
        role="dialog"
        aria-label="Уровень сложности ИИ"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {popoverInner}
      </div>
    ));

  return (
    <div
      ref={rootRef}
      className={['ai-difficulty-root', isMobile ? 'ai-difficulty-root--mobile' : 'ai-difficulty-root--pc'].join(' ')}
    >
      <button
        ref={buttonRef}
        type="button"
        className={[
          'header-ai-difficulty-btn',
          isMobile ? 'header-nav-compact-btn' : 'header-ai-difficulty-btn--pc',
        ].join(' ')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title="Сложность ИИ"
        aria-label="Сложность ИИ ботов"
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={['ai-difficulty-trigger-ball', triggerBallExtra].join(' ')} aria-hidden />
        <span className="ai-difficulty-trigger-label">ИИ</span>
      </button>
      {popover}
    </div>
  );
}

/** Иконка «выйти из комнаты» — компактная квадратная кнопка как домик и ↻ */
export function HeaderRoomExitIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16 17 21 12 16 7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
