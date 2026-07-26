/**
 * Страница донатов: CloudTips · ЮMoney.
 * Ссылки — из VITE_DONATE_* (см. donateLinks.ts / .env.example).
 */

import { LobbyBackButton } from './LobbyEntryActions';
import { getDonateLinks, hasDonateLinks, type DonateMethodId } from '../lib/donateLinks';

export type SupportDonatePageProps = {
  onBack: () => void;
};

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

export function SupportDonatePage({ onBack }: SupportDonatePageProps) {
  const links = getDonateLinks();
  const ready = hasDonateLinks();

  return (
    <div className="support-page">
      <div className="support-page__bg" aria-hidden="true">
        <span className="support-page__orb support-page__orb--a" />
        <span className="support-page__orb support-page__orb--b" />
        <span className="support-page__orb support-page__orb--c" />
      </div>
      <div className="support-page__shell">
        <header className="support-page__top">
          <LobbyBackButton onClick={onBack} />
          <h1 className="support-page__brand">Up&amp;Down</h1>
        </header>

        <main className="support-page__main">
          <p className="support-page__eyebrow">поддержка автора</p>
          <h2 className="support-page__title">Поддержать проект</h2>
          <p className="support-page__lead">
            Игра делается одним человеком. Любая сумма помогает онлайн, полировке и новым режимам —
            выберите удобный способ ниже.
          </p>

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
                    <span className="support-page__cta-kicker">{link.hint}</span>
                    <span className="support-page__cta-title">{link.label}</span>
                    <span className="support-page__cta-blurb">{link.blurb}</span>
                    {!live ? (
                      <span className="support-page__cta-soon-tag">ссылка скоро</span>
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
              Адреса ещё подключаются — карточки уже на месте, ссылки появятся здесь.
            </p>
          ) : null}

          <p className="support-page__thanks">Спасибо, что играете и остаётесь рядом.</p>
        </main>
      </div>
    </div>
  );
}
