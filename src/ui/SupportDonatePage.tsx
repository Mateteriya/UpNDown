/**
 * Страница донатов: CloudTips · ЮMoney.
 * Ссылки — из VITE_DONATE_* (см. donateLinks.ts / .env.example).
 *
 * Иллюстрации лидов — картинка внутри абзаца, текст обтекает (сейчас).
 * Отклонены: 1) крупная виньетка; 3) отдельная миниатюра слева.
 * Запас: 2) текст поверх низа картинки; 4) мягкий затемнённый фон-атмосфера.
 */

import { useEffect, useId, useState, type ReactNode } from 'react';
import { LobbyBackButton } from './LobbyEntryActions';
import { getDonateLinks, hasDonateLinks, type DonateMethodId } from '../lib/donateLinks';
import { useT } from '../i18n';

export type SupportDonatePageProps = {
  onBack: () => void;
};

/** Стильные марки способов оплаты — в kicker (над названием). */
function withPayBrandMarks(text: string): ReactNode {
  const parts = text.split(/(Т‑Pay|Т-Pay|T‑Pay|T-Pay|СБП|SBP|кошелёк|Кошелёк|wallet|Wallet|карта|Карта|card|Card)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) => {
    if (part === 'Т‑Pay' || part === 'Т-Pay' || part === 'T‑Pay' || part === 'T-Pay') {
      return (
        <span key={`tpay-${i}`} className="support-page__tpay">
          {part}
        </span>
      );
    }
    if (part === 'СБП' || part === 'SBP') {
      return (
        <span key={`sbp-${i}`} className="support-page__sbp">
          <svg
            className="support-page__sbp-mark"
            viewBox="0 0 18 18"
            width="12"
            height="12"
            aria-hidden
            focusable="false"
          >
            <path fill="#7B2DBF" d="M9 1.2 14.8 11.2H3.2Z" />
            <path fill="#2F6BFF" d="M3.4 6.2 9 16.2 1.6 11.2Z" opacity="0.95" />
            <path fill="#2DBE6A" d="M14.6 6.2 16.4 11.2 9 16.2Z" opacity="0.95" />
          </svg>
          <span className="support-page__sbp-text">{part}</span>
        </span>
      );
    }
    if (part === 'кошелёк' || part === 'Кошелёк' || part === 'wallet' || part === 'Wallet') {
      return (
        <span key={`wallet-${i}`} className="support-page__ym-wallet">
          <svg
            className="support-page__ym-wallet-mark"
            viewBox="0 0 20 16"
            width="14"
            height="11"
            aria-hidden
            focusable="false"
          >
            <rect x="1" y="3" width="16.5" height="11.5" rx="2.2" fill="#03A9F4" />
            <path fill="#0277a8" d="M1 6.2h16.5v2.1H1z" opacity="0.45" />
            <rect x="12.2" y="8.4" width="6.2" height="4.4" rx="1.4" fill="#0d3a52" />
            <circle cx="15.4" cy="10.6" r="1.15" fill="#03A9F4" />
            <path
              fill="#4fc3f7"
              d="M4.2 3C4.2 1.6 5.3 0.6 6.7 0.6h4.2c1.4 0 2.5 1 2.5 2.4V3H4.2z"
            />
          </svg>
          <span className="support-page__ym-wallet-text">{part}</span>
        </span>
      );
    }
    if (part === 'карта' || part === 'Карта' || part === 'card' || part === 'Card') {
      return (
        <span key={`card-${i}`} className="support-page__card-pay">
          <svg
            className="support-page__card-pay-mark"
            viewBox="0 0 20 14"
            width="14"
            height="10"
            aria-hidden
            focusable="false"
          >
            <rect x="0.6" y="0.6" width="18.8" height="12.8" rx="2.2" fill="#1e3a5f" />
            <rect x="0.6" y="3.2" width="18.8" height="2.4" fill="#0f2744" />
            <rect x="2.2" y="8.2" width="4.2" height="3.1" rx="0.5" fill="#d4af37" opacity="0.92" />
            <rect x="12.2" y="8.6" width="5.4" height="1.1" rx="0.4" fill="#94a3b8" opacity="0.85" />
            <rect x="13.4" y="10.4" width="4.2" height="0.7" rx="0.3" fill="#64748b" opacity="0.75" />
          </svg>
          <span className="support-page__card-pay-text">{part}</span>
        </span>
      );
    }
    return part;
  });
}

/** В blurb: обычный цвет строки, но набор как у kicker (uppercase · tracking). */
function withPayBrandWords(text: string): ReactNode {
  const parts = text.split(/(Т‑Pay|Т-Pay|T‑Pay|T-Pay|СБП|SBP|кошелёк|Кошелёк|wallet|Wallet|карта|Карта|card|Card)/g);
  if (parts.length === 1) return text;
  return parts.map((part, i) =>
    part === 'Т‑Pay' ||
    part === 'Т-Pay' ||
    part === 'T‑Pay' ||
    part === 'T-Pay' ||
    part === 'СБП' ||
    part === 'SBP' ||
    part === 'кошелёк' ||
    part === 'Кошелёк' ||
    part === 'wallet' ||
    part === 'Wallet' ||
    part === 'карта' ||
    part === 'Карта' ||
    part === 'card' ||
    part === 'Card' ? (
      <span key={`payw-${i}`} className="support-page__pay-word">
        {part}
      </span>
    ) : (
      part
    ),
  );
}

