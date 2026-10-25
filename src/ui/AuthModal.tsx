/**
 * Модалка входа/регистрации через Supabase Auth.
 * Стиль — стекло / Orbitron, как ПК-кабинет.
 */

import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isAuthNetworkError, isAuthStorageFullError } from '../lib/authErrors';
import {
  OAUTH_LINE,
  OAUTH_VKID,
  OAUTH_YANDEX,
  listVisibleOAuthProviders,
  type AppOAuthProvider,
} from '../lib/oauthProviders';
import { useT, type MsgKey, type TFunc } from '../i18n';

function authErrorText(err: Error | null | undefined, t: TFunc, fallbackKey: MsgKey): string {
  if (!err) return t(fallbackKey);
  if (isAuthNetworkError(err)) return t('auth.networkBusy');
  if (isAuthStorageFullError(err)) return t('auth.storageFull');
  const msg = String(err.message || '');
  if (/exceeded the quota|QuotaExceeded|code-verifier/i.test(msg)) {
    return t('auth.storageFull');
  }
  if (
    /failed to fetch|networkerror|load failed|timed?\s*out|abort|err_internet|err_name_not_resolved/i.test(
      msg,
    )
  ) {
    return t('auth.needInternet');
  }
  return msg || t(fallbackKey);
}

export type AuthMode = 'login' | 'register';

export interface AuthModalProps {
  mode: AuthMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}

const MIN_PASSWORD_LENGTH = 6;

const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

const YandexIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <rect width="24" height="24" rx="6" fill="#FC3F1D" />
    <path
      fill="#fff"
      d="M13.2 6.2h-1.7c-2.1 0-3.2 1.1-3.2 2.8 0 1.9 0.9 2.8 2.7 3.9l1.5.9-4.3 4.9H10l3.7-4.3V18h1.9V6.2h-2.4zm-1.5 5.3c-1.2-.8-1.7-1.4-1.7-2.4 0-.9.5-1.4 1.5-1.4h.3v3.8h-.1z"
    />
  </svg>
);

const VkIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <rect width="24" height="24" rx="6" fill="#0077FF" />
    <path
      fill="#fff"
      d="M12.8 17.5h1.1s.3 0 .5-.2c.1-.1.1-.4.1-.4s0-1.3.6-1.5c.6-.2 1.4 1.3 2.2 1.8.6.4 1.1.3 1.1.3l2.2-.03s1.2-.07.6-.97c-.05-.07-.34-.7-1.74-2-.1-.1-.17-.18-.05-.3.1-.1.95-.9 1.08-1.3.13-.4-.1-.6-.1-.6h-2.2s-.16-.02-.28.05c-.12.07-.2.22-.2.22s-.36.95-.84 1.76c-.1.17-.2.24-.33.15-.2-.13-.15-.53-.15-1.02 0-1.12.17-1.58-.33-1.7-.16-.04-.28-.07-.7-.07-.53 0-1 .01-1.26.2-.17.13-.12.4-.12.4s.1.75.2 1.02c.14.4-.1.48-.22.5-.2.04-.47-.16-.95-.75-.49-.6-.81-1.26-.81-1.26s-.07-.16-.18-.25c-.14-.1-.33-.14-.33-.14H9.1s-.4.01-.54.18c-.12.15 0 .45 0 .45s1.7 4 3.62 6.02c1.76 1.85 3.76 1.73 3.76 1.73z"
    />
  </svg>
);

const AppleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z" />
  </svg>
);

const LineIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <rect width="24" height="24" rx="6" fill="#06C755" />
    <path
      fill="#fff"
      d="M12 5.5c-3.87 0-7 2.54-7 5.66 0 2.8 2.48 5.15 5.83 5.58.23.05.54.15.62.35.07.18.05.46.02.64l-.1.61c-.03.18-.14.7.61.38 1.01-.42 5.45-3.21 7.44-5.5C20.7 11.4 19.5 5.5 12 5.5zm-3.3 7.6H7.5V9.4h1.2v3.7zm2.1 0h-1.15l-.02-3.7h1.17v2.55l1.9-2.55h1.25l-1.95 2.55 2.1 2.7h-1.35l-1.7-2.25-.35.45v1.8zm4.35 0h-1.15V9.4h1.15v3.7zm3.05 0h-2.55V9.4h2.55v.95h-1.4v.55h1.3v.9h-1.3v.55h1.4v.95z"
    />
  </svg>
);

const PENDING_NAME_KEY_PREFIX = 'updown_pending_name_';

export function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  const t = useT();
  const { signIn, signUp, signInWithOAuth, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);
  const errorRef = useRef<HTMLParagraphElement | null>(null);
  const submittingRef = useRef(false);
  const oauthProviders = listVisibleOAuthProviders();

  const ignoreBackdropUntilRef = useRef(0);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      /**
       * Edge/Chrome: Backspace в пустом INPUT = history.back() → popstate → «Главная»,
       * модалка закрывается. Блокируем навигацию, пока открыт auth.
       */
      if (e.key !== 'Backspace' && e.key !== 'BrowserBack') return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || el?.isContentEditable) {
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          const input = el as HTMLInputElement | HTMLTextAreaElement;
          const start = input.selectionStart ?? 0;
          const end = input.selectionEnd ?? 0;
          /* Каретка в начале / пустое поле: Backspace не меняет текст, но Edge уходит «назад». */
          if (e.key === 'Backspace' && start === 0 && end === 0) {
            e.preventDefault();
          }
        }
        return;
      }
      e.preventDefault();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  const markFieldBlur = () => {
    /* После blur с поля клавиатура на мобиле двигает вёрстку — клик часто попадает в backdrop. */
    ignoreBackdropUntilRef.current = Date.now() + 450;
  };

  const onBackdropClick = (e: ReactMouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (Date.now() < ignoreBackdropUntilRef.current) return;
    onClose();
  };

  const handleOAuth = async (provider: AppOAuthProvider) => {
    if (!configured || oauthLoading) return;
    setError(null);
    setOauthLoading(provider);
    try {
      const { error: authError } = await signInWithOAuth(provider);
      if (authError) {
        setError(authErrorText(authError, t, 'auth.loginError'));
        setOauthLoading(null);
        return;
      }
      /* Успех → уход на IdP; спиннер/баннер оставляем до смены страницы. */
    } catch (e) {
      setError(authErrorText(e instanceof Error ? e : null, t, 'auth.loginError'));
      setOauthLoading(null);
    }
  };

  const oauthProviderLabel = (provider: string) => {
    if (provider === OAUTH_YANDEX) return t('auth.oauthYandex');
    if (provider === OAUTH_VKID) return t('auth.oauthVkid');
    if (provider === OAUTH_LINE) return t('auth.oauthLine');
    if (provider === 'apple') return t('auth.oauthApple');
    if (provider === 'google') return 'Google';
    if (provider === 'github') return t('auth.oauthGithub');
    return provider;
  };

  const oauthBtnClass = (provider: AppOAuthProvider) => {
    if (provider === OAUTH_YANDEX) return 'lk-modal__oauth-btn--yandex';
    if (provider === OAUTH_VKID) return 'lk-modal__oauth-btn--vkid';
    if (provider === OAUTH_LINE) return 'lk-modal__oauth-btn--line';
    if (provider === 'apple') return 'lk-modal__oauth-btn--apple';
    if (provider === 'google') return 'lk-modal__oauth-btn--google';
    if (provider === 'github') return 'lk-modal__oauth-btn--github';
    return '';
  };

  const oauthIcon = (provider: AppOAuthProvider) => {
    if (provider === OAUTH_YANDEX) return <YandexIcon />;
    if (provider === OAUTH_VKID) return <VkIcon />;
    if (provider === OAUTH_LINE) return <LineIcon />;
    if (provider === 'apple') return <AppleIcon />;
    if (provider === 'google') return <GoogleIcon />;
    if (provider === 'github') return <GitHubIcon />;
    return null;
  };

  const handleSubmit = async (e?: { preventDefault?: () => void }) => {
    e?.preventDefault?.();
    if (loading || submittingRef.current) return;
    setError(null);
    setSuccessMessage(null);
    const em = email.trim().toLowerCase();
    if (!em) {
      setError(t('auth.enterEmail'));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError(t('auth.badEmail'));
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(t('auth.passwordMin', { n: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError(t('auth.passwordMismatch'));
      return;
    }
    if (mode === 'register') {
      const nick = displayName.trim();
      if (!nick) {
        setError(t('auth.needNick'));
        return;
      }
      if (nick.length > 17) {
        setError(t('auth.nickMax'));
        return;
      }
    }
    if (!configured) {
      setSuccessMessage(t('auth.notConfigured'));
      return;
    }
    submittingRef.current = true;
    setLoading(true);
    if (mode === 'register') {
      try {
        sessionStorage.setItem(PENDING_NAME_KEY_PREFIX + em, displayName.trim().slice(0, 17));
      } catch {
        /* ignore */
      }
    }
    try {
      if (mode === 'login') {
        const { error: authError } = await signIn(em, password);
        if (authError) {
          setError(authErrorText(authError, t, 'auth.authError'));
          return;
        }
        onClose();
        return;
      }
      const { error: authError, needsEmailConfirm } = await signUp(em, password);
      if (authError) {
        const msg = String(authError.message || '');
        if (/уже зарегистрирован|already registered|already been registered/i.test(msg)) {
          setError(t('auth.alreadyRegistered'));
        } else {
          setError(authErrorText(authError, t, 'auth.authError'));
        }
        return;
      }
      if (needsEmailConfirm === false) {
        setSuccessMessage(t('auth.registerDoneNoMail'));
        return;
      }
      setSuccessMessage(em ? t('auth.checkEmail', { email: em }) : t('auth.checkEmailNoAddr'));
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div
        className="lk-modal lk-modal--auth"
        onClick={onBackdropClick}
        role="dialog"
        aria-modal="true"
      >
        <div className="lk-modal__panel lk-modal__panel--auth" onClick={(e) => e.stopPropagation()}>
          <p className="lk-modal__success-text">{successMessage}</p>
          <p className="lk-modal__hint lk-modal__hint--center lk-modal__hint--auth-success">
            {configured
              ? t('auth.afterConfirm')
              : t('auth.playOffline')}
          </p>
          <div className="lk-modal__success-actions">
            <button
              type="button"
              className="lk-modal__ghost-btn"
              onClick={() => {
                setSuccessMessage(null);
                setError(null);
              }}
            >
              {t('auth.back')}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`lk-modal lk-modal--auth${mode === 'register' ? ' lk-modal--top' : ''}`}
      onClick={onBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        className={`lk-modal__panel lk-modal__panel--auth${oauthLoading ? ' lk-modal__panel--oauth-busy' : ''}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="lk-modal__head lk-modal__head--auth">
          <h2 id="auth-modal-title" className="lk-modal__title">
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </h2>
          <button
            type="button"
            className="lk-modal__close"
            onClick={onClose}
            aria-label={t('common.close')}
            disabled={!!oauthLoading}
          >
            ×
          </button>
        </div>

        {oauthLoading ? (
          <div className="lk-modal__oauth-pending" role="status" aria-live="polite">
            <span className="lk-modal__oauth-pending__pulse" aria-hidden />
            <p className="lk-modal__oauth-pending__title">
              {t('auth.oauthPending', { provider: oauthProviderLabel(oauthLoading) })}
            </p>
            <p className="lk-modal__oauth-pending__hint">{t('auth.oauthPendingHint')}</p>
          </div>
        ) : null}

        <div className="lk-modal__auth-cols">
          <div className="lk-modal__auth-col lk-modal__auth-col--oauth">
            <div className="lk-modal__oauth">
              {oauthProviders.map((provider) => (
                <button
                  key={provider}
                  type="button"
                  className={[
                    'lk-modal__oauth-btn',
                    oauthBtnClass(provider),
                    oauthLoading === provider ? 'lk-modal__oauth-btn--pending' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => void handleOAuth(provider)}
                  disabled={!configured || !!oauthLoading || loading}
                  title={provider === OAUTH_VKID ? t('auth.oauthVkidHint') : undefined}
                  aria-busy={oauthLoading === provider}
                >
                  {oauthIcon(provider)}
                  {oauthLoading === provider
                    ? t('auth.oauthRedirecting')
                    : oauthProviderLabel(provider)}
                </button>
              ))}
            </div>

            <div className="lk-modal__divider">{t('auth.orEmail')}</div>
          </div>

          <div className="lk-modal__auth-col lk-modal__auth-col--form">
            {/* noValidate: на Android WebView нативная проверка email часто глотает submit без сообщения */}
            <form
              className="lk-modal__form"
              onSubmit={(e) => void handleSubmit(e)}
              noValidate
              autoComplete="on"
              method="post"
              action="#"
            >
              <div className="lk-modal__field">
                <label className="lk-modal__label" htmlFor="auth-email">
                  Email
                </label>
                <input
                  id="auth-email"
                  name="email"
                  className="lk-modal__input"
                  type="email"
                  inputMode="email"
                  enterKeyHint="next"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onBlur={markFieldBlur}
                  autoComplete={mode === 'login' ? 'username' : 'email'}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="you@example.com"
                />
              </div>
              <div className="lk-modal__field">
                <label className="lk-modal__label" htmlFor="auth-password">
                  {t('auth.password')}
                </label>
                <input
                  id="auth-password"
                  name="password"
                  className="lk-modal__input"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onBlur={markFieldBlur}
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  placeholder={t('auth.passwordPlaceholder', { n: MIN_PASSWORD_LENGTH })}
                />
              </div>
              {mode === 'register' ? (
                <>
                  <div className="lk-modal__field">
                    <label className="lk-modal__label" htmlFor="auth-display-name">
                      {t('auth.nickLabel')}{' '}
                      <span className="lk-modal__label-note">{t('auth.nickNote')}</span>
                    </label>
                    <input
                      id="auth-display-name"
                      name="nickname"
                      className="lk-modal__input"
                      type="text"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      onBlur={markFieldBlur}
                      autoComplete="nickname"
                      placeholder={t('auth.nickPlaceholder')}
                      maxLength={17}
                    />
                  </div>
                  <div className="lk-modal__field">
                    <label className="lk-modal__label" htmlFor="auth-confirm">
                      {t('auth.confirmPassword')}
                    </label>
                    <input
                      id="auth-confirm"
                      name="password-confirm"
                      className="lk-modal__input"
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={markFieldBlur}
                      autoComplete="new-password"
                      placeholder={t('auth.confirmPlaceholder')}
                    />
                  </div>
                </>
              ) : null}
              {error ? (
                <p className="lk-modal__error" ref={errorRef} role="alert">
                  {error}
                </p>
              ) : null}
              <button
                type="button"
                className="lk-modal__submit"
                disabled={loading || !!oauthLoading}
                onClick={() => void handleSubmit()}
              >
                {loading
                  ? mode === 'login'
                    ? t('auth.signingIn')
                    : t('auth.registering')
                  : mode === 'login'
                    ? t('auth.submitLogin')
                    : t('auth.submitRegister')}
              </button>
            </form>

            <p className="lk-modal__switch">
              {mode === 'login' ? t('auth.noAccount') : t('auth.hasAccount')}
              <button
                type="button"
                className="lk-modal__switch-btn"
                onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
              >
                {mode === 'login' ? t('auth.submitRegister') : t('auth.submitLogin')}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
