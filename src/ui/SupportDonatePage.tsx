/**
 * Страница донатов: спокойный экран без «маркетингового дашборда».
 * Ссылки — из VITE_DONATE_* (см. donateLinks.ts / .env.example).
 */

import { LobbyBackButton } from './LobbyEntryActions';
import { getDonateLinks, hasDonateLinks } from '../lib/donateLinks';

export type SupportDonatePageProps = {
  onBack: () => void;
};

export function SupportDonatePage({ onBack }: SupportDonatePageProps) {
  const links = getDonateLinks();
  const ready = hasDonateLinks();

  return (
    <div className="support-page">
      <div className="support-page__bg" aria-hidden="true" />
      <div className="support-page__shell">
        <header className="support-page__top">
          <LobbyBackButton onClick={onBack} />
          <h1 className="support-page__brand">Up&amp;Down</h1>
        </header>

        <main className="support-page__main">
          <p className="support-page__eyebrow">поддержка автора</p>
          <h2 className="support-page__title">Поддержать проект</h2>
          <p className="support-page__lead">
            Игра развивается силами одного человека. Любая помощь ускоряет онлайн, полировку и новые
            режимы — и очень нужна прямо сейчас.
          </p>

          {ready ? (
            <ul className="support-page__links">
              {links.map((link) => (
                <li key={link.id}>
                  <a
                    className="support-page__cta"
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <span className="support-page__cta-title">{link.label}</span>
                    <span className="support-page__cta-hint">{link.hint}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <div className="support-page__pending" role="status">
              <p className="support-page__pending-title">Ссылки скоро появятся здесь</p>
              <p className="support-page__pending-body">
                Пока донатные адреса настраиваются. Загляните чуть позже — кнопка останется в
                кабинете и в меню.
              </p>
            </div>
          )}

          <p className="support-page__thanks">Спасибо, что играете и остаётесь рядом.</p>
        </main>
      </div>
    </div>
  );
}
