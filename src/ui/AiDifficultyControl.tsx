/**
 * Выбор уровня сложности офлайн/бот ИИ (localStorage через aiSettings).
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { getAiDifficulty, setAiDifficulty } from '../game/aiSettings';
import { useT } from '../i18n';
import type { AIDifficulty } from '../game/GameEngine';

const LEVEL_META: {
  id: AIDifficulty;
  titleKey: 'ai.novice' | 'ai.amateur' | 'ai.expert';
  hintKey: 'ai.noviceHint' | 'ai.amateurHint' | 'ai.expertHint';
  ballClass: string;
}[] = [
  {
    id: 'novice',
    titleKey: 'ai.novice',
    hintKey: 'ai.noviceHint',
    ballClass: 'ai-difficulty-ball--novice',
  },
  {
    id: 'amateur',
    titleKey: 'ai.amateur',
    hintKey: 'ai.amateurHint',
    ballClass: 'ai-difficulty-ball--amateur',
  },
  {
    id: 'expert',
    titleKey: 'ai.expert',
    hintKey: 'ai.expertHint',
    ballClass: 'ai-difficulty-ball--expert',
  },
];

function triggerBallClass(id: AIDifficulty): string {
  return `ai-difficulty-trigger-ball--${id}`;
}

export type AiDifficultyControlLayout = 'mobile' | 'pc';
export type AiDifficultyTriggerStyle = 'default' | 'landscape-stack';

/** Робот без фона — SVG на всю кнопку toolbar (portrait strip / landscape stack). */
function AiRobotToolbarGlyph() {
  return (
    <svg
      className="ai-difficulty-trigger-cosmic-glyph"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path d="M12 2.5v2.2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <rect x="4.5" y="6.5" width="15" height="14" rx="3.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="9.2" cy="11.5" r="1.65" fill="#67e8f9" />
      <circle cx="14.8" cy="11.5" r="1.65" fill="#67e8f9" />
      <rect x="8.3" y="15.2" width="1.35" height="3.2" rx="0.45" fill="#f472b6" />
      <rect x="11.32" y="15.2" width="1.35" height="3.2" rx="0.45" fill="#22d3ee" />
      <rect x="14.35" y="15.2" width="1.35" height="3.2" rx="0.45" fill="#c4b5fd" />
    </svg>
  );
}

function AiDifficultyLandscapeGlyph() {
  return <AiRobotToolbarGlyph />;
}

export function AiDifficultyControl({
  layout,
  triggerStyle = 'default',
  offlineApplyDifficultyToAllBots,
}: {
  layout: AiDifficultyControlLayout;
  triggerStyle?: AiDifficultyTriggerStyle;
  /** Офлайн: выбор в шапке — один уровень для всех ботов и для новых партий (ai1–ai3 в storage) */
  offlineApplyDifficultyToAllBots?: (level: AIDifficulty) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<AIDifficulty>(() => getAiDifficulty());
  const [popoverPos, setPopoverPos] = useState({ top: 0, left: 0 });
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  const isMobile = layout === 'mobile';
  const landscapeStack = isMobile && triggerStyle === 'landscape-stack';

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
      <p className="ai-difficulty-popover-scope-note">
        <span className="ai-difficulty-popover-scope-note__lead">{t('ai.scopeLead')}</span>
        {' — '}
        {t('ai.scopeAll')}
        <span className="ai-difficulty-popover-scope-note__sep" aria-hidden="true">
          ·
        </span>
        <span className="ai-difficulty-popover-scope-note__personal">
          {t('ai.scopePersonal')}
        </span>
      </p>
      <div className="ai-difficulty-popover-list" role="radiogroup" aria-label={t('ai.levelGroup')}>
        {LEVEL_META.map((row) => {
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
                <span className="ai-difficulty-option-title">{t(row.titleKey)}</span>
                <span className="ai-difficulty-option-hint">{t(row.hintKey)}</span>
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
      className={[
        'ai-difficulty-root',
        isMobile ? 'ai-difficulty-root--mobile' : 'ai-difficulty-root--pc',
        landscapeStack ? 'ai-difficulty-root--landscape-stack' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <button
        ref={buttonRef}
        type="button"
        className={[
          'header-ai-difficulty-btn',
          isMobile ? 'header-nav-compact-btn' : 'header-ai-difficulty-btn--pc',
          landscapeStack ? 'game-mobile-landscape-toolbar-panel__icon-btn' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        title={t('ai.title')}
        aria-label={t('ai.botsAria')}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        {landscapeStack ? (
          <AiDifficultyLandscapeGlyph />
        ) : (
          <>
            <span className={['ai-difficulty-trigger-ball', triggerBallExtra].join(' ')} aria-hidden />
            <span className="ai-difficulty-trigger-label">{t('ai.short')}</span>
          </>
        )}
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
