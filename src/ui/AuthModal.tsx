/**
 * Модалка входа/регистрации через Supabase Auth.
 * Стиль — стекло / Orbitron, как ПК-кабинет.
 */

import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { isAuthNetworkError, isAuthStorageFullError } from '../lib/authErrors';
import {
  OAUTH_VKID,
  OAUTH_YANDEX,
  isVkidOAuthAvailableHere,
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
  /** VK ID · Mail.ru только на публичном домене (не LAN / localhost). */
  const showVkid = isVkidOAuthAvailableHere();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    if (!error) return;
    errorRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [error]);

  const handleOAuth = async (provider: AppOAuthProvider) => {
    if (!configured) return;
    setError(null);
    setOauthLoading(provider);
    try {
      const { error: authError } = await signInWithOAuth(provider);
      if (authError) setError(authErrorText(authError, t, 'auth.loginError'));
    } finally {
      setOauthLoading(null);
    }
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
      const { error: authError } =
        mode === 'login' ? await signIn(em, password) : await signUp(em, password);
      if (authError) {
        setError(authErrorText(authError, t, 'auth.authError'));
        return;
      }
      if (mode === 'login') {
        onClose();
      } else {
        setSuccessMessage(em ? t('auth.checkEmail', { email: em }) : t('auth.checkEmailNoAddr'));
      }
    } finally {
      submittingRef.current = false;
      setLoading(false);
    }
  };

  if (successMessage) {
    return (
      <div
        className="lk-modal"
        onClick={(e) => e.target === e.currentTarget && onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div className="lk-modal__panel" onClick={(e) => e.stopPropagation()}>
          <p className="lk-modal__success-text">{successMessage}</p>
          <p className="lk-modal__hint lk-modal__hint--center" style={{ marginBottom: 16 }}>
            {configured
              ? t('auth.afterConfirm')
              : t('auth.playOffline')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center' }}>
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
      className={`lk-modal${mode === 'register' ? ' lk-modal--top' : ''}`}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div className="lk-modal__panel" onClick={(e) => e.stopPropagation()}>
        <div className="lk-modal__head" style={{ marginBottom: 12 }}>
          <h2 id="auth-modal-title" className="lk-modal__title">
            {mode === 'login' ? t('auth.login') : t('auth.register')}
          </h2>
          <button type="button" className="lk-modal__close" onClick={onClose} aria-label={t('common.close')}>
            ×
          </button>
        </div>

        <div className="lk-modal__oauth">
          <button
            type="button"
            className="lk-modal__oauth-btn lk-modal__oauth-btn--yandex"
            onClick={() => void handleOAuth(OAUTH_YANDEX)}
            disabled={!configured || !!oauthLoading || loading}
          >
            <YandexIcon />
            {oauthLoading === OAUTH_YANDEX ? '…' : t('auth.oauthYandex')}
          </button>
          {showVkid ? (
            <button
              type="button"
              className="lk-modal__oauth-btn lk-modal__oauth-btn--vkid"
              onClick={() => void handleOAuth(OAUTH_VKID)}
              disabled={!configured || !!oauthLoading || loading}
              title={t('auth.oauthVkidHint')}
            >
              <VkIcon />
              {oauthLoading === OAUTH_VKID ? '…' : t('auth.oauthVkid')}
            </button>
          ) : null}
          <button
            type="button"
            className="lk-modal__oauth-btn lk-modal__oauth-btn--google"
            onClick={() => void handleOAuth('google')}
            disabled={!configured || !!oauthLoading || loading}
          >
            <GoogleIcon />
            {oauthLoading === 'google' ? '…' : 'Google'}
          </button>
          <button
            type="button"
            className="lk-modal__oauth-btn lk-modal__oauth-btn--github"
            onClick={() => void handleOAuth('github')}
            disabled={!configured || !!oauthLoading || loading}
          >
            <GitHubIcon />
            {oauthLoading === 'github' ? '…' : 'GitHub'}
          </button>
        </div>

        <div className="lk-modal__divider">{t('auth.orEmail')}</div>

        {/* noValidate: на Android WebView нативная проверка email часто глотает submit без сообщения */}
        <form className="lk-modal__form" onSubmit={(e) => void handleSubmit(e)} noValidate>
          <div className="lk-modal__field">
            <label className="lk-modal__label" htmlFor="auth-email">
              Email
            </label>
            <input
              id="auth-email"
              className="lk-modal__input"
              type="email"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>
          <div className="lk-modal__field">
            <label className="lk-modal__label" htmlFor="auth-password">
              {t('auth.password')}
            </label>
            <input
              id="auth-password"
              className="lk-modal__input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={t('auth.passwordPlaceholder', { n: MIN_PASSWORD_LENGTH })}
            />
          </div>
          {mode === 'register' ? (
            <>
              <div className="lk-modal__field">
                <label className="lk-modal__label" htmlFor="auth-display-name">
                  {t('auth.nickLabel')} <span className="lk-modal__label-note">{t('auth.nickNote')}</span>
                </label>
                <input
                  id="auth-display-name"
                  className="lk-modal__input"
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  autoComplete="username"
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
                  className="lk-modal__input"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
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
  );
}
