import type { ReactNode } from 'react';

type CapsuleVariant = 'hall' | 'create' | 'join' | 'launch' | 'ghost';

function GlyphHall() {
  return (
    <svg className="lobby-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <circle cx="22" cy="22" r="18" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.35" />
      <circle cx="22" cy="22" r="11" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.55" strokeDasharray="3 4" />
      <circle className="lobby-capsule-glyph-orbit lobby-capsule-glyph-orbit--a" cx="22" cy="7" r="3.2" fill="currentColor" />
      <circle className="lobby-capsule-glyph-orbit lobby-capsule-glyph-orbit--b" cx="35" cy="26" r="2.8" fill="currentColor" opacity="0.85" />
      <circle className="lobby-capsule-glyph-orbit lobby-capsule-glyph-orbit--c" cx="11" cy="28" r="2.6" fill="currentColor" opacity="0.7" />
      <circle cx="22" cy="22" r="4.5" fill="currentColor" opacity="0.95" />
    </svg>
  );
}

function GlyphCreate() {
  return (
    <svg className="lobby-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <polygon
        points="22,4 38,12 38,32 22,40 6,32 6,12"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.3"
        opacity="0.5"
      />
      <circle cx="22" cy="22" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.75" />
      <path d="M22 16v12M16 22h12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <circle className="lobby-capsule-glyph-pulse" cx="22" cy="22" r="14" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.4" />
    </svg>
  );
}

function GlyphJoin() {
  return (
    <svg className="lobby-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <rect x="8" y="14" width="12" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <rect x="24" y="14" width="12" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M20 22h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="14" cy="22" r="2" fill="currentColor" />
      <circle cx="30" cy="22" r="2" fill="currentColor" />
      <path d="M14 10v4M30 10v4M14 30v4M30 30v4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

function GlyphLaunch() {
  return (
    <svg className="lobby-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path d="M22 6l3 10h10l-8 6 3 10-8-6-8 6 3-10-8-6h10z" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

const GLYPHS: Record<CapsuleVariant, ReactNode> = {
  hall: <GlyphHall />,
  create: <GlyphCreate />,
  join: <GlyphJoin />,
  launch: <GlyphLaunch />,
  ghost: null,
};

export type LobbyCapsuleButtonProps = {
  variant: CapsuleVariant;
  title: string;
  hint?: string;
  expanded?: boolean;
  disabled?: boolean;
  onClick?: () => void;
  type?: 'button' | 'submit';
  showChevron?: boolean;
};

export function LobbyCapsuleButton({
  variant,
  title,
  hint,
  expanded,
  disabled,
  onClick,
  type = 'button',
  showChevron,
}: LobbyCapsuleButtonProps) {
  const chevron = showChevron ?? variant === 'create';
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      aria-expanded={chevron ? expanded : undefined}
      className={[
        'lobby-capsule',
        `lobby-capsule--${variant}`,
        expanded ? 'lobby-capsule--expanded' : '',
        disabled ? 'lobby-capsule--disabled' : '',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {GLYPHS[variant] && <span className="lobby-capsule__glyph">{GLYPHS[variant]}</span>}
      <span className="lobby-capsule__body">
        <span className="lobby-capsule__title">{title}</span>
        {hint ? <span className="lobby-capsule__hint">{hint}</span> : null}
      </span>
      {chevron ? (
        <span className="lobby-capsule__chev" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      ) : null}
    </button>
  );
}

export type LobbyCreatePanelProps = {
  createBankRoom: boolean;
  createPublicRoom: boolean;
  showPublicHallOption: boolean;
  creating: boolean;
  onToggleBank: (value: boolean) => void;
  onTogglePublic: (value: boolean) => void;
  onLaunch: () => void;
  onCancel: () => void;
};

export function LobbyCreatePanel({
  createBankRoom,
  createPublicRoom,
  showPublicHallOption,
  creating,
  onToggleBank,
  onTogglePublic,
  onLaunch,
  onCancel,
}: LobbyCreatePanelProps) {
  return (
    <div className="lobby-create-panel" role="region" aria-label="Настройки новой комнаты">
      <p className="lobby-create-panel__lead">Параметры комнаты перед запуском</p>
      <label className="lobby-cosmo-toggle">
        <input
          type="checkbox"
          checked={createBankRoom}
          onChange={(e) => onToggleBank(e.target.checked)}
        />
        <span className="lobby-cosmo-toggle__track" aria-hidden="true">
          <span className="lobby-cosmo-toggle__knob" />
        </span>
        <span className="lobby-cosmo-toggle__text">
          <span className="lobby-cosmo-toggle__title">Банк (демо)</span>
          <span className="lobby-cosmo-toggle__hint">взнос 100 с каждого</span>
        </span>
      </label>
      {showPublicHallOption && (
        <label className="lobby-cosmo-toggle">
          <input
            type="checkbox"
            checked={createPublicRoom}
            onChange={(e) => onTogglePublic(e.target.checked)}
          />
          <span className="lobby-cosmo-toggle__track" aria-hidden="true">
            <span className="lobby-cosmo-toggle__knob" />
          </span>
          <span className="lobby-cosmo-toggle__text">
            <span className="lobby-cosmo-toggle__title">Показать в зале</span>
            <span className="lobby-cosmo-toggle__hint">стол виден другим игрокам</span>
          </span>
        </label>
      )}
      <LobbyCapsuleButton
        variant="launch"
        title={creating ? 'Запуск…' : createBankRoom ? 'Запустить банковую' : 'Запустить комнату'}
        hint="создать и войти"
        disabled={creating}
        onClick={onLaunch}
        showChevron={false}
      />
      <button type="button" className="lobby-capsule lobby-capsule--ghost lobby-capsule--compact" onClick={onCancel}>
        <span className="lobby-capsule__body">
          <span className="lobby-capsule__title">Отмена</span>
        </span>
      </button>
    </div>
  );
}
