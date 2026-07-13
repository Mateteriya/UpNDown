/**
 * Rollback: B4 split capsule with left mode rail (glyph + vertical label + dot).
 * Saved: 2026-07-12. Restore via docs/MENU-SPLIT-CAPSULE-ROLLBACK.md
 */
import type { ReactNode } from 'react';

// Paste into MenuEntryActions.tsx — requires GLYPHS, MenuCapsuleButton, MenuCapsuleVariant from same file.

type SplitCapsuleTone = 'resumeOnline' | 'resumeOffline' | 'actionOnline' | 'actionOffline';

function SplitCapsuleHalfV2LeftRail({
  side,
  tone,
  glyph,
  title,
  hint,
  satelliteCode,
  onClick,
}: {
  side: 'resume' | 'main';
  tone: SplitCapsuleTone;
  glyph?: ReactNode;
  title: string;
  hint: string;
  satelliteCode?: string | null;
  onClick: () => void;
}) {
  const showSatellite = side === 'resume' && satelliteCode;
  return (
    <button
      type="button"
      className={[
        'menu-split-capsule__half',
        `menu-split-capsule__half--${side}`,
        `menu-split-capsule__half--${tone}`,
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
      {glyph ? (
        <span className="menu-split-capsule__glyph menu-split-capsule__glyph--stack">{glyph}</span>
      ) : null}
      <span className="menu-split-capsule__body">
        <span
          className={[
            'menu-split-capsule__title',
            side === 'main'
              ? `menu-split-capsule__title--new menu-split-capsule__title--new-${tone === 'actionOnline' ? 'online' : 'offline'}`
              : '',
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {title}
        </span>
        <span className="menu-split-capsule__hint">{hint}</span>
      </span>
    </button>
  );
}

export function MenuPlaySplitCapsuleV2LeftRail({
  mode,
  canResume,
  satelliteCode,
  onResume,
  onMain,
  mainVariant,
  resumeVariant,
  GLYPHS,
  MenuCapsuleButton,
}: {
  mode: 'online' | 'offline';
  canResume: boolean;
  satelliteCode?: string | null;
  onResume: () => void;
  onMain: () => void;
  mainVariant: 'online' | 'offline';
  resumeVariant: 'resumeOnline' | 'resumeOffline';
  GLYPHS: Record<string, ReactNode>;
  MenuCapsuleButton: (props: {
    variant: 'online' | 'offline';
    title: string;
    hint: string;
    onClick: () => void;
  }) => ReactNode;
}) {
  const modeLabel = mode === 'online' ? 'Онлайн' : 'Офлайн';

  if (!canResume) {
    return (
      <MenuCapsuleButton
        variant={mainVariant}
        title={mode === 'online' ? 'Онлайн' : 'Офлайн против ИИ'}
        hint={mode === 'online' ? 'комнаты и зал столов' : 'быстрый старт'}
        onClick={onMain}
      />
    );
  }

  const hasSatellite = mode === 'online' && Boolean(satelliteCode);
  const resumeTone: SplitCapsuleTone = mode === 'online' ? 'resumeOnline' : 'resumeOffline';
  const actionTone: SplitCapsuleTone = mode === 'online' ? 'actionOnline' : 'actionOffline';

  return (
    <div
      className={[
        'menu-split-capsule',
        'menu-split-capsule--b4',
        `menu-split-capsule--${mode}`,
        hasSatellite ? 'menu-split-capsule--has-satellite' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <div className="menu-split-capsule__shell">
        <div className={`menu-split-capsule__mode-rail menu-split-capsule__mode-rail--${mode}`} aria-label={modeLabel}>
          <span className={`menu-split-capsule__mode-glyph menu-split-capsule__mode-glyph--${mode}`}>
            {GLYPHS[mainVariant]}
          </span>
          <span className="menu-split-capsule__mode-aside">
            <span className={`menu-split-capsule__mode-label menu-split-capsule__mode-label--${mode}`} aria-hidden="true">
              {modeLabel.split('').map((ch, i) => (
                <span key={`${ch}-${i}`} className="menu-split-capsule__mode-letter">
                  {ch}
                </span>
              ))}
            </span>
            <span className={`menu-split-capsule__mode-dot menu-split-capsule__mode-dot--${mode}`} aria-hidden="true" />
          </span>
        </div>
        <span className="menu-split-capsule__rail-beam" aria-hidden="true" />
        <div className="menu-split-capsule__actions">
          <SplitCapsuleHalfV2LeftRail
            side="main"
            tone={actionTone}
            glyph={GLYPHS[mode === 'online' ? 'newOnline' : 'newOffline']}
            title={mode === 'online' ? 'Новая сессия' : 'Новая партия'}
            hint={mode === 'online' ? 'Комнаты и лобби' : 'против ИИ'}
            onClick={onMain}
          />
          <span className="menu-split-capsule__beam" aria-hidden="true" />
          <SplitCapsuleHalfV2LeftRail
            side="resume"
            tone={resumeTone}
            glyph={GLYPHS[resumeVariant]}
            title="Продолжить"
            hint={mode === 'online' ? 'в партию' : 'сохранено'}
            satelliteCode={satelliteCode}
            onClick={onResume}
          />
        </div>
      </div>
    </div>
  );
}
