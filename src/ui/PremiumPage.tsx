/**
 * Экран Premium / подписка (#premium).
 * Витрина выгод + «Поддержать» + dev-тест entitlement.
 */

import { useCallback, useState } from 'react';
import { LobbyBackButton } from './LobbyEntryActions';
import { StarBrandGlyph } from './StarBrandGlyph';
import { useAuth } from '../contexts/AuthContext';
import { useT } from '../i18n';
import {
  getPremiumSessionOverride,
  isPremiumDevToggleVisible,
  isPremiumEntitled,
  setPremiumSessionOverride,
} from '../lib/premiumEntitlement';

export type PremiumPageProps = {
  onBack: () => void;
  onOpenSupport?: () => void;
  onSignIn?: () => void;
  /** Уже с Premium — быстрый путь в кабинет / партии. */
  onOpenCabinet?: () => void;
};

const BENEFIT_KEYS = [
  'benefitHistory',
  'benefitJoker',
  'benefitNameBadge',
  'benefitFrames',
  'benefitAiAvatar',
] as const;

export function PremiumPage({ onBack, onOpenSupport, onSignIn, onOpenCabinet }: PremiumPageProps) {
  const t = useT();
  const { user } = useAuth();
  const [tick, setTick] = useState(0);
  const entitled = isPremiumEntitled(user?.id);
  const showDev = isPremiumDevToggleVisible();
  const sessionOn = getPremiumSessionOverride();

  const toggleTest = useCallback(() => {
    setPremiumSessionOverride(!getPremiumSessionOverride());
    setTick((n) => n + 1);
  }, []);

  void tick;

  return (
    <div className="premium-page">
      <div className="premium-page__bg" aria-hidden="true">
        <div className="premium-page__aurora" />
        <div className="premium-page__grid" />
        <div className="premium-page__orb premium-page__orb--a" />
        <div className="premium-page__orb premium-page__orb--b" />
      </div>

      <div className="premium-page__shell">
        <header className="premium-page__top">
          <LobbyBackButton onClick={onBack} />
          <p className="premium-page__brand">Up&amp;Down</p>
        </header>

        <main className="premium-page__main">
          <div className="premium-page__hero">
            <div className="premium-page__hero-star" aria-hidden="true">
              <StarBrandGlyph size={56} pulse />
            </div>
            <p className="premium-page__eyebrow">{t('premium.eyebrow')}</p>
            <h1 className="premium-page__title">{t('premium.title')}</h1>
            <p className="premium-page__lead">{t('premium.lead')}</p>
            {entitled ? (
              <p className="premium-page__badge" role="status">
                {t('premium.activeBadge')}
              </p>
            ) : null}
          </div>

          <p className="premium-page__free">{t('premium.freeNote')}</p>

          <ul className="premium-page__benefits">
            {BENEFIT_KEYS.map((key) => (
              <li key={key} className="premium-page__benefit">
                <span className="premium-page__check" aria-hidden="true" />
                <span>{t(`premium.${key}`)}</span>
              </li>
            ))}
          </ul>

          <p className="premium-page__soft">{t('premium.historySoft')}</p>

          <div className="premium-page__cta">
            {!user ? (
              <button
                type="button"
                className="premium-page__btn premium-page__btn--primary"
                onClick={() => onSignIn?.()}
                disabled={!onSignIn}
              >
                {t('premium.ctaSignIn')}
              </button>
            ) : entitled ? (
              <>
                <p className="premium-page__cta-note">{t('premium.ctaActiveNote')}</p>
                {onOpenCabinet ? (
                  <button
                    type="button"
                    className="premium-page__btn premium-page__btn--primary"
                    onClick={() => onOpenCabinet()}
                  >
                    {t('premium.ctaOpenCabinet')}
                  </button>
                ) : null}
              </>
            ) : (
              <button type="button" className="premium-page__btn premium-page__btn--primary" disabled>
                {t('premium.ctaSoon')}
              </button>
            )}

            {onOpenSupport ? (
              <button type="button" className="premium-page__btn premium-page__btn--support" onClick={onOpenSupport}>
                {t('premium.ctaSupport')}
              </button>
            ) : null}
          </div>

          {showDev ? (
            <div className="premium-page__dev">
              <p className="premium-page__dev-label">{t('premium.devLabel')}</p>
              <button type="button" className="premium-page__btn premium-page__btn--dev" onClick={toggleTest}>
                {sessionOn ? t('premium.devOff') : t('premium.devOn')}
              </button>
            </div>
          ) : null}
        </main>
      </div>
    </div>
  );
}

export default PremiumPage;
