import { useEffect, useId, useRef, useState } from 'react';
import { getLocaleOption, LOCALE_OPTIONS, useI18n, type Locale } from '../i18n';
import '../styles/language-switch.css';

const COMPACT_MQ = '(max-width: 1024px)';

function useCompactLangSwitch() {
  const [compact, setCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(COMPACT_MQ).matches : false,
  );

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_MQ);
    const sync = () => setCompact(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return compact;
}

/** Орбиты на мобильном ушке / в шапке пикера. */
function LangOrbitGlyph({ gradId }: { gradId: string }) {
  return (
    <svg className="lang-switch__solo-glyph-svg" viewBox="0 0 16 16" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="10%" y1="0%" x2="90%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
      </defs>
      <path
        d="M3.2 6.2c0-2.6 9.6-2.6 9.6 0"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M11.05 4.85 12.7 6.35l-2.35.55"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M12.8 9.8c0 2.6-9.6 2.6-9.6 0"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.45"
        strokeLinecap="round"
      />
      <path
        d="M4.95 11.15 3.3 9.65l2.35-.55"
        fill="none"
        stroke={`url(#${gradId})`}
        strokeWidth="1.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="8" r="1.35" fill={`url(#${gradId})`} opacity="0.95" />
      <circle cx="8" cy="8" r="0.45" fill="#f5d0fe" opacity="0.9" />
    </svg>
  );
}

/** ПК: космический глобус (меридианы / параллели). */
function LangGlobeGlyph({ gradId }: { gradId: string }) {
  return (
    <svg className="lang-switch__globe-svg" viewBox="0 0 28 28" focusable="false" aria-hidden>
      <defs>
        <linearGradient id={`${gradId}-ring`} x1="12%" y1="8%" x2="88%" y2="92%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#e879f9" />
        </linearGradient>
        <radialGradient id={`${gradId}-core`} cx="38%" cy="32%" r="62%">
          <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#4c1d95" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.2" />
        </radialGradient>
      </defs>
      <circle cx="14" cy="14" r="11.2" fill={`url(#${gradId}-core)`} />
      <circle
        cx="14"
        cy="14"
        r="11.2"
        fill="none"
        stroke={`url(#${gradId}-ring)`}
        strokeWidth="1.55"
        opacity="0.95"
      />
      {/* параллели */}
      <ellipse
        cx="14"
        cy="14"
        rx="11.2"
        ry="4.2"
        fill="none"
        stroke={`url(#${gradId}-ring)`}
        strokeWidth="1.05"
        opacity="0.7"
      />
      <ellipse
        cx="14"
        cy="14"
        rx="11.2"
        ry="7.6"
        fill="none"
        stroke={`url(#${gradId}-ring)`}
        strokeWidth="0.85"
        opacity="0.45"
      />
      {/* меридиан */}
      <ellipse
        cx="14"
        cy="14"
        rx="4.4"
        ry="11.2"
        fill="none"
        stroke={`url(#${gradId}-ring)`}
        strokeWidth="1.05"
        opacity="0.75"
      />
      {/* экватор-блик */}
      <path
        d="M3.2 14h21.6"
        fill="none"
        stroke={`url(#${gradId}-ring)`}
        strokeWidth="1.1"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="14" cy="14" r="1.35" fill="#f5d0fe" opacity="0.9" />
    </svg>
  );
}

function LangPickerList({
  locale,
  ariaLabel,
  onPick,
}: {
  locale: Locale;
  ariaLabel: string;
  onPick: (id: Locale) => void;
}) {
  return (
    <ul className="lang-switch__picker-list" role="listbox" aria-label={ariaLabel}>
      {LOCALE_OPTIONS.map((opt) => {
        const on = opt.id === locale;
        return (
          <li key={opt.id} className="lang-switch__picker-item">
            <button
              type="button"
              role="option"
              className={['lang-switch__picker-opt', on ? 'lang-switch__picker-opt--on' : '']
                .filter(Boolean)
                .join(' ')}
              aria-selected={on}
              onClick={() => onPick(opt.id)}
            >
              <span className="lang-switch__picker-code" aria-hidden="true">
                {opt.short}
              </span>
              <span className="lang-switch__picker-name">{opt.nativeName}</span>
              <span
                className={
                  on
                    ? 'lang-switch__picker-check'
                    : 'lang-switch__picker-check lang-switch__picker-check--empty'
                }
                aria-hidden="true"
              />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();
  const compact = useCompactLangSwitch();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const glyphGradId = `lang-g-${useId().replace(/:/g, '')}`;
  const current = getLocaleOption(locale);

  useEffect(() => {
    setOpen(false);
  }, [compact]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const pick = (next: Locale) => {
    setLocale(next);
    setOpen(false);
  };

  /* ——— Мобилка: ушко → панель ——— */
  if (compact && !open) {
    return (
      <div
        ref={rootRef}
        className={['lang-switch', 'lang-switch--solo', className].filter(Boolean).join(' ')}
        data-locale={locale}
      >
        <span className="lang-switch__rim" aria-hidden="true" />
        <button
          type="button"
          className="lang-switch__solo-btn"
          aria-label={t('lang.aria')}
          aria-expanded={false}
          aria-haspopup="listbox"
          onClick={() => setOpen(true)}
        >
          <span className="lang-switch__solo-label">{current.short}</span>
          <span className="lang-switch__solo-glyph" aria-hidden="true">
            <LangOrbitGlyph gradId={glyphGradId} />
          </span>
        </button>
      </div>
    );
  }

  if (compact && open) {
    return (
      <div
        ref={rootRef}
        className={['lang-switch', 'lang-switch--picker', className].filter(Boolean).join(' ')}
        data-locale={locale}
      >
        <span className="lang-switch__rim" aria-hidden="true" />
        <div className="lang-switch__picker-panel">
          <div className="lang-switch__picker-head">
            <span className="lang-switch__picker-glyph" aria-hidden="true">
              <LangOrbitGlyph gradId={`${glyphGradId}-p`} />
            </span>
            <span className="lang-switch__picker-title">{t('lang.choose')}</span>
          </div>
          <LangPickerList locale={locale} ariaLabel={t('lang.aria')} onPick={pick} />
        </div>
      </div>
    );
  }

  /* ——— ПК: глобус + «A» → выпадающее космическое меню ——— */
  return (
    <div
      ref={rootRef}
      className={[
        'lang-switch',
        'lang-switch--pc',
        open ? 'lang-switch--pc-open' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      data-locale={locale}
    >
      <span className="lang-switch__rim" aria-hidden="true" />
      <button
        type="button"
        className="lang-switch__pc-btn"
        aria-label={t('lang.aria')}
        aria-expanded={open}
        aria-haspopup="listbox"
        title={t('lang.choose')}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="lang-switch__pc-globe" aria-hidden="true">
          <LangGlobeGlyph gradId={glyphGradId} />
        </span>
        <span className="lang-switch__pc-mark" aria-hidden="true">
          A
        </span>
      </button>
      {open ? (
        <div className="lang-switch__pc-menu" role="presentation">
          <div className="lang-switch__picker-panel lang-switch__picker-panel--pc">
            <div className="lang-switch__picker-head">
              <span className="lang-switch__picker-glyph" aria-hidden="true">
                <LangGlobeGlyph gradId={`${glyphGradId}-m`} />
              </span>
              <span className="lang-switch__picker-title">{t('lang.choose')}</span>
            </div>
            <LangPickerList locale={locale} ariaLabel={t('lang.aria')} onPick={pick} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