/** ~23 с на вариант: комфортно прочитать длинный лид. */
const LEAD_ROTATE_MS = 23_000;

type LeadArt = {
  id: 'samurai' | 'dopamine' | 'joker';
  artWebp: string;
  artJpeg: string;
};

const LEAD_ART: LeadArt[] = [
  { id: 'samurai', artWebp: '/donate/samurai.webp', artJpeg: '/donate/samurai.jpg' },
  { id: 'dopamine', artWebp: '/donate/dopamine.webp', artJpeg: '/donate/dopamine.jpg' },
  { id: 'joker', artWebp: '/donate/joker.webp', artJpeg: '/donate/joker.jpg' },
];

function FaceCheerKind({ uid }: { uid: string }) {
  /* На основе FaceSadPuzzled: космические штрихи, добрая ирония (без ушек). */
  return (
    <svg className="support-page__face support-page__face--inline" viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id={`${uid}-cheer-stroke`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#67e8f9" />
          <stop offset="45%" stopColor="#c084fc" />
          <stop offset="100%" stopColor="#fb7185" />
        </linearGradient>
        <radialGradient id={`${uid}-cheer-plate`} cx="45%" cy="35%" r="60%">
          <stop offset="0%" stopColor="#312e81" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#0f172a" stopOpacity="0.15" />
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="15.5" fill={`url(#${uid}-cheer-plate)`} opacity="0.9" />
      <circle
        cx="20"
        cy="20"
        r="15.5"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="0.45"
        opacity="0.4"
      />
      <path
        d="M10.2 14.2c2.1-2.6 5.8-2.8 7.6-0.4"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M22.8 13.6c1.6-1.2 4.6-1 6.2 0.6"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="1.85"
        strokeLinecap="round"
        opacity="0.95"
      />
      <circle cx="14.2" cy="18.6" r="1.85" fill="#e9d5ff" />
      <circle cx="14.2" cy="18.6" r="1.1" fill="#67e8f9" opacity="0.9" />
      <circle cx="25.8" cy="18.7" r="1.85" fill="#e9d5ff" />
      <circle cx="25.8" cy="18.7" r="1.1" fill="#f472b6" opacity="0.9" />
      <path
        d="M14.8 25.2c2.4 2.6 7.8 2.6 10.4 0"
        fill="none"
        stroke={`url(#${uid}-cheer-stroke)`}
        strokeWidth="2.05"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MethodGlyph({ id }: { id: DonateMethodId }) {
  if (id === 'cloudtips') {
    return (
      <svg className="support-page__glyph-svg" viewBox="0 0 48 48" aria-hidden focusable="false">
        <defs>
          <linearGradient id="sp-ct-g" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
            <stop stopColor="#a5f3fc" />
            <stop offset="0.55" stopColor="#22d3ee" />
            <stop offset="1" stopColor="#6366f1" />
          </linearGradient>
        </defs>
        <path
          fill="url(#sp-ct-g)"
          d="M30.5 16.2c-.7-4.2-4.4-7.4-8.8-7.4-3.6 0-6.7 2.1-8.1 5.2C10.2 14.5 8 17.2 8 20.6c0 4 3.2 7.2 7.2 7.2h16.1c3.7 0 6.7-3 6.7-6.7 0-3.4-2.5-6.2-5.8-6.7z"
          opacity="0.92"
        />
        <circle cx="24" cy="34" r="7.2" fill="none" stroke="url(#sp-ct-g)" strokeWidth="2.2" />
        <path
          d="M24 30.2v7.6M20.6 34h6.8"
          fill="none"
          stroke="#ecfeff"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg className="support-page__glyph-svg" viewBox="0 0 48 48" aria-hidden focusable="false">
      <defs>
        <linearGradient id="sp-ym-g" x1="8" y1="10" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fde68a" />
          <stop offset="0.45" stopColor="#fbbf24" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>
      <rect x="9" y="14" width="30" height="22" rx="6" fill="url(#sp-ym-g)" opacity="0.95" />
      <path fill="#78350f" opacity="0.35" d="M9 20h30v4H9z" />
      <circle cx="33" cy="29" r="3.4" fill="#fff7ed" />
      <path
        d="M16 11.5h10c1.4 0 2.5 1.1 2.5 2.5V14H16.8c-1.2 0-2.2-.9-2.3-2.1l-.1-.4z"
        fill="#fcd34d"
      />
    </svg>
  );
}

function daySeedLeadIndex(): number {
  const day = Math.floor(Date.now() / 86_400_000);
  return day % LEAD_ART.length;
}

export function SupportDonatePage({ onBack }: SupportDonatePageProps) {
  const t = useT();
  const uid = useId().replace(/:/g, '');
  const links = getDonateLinks();
  const ready = hasDonateLinks();
  const [leadIndex, setLeadIndex] = useState(daySeedLeadIndex);
  const [leadVisible, setLeadVisible] = useState(true);

  useEffect(() => {
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;

    let fadeOut: number | undefined;
    let next: number | undefined;
    const tick = window.setInterval(() => {
      setLeadVisible(false);
      fadeOut = window.setTimeout(() => {
        setLeadIndex((i) => (i + 1) % LEAD_ART.length);
        setLeadVisible(true);
      }, 420);
    }, LEAD_ROTATE_MS);

    return () => {
      window.clearInterval(tick);
      if (fadeOut) window.clearTimeout(fadeOut);
      if (next) window.clearTimeout(next);
    };
  }, []);

  useEffect(() => {
    for (const v of LEAD_ART) {
      const img = new Image();
      img.src = v.artWebp;
    }
  }, []);

  const cheer = <FaceCheerKind uid={`${uid}-cheer`} />;
  const leadCopy = {
    samurai: { cta: t('support.ctaSamurai'), body: t('support.bodySamurai') },
    dopamine: { cta: t('support.ctaDopamine'), body: t('support.bodyDopamine') },
    joker: { cta: t('support.ctaJoker'), body: t('support.bodyJoker') },
  } as const;

  return (
    <div className="support-page">
      <div className="support-page__bg" aria-hidden="true" />
      <div className="support-page__shell">
        <header className="support-page__top">
          <LobbyBackButton onClick={onBack} />
          <h1 className="support-page__brand">Up&amp;Down</h1>
        </header>

        <main className="support-page__main">
          <p className="support-page__eyebrow">{t('support.eyebrow')}</p>
          <h2 className="support-page__title">
            <span className="support-page__title-stack" aria-hidden="true">
              <span className="support-page__title-depth">{t('support.title')}</span>
              <span className="support-page__title-depth support-page__title-depth--mid">
                {t('support.title')}
              </span>
            </span>
            <span className="support-page__title-face cosmic-iridescent-text">{t('support.title')}</span>
          </h2>

          {/* Картинка в начале лида — один поток текста обтекает без ложных абзацев */}
          <div className="support-page__lead-slot" aria-live="polite">
            {LEAD_ART.map((variant, i) => {
              const active = i === leadIndex;
              const shown = active && leadVisible;
              const copy = leadCopy[variant.id];
              return (
                <p
                  key={variant.id}
                  className={[
                    'support-page__lead',
                    shown ? 'support-page__lead--in' : 'support-page__lead--out',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  aria-hidden={!active}
                >
                  <span className="support-page__lead-art" aria-hidden="true">
                    <picture>
                      <source srcSet={variant.artWebp} type="image/webp" />
                      <img src={variant.artJpeg} alt="" decoding="async" draggable={false} />
                    </picture>
                  </span>
                  {copy.body} {variant.id === 'samurai' ? cheer : null}{' '}
                  <span className="support-page__lead-cta">{copy.cta}</span>
                </p>
              );
            })}
          </div>

          <ul className="support-page__links">
            {links.map((link, i) => {
              const live = !!link.url;
              const className = [
                'support-page__cta',
                `support-page__cta--${link.id}`,
                live ? '' : 'support-page__cta--soon',
              ]
                .filter(Boolean)
                .join(' ');

              const inner = (
                <>
                  <span className="support-page__cta-shine" aria-hidden="true" />
                  <span className="support-page__cta-glyph" aria-hidden="true">
                    <MethodGlyph id={link.id} />
                  </span>
                  <span className="support-page__cta-copy">
                    <span className="support-page__cta-kicker">
                      {link.id === 'cloudtips'
                        ? withPayBrandMarks(t('support.cloudtipsHint'))
                        : link.id === 'yoomoney'
                          ? withPayBrandMarks(t('support.yoomoneyHint'))
                          : link.hint}
                    </span>
                    <span className="support-page__cta-title">{link.label}</span>
                    <span className="support-page__cta-blurb">
                      {link.id === 'cloudtips'
                        ? withPayBrandWords(t('support.cloudtipsBlurb'))
                        : link.id === 'yoomoney'
                          ? withPayBrandWords(t('support.yoomoneyBlurb'))
                          : link.blurb}
                    </span>
                    {!live ? (
                      <span className="support-page__cta-soon-tag">{t('support.soon')}</span>
                    ) : null}
                  </span>
                  <span className="support-page__cta-go" aria-hidden="true">
                    <svg viewBox="0 0 24 24" width="22" height="22" focusable="false">
                      <path
                        d="M9.5 5.5 16 12l-6.5 6.5"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </span>
                </>
              );

              return (
                <li
                  key={link.id}
                  className="support-page__link-item"
                  style={{ ['--sp-i' as string]: i }}
                >
                  {live ? (
                    <a
                      className={className}
                      href={link.url!}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {inner}
                    </a>
                  ) : (
                    <div className={className} aria-disabled="true">
                      {inner}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {!ready ? (
            <p className="support-page__pending-note" role="status">
              {t('support.pending')}
            </p>
          ) : null}
        </main>
      </div>
    </div>
  );
}
