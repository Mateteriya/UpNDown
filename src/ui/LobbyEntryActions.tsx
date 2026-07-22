import type { ReactNode } from 'react';

type CapsuleVariant = 'hall' | 'create' | 'join' | 'launch' | 'ghost' | 'back' | 'lastParty';

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

function GlyphBack() {
  return (
    <svg className="lobby-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M28 8c-6 2-10 7-10 14s4 12 10 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path d="M12 22h16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M18 16l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="30" cy="22" r="3" fill="currentColor" opacity="0.75" />
    </svg>
  );
}

function GlyphBackNav() {
  return (
    <svg className="lobby-nav-back__svg" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M17 5.5c-3.4 1.1-5.8 3.8-5.8 6.5s2.4 5.4 5.8 6.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.55"
      />
      <path d="M7 12h8.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M10.5 9.2 7 12l3.5 2.8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="18.5" cy="12" r="1.4" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

function GlyphPaste() {
  return (
    <svg className="lobby-entry-paste__svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="10" y="2.5" width="10" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.3" opacity="0.42" />
      <rect x="4" y="6.5" width="10" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.45" />
      <path d="M7.5 10.5h5.5M7.5 13h7M7.5 15.5h4" stroke="currentColor" strokeWidth="1.15" strokeLinecap="round" />
    </svg>
  );
}

function GlyphPasteOk() {
  return (
    <svg className="lobby-entry-paste__svg" viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6.5" width="10" height="13" rx="2" fill="none" stroke="currentColor" strokeWidth="1.45" opacity="0.55" />
      <path d="M7.5 13.2 9.8 15.5 14.5 10.8" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GlyphLastParty() {
  return (
    <svg className="lobby-capsule-glyph-svg" viewBox="0 0 44 44" aria-hidden="true">
      <path
        d="M30 14a12 12 0 1 0 2.4 7.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.75"
      />
      <path d="M30 8v6h-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="22" cy="22" r="4" fill="currentColor" opacity="0.9" />
      <path d="M22 18v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" opacity="0.65" />
    </svg>
  );
}

const GLYPHS: Record<CapsuleVariant, ReactNode> = {
  hall: <GlyphHall />,
  create: <GlyphCreate />,
  join: <GlyphJoin />,
  launch: <GlyphLaunch />,
  ghost: null,
  back: <GlyphBack />,
  lastParty: <GlyphLastParty />,
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

export type LobbyLastPartyToggleProps = {
  code: string;
  expanded: boolean;
  onClick: () => void;
};

export function LobbyLastPartyToggle({ code, expanded, onClick }: LobbyLastPartyToggleProps) {
  return (
    <button
      type="button"
      className={[
        'lobby-capsule',
        'lobby-capsule--last-party',
        expanded ? 'lobby-capsule--expanded' : '',
      ]
        .filter(Boolean)
        .join(' ')}
      aria-expanded={expanded}
      onClick={onClick}
    >
      <span className="lobby-capsule__glyph">{GLYPHS.lastParty}</span>
      <span className="lobby-capsule__body">
        <span className="lobby-capsule__title">Предыдущая комната</span>
        <span className="lobby-capsule__hint">быстрый возврат</span>
      </span>
      <span className="lobby-capsule__code-badge">{code}</span>
      <span className="lobby-capsule__chev" aria-hidden="true">
        {expanded ? '▾' : '▸'}
      </span>
    </button>
  );
}

export type LobbyBackButtonProps = {
  onClick: () => void;
};

export function LobbyBackButton({ onClick }: LobbyBackButtonProps) {
  return (
    <button type="button" className="lobby-nav-back" onClick={onClick} aria-label="Назад в меню">
      <span className="lobby-nav-back__glyph">
        <GlyphBackNav />
      </span>
      <span className="lobby-nav-back__beam" aria-hidden="true" />
      <span className="lobby-nav-back__label">Меню</span>
    </button>
  );
}

export type LobbyPasteCodeButtonProps = {
  ok?: boolean;
  onClick: () => void;
};

export function LobbyPasteCodeButton({ ok, onClick }: LobbyPasteCodeButtonProps) {
  return (
    <button
      type="button"
      className={['lobby-entry-paste', ok ? 'lobby-entry-paste--ok' : ''].filter(Boolean).join(' ')}
      onClick={onClick}
      aria-label="Вставить код комнаты из буфера обмена"
    >
      {ok ? <GlyphPasteOk /> : <GlyphPaste />}
    </button>
  );
}

export type LobbyCreatePanelProps = {
  createBankRoom: boolean;
  createPublicRoom: boolean;
  maxPlayers: 3 | 4;
  showPublicHallOption: boolean;
  creating: boolean;
  onToggleBank: (value: boolean) => void;
  onTogglePublic: (value: boolean) => void;
  onMaxPlayersChange: (value: 3 | 4) => void;
  onLaunch: () => void;
  onCancel: () => void;
};

export function LobbyCreatePanel({
  createBankRoom,
  createPublicRoom,
  maxPlayers,
  showPublicHallOption,
  creating,
  onToggleBank,
  onTogglePublic,
  onMaxPlayersChange,
  onLaunch,
  onCancel,
}: LobbyCreatePanelProps) {
  return (
    <div className="lobby-create-panel" role="region" aria-label="Настройки новой комнаты">
      <p className="lobby-create-panel__lead">Параметры комнаты перед запуском</p>
      <div className="lobby-cosmo-toggle__text" role="group" aria-label="Число игроков">
        <span className="lobby-cosmo-toggle__title">Игроков за столом</span>
        <span style={{ display: 'inline-flex', gap: 8, marginTop: 6 }}>
          {[3, 4].map((count) => (
            <button
              key={count}
              type="button"
              className="lobby-capsule lobby-capsule--ghost lobby-capsule--compact"
              aria-pressed={maxPlayers === count}
              onClick={() => onMaxPlayersChange(count as 3 | 4)}
            >
              <span className="lobby-capsule__body">
                <span className="lobby-capsule__title">{count}</span>
              </span>
            </button>
          ))}
        </span>
      </div>
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
