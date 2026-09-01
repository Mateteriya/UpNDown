import { useI18n } from '../i18n';
import '../styles/language-switch.css';

export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale, t } = useI18n();

  return (
    <div
      className={['lang-switch', className].filter(Boolean).join(' ')}
      role="group"
      aria-label={t('lang.aria')}
    >
      <button
        type="button"
        className={['lang-switch__btn', locale === 'ru' ? 'lang-switch__btn--on' : ''].filter(Boolean).join(' ')}
        aria-pressed={locale === 'ru'}
        onClick={() => setLocale('ru')}
      >
        {t('lang.ru')}
      </button>
      <button
        type="button"
        className={['lang-switch__btn', locale === 'en' ? 'lang-switch__btn--on' : ''].filter(Boolean).join(' ')}
        aria-pressed={locale === 'en'}
        onClick={() => setLocale('en')}
      >
        {t('lang.en')}
      </button>
    </div>
  );
}
