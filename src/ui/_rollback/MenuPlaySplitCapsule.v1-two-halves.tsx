/**
 * ROLLBACK: Split Capsule v1 — две половины без общего глифа режима (до B4).
 *
 * Как откатиться:
 * 1. Скопировать `MenuPlaySplitCapsule` из этого файла в `MenuEntryActions.tsx`
 *    (заменить текущую реализацию + `SplitCapsuleHalf`).
 * 2. В `index.css` заменить блок «Split Capsule» на содержимое
 *    `src/ui/_rollback/menu-split-capsule.v1.css`.
 * 3. Подробнее: docs/MENU-SPLIT-CAPSULE-ROLLBACK.md
 *
 * Дата сохранения: 2026-07-12
 */

import type { ReactNode } from 'react';

type MenuCapsuleVariant =
  | 'online'
  | 'resumeOnline'
  | 'resumeOffline'
  | 'offline';

// GLYPHS — импортировать из MenuEntryActions или дублировать при откате.

function SplitCapsuleHalfV1({
  side,
  variant,
  title,
  hint,
  satelliteCode,
  onClick,
  glyphs,
}: {
  side: 'resume' | 'main';
  variant: MenuCapsuleVariant;
  title: string;
  hint: string;
  satelliteCode?: string | null;
  onClick: () => void;
  glyphs: Record<MenuCapsuleVariant, ReactNode>;
}) {
  const showSatellite = side === 'resume' && satelliteCode;
  return (
    <button
      type="button"
      className={[
        'menu-split-capsule__half',
        `menu-split-capsule__half--${side}`,
        `menu-split-capsule__half--${variant}`,
      ].join(' ')}
      onClick={onClick}
      aria-label={showSatellite ? `Продолжить, комната ${satelliteCode}` : undefined}
    >
      {showSatellite ? (
        <span className="menu-split-capsule__satellite" aria-hidden="true">
          <span className="menu-split-capsule__satellite-ring" />
          <span className="menu-split-capsule__satellite-code">{satelliteCode}</span>
        </span>
      ) : null}
      <span
        className={[
          'menu-split-capsule__glyph',
          side === 'resume' ? 'menu-split-capsule__glyph--sm' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        {glyphs[variant]}
      </span>
      <span className="menu-split-capsule__body">
        <span className="menu-split-capsule__title">{title}</span>
        <span className="menu-split-capsule__hint">{hint}</span>
      </span>
    </button>
  );
}

export function MenuPlaySplitCapsuleV1({
  mode,
  canResume,
  satelliteCode,
  onResume,
  onMain,
  glyphs,
  MenuCapsuleButton,
}: {
  mode: 'online' | 'offline';
  canResume: boolean;
  satelliteCode?: string | null;
  onResume: () => void;
  onMain: () => void;
  glyphs: Record<MenuCapsuleVariant, ReactNode>;
  MenuCapsuleButton: (props: {
    variant: MenuCapsuleVariant;
    title: string;
    hint?: string;
    onClick?: () => void;
  }) => ReactNode;
}) {
  const mainVariant: MenuCapsuleVariant = mode === 'online' ? 'online' : 'offline';
  const resumeVariant: MenuCapsuleVariant = mode === 'online' ? 'resumeOnline' : 'resumeOffline';

  if (!canResume) {
    return (
      <>
        {MenuCapsuleButton({
          variant: mainVariant,
          title: mode === 'online' ? 'Онлайн' : 'Офлайн против ИИ',
          hint: mode === 'online' ? 'комнаты и зал столов' : 'быстрый старт',
          onClick: onMain,
        })}
      </>
    );
  }

  const hasSatellite = mode === 'online' && Boolean(satelliteCode);

  return (
    <div
      className={[
        'menu-split-capsule',
        `menu-split-capsule--${mode}`,
        hasSatellite ? 'menu-split-capsule--has-satellite' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="menu-split-capsule__shell">
        <SplitCapsuleHalfV1
          side="resume"
          variant={resumeVariant}
          title="Продолжить"
          hint={mode === 'online' ? 'в партию' : 'сохранено'}
          satelliteCode={satelliteCode}
          onClick={onResume}
          glyphs={glyphs}
        />
        <span className="menu-split-capsule__beam" aria-hidden="true" />
        <SplitCapsuleHalfV1
          side="main"
          variant={mainVariant}
          title={mode === 'online' ? 'Онлайн' : 'Офлайн'}
          hint={mode === 'online' ? 'зал и комнаты' : 'новая партия'}
          onClick={onMain}
          glyphs={glyphs}
        />
      </div>
    </div>
  );
}
