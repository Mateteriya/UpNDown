/**
 * Модалка входа/регистрации через Supabase Auth.
 * Если Supabase не настроен — показывается заглушка «Сервер в разработке».
 */

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export type AuthMode = 'login' | 'register';

export interface AuthModalProps {
  mode: AuthMode;
  onClose: () => void;
  onSwitchMode: (mode: AuthMode) => void;
}

const MIN_PASSWORD_LENGTH = 6;

/** Иконка GitHub (официальный марк) */
const GitHubIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
  </svg>
);

/** Иконка Google (цветной G) */
const GoogleIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden>
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
  </svg>
);

export function AuthModal({ mode, onClose, onSwitchMode }: AuthModalProps) {
  const { signIn, signUp, signInWithOAuth, configured } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [oauthLoading, setOauthLoading] = useState<string | null>(null);

  const handleOAuth = async (provider: 'github' | 'google') => {
    if (!configured) return
    setError(null)
    setOauthLoading(provider)
    const { error: authError } = await signInWithOAuth(provider)
    setOauthLoading(null)
    if (authError) setError(authError.message || 'Ошибка входа')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMessage(null);
    const em = email.trim().toLowerCase();
    if (!em) {
      setError('Введите email');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      setError('Некорректный email');
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Пароль не менее ${MIN_PASSWORD_LENGTH} символов`);
      return;
    }
    if (mode === 'register' && password !== confirmPassword) {
      setError('Пароли не совпадают');
      return;
    }
    if (!configured) {
      setSuccessMessage('Сервер не настроен. Добавьте VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY в .env.local');
      return;
    }
    setLoading(true);
    const { error: authError } = mode === 'login'
      ? await signIn(em, password)
      : await signUp(em, password);
    setLoading(false);
    if (authError) {
      setError(authError.message || 'Ошибка авторизации');
      return;
    }
    if (mode === 'login') {
      onClose();
    } else {
      setSuccessMessage('Проверьте почту — на неё отправлена ссылка для подтверждения.');
    }
  };

  if (successMessage) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 10000,
          padding: 20,
        }}
        onClick={(e) => e.target === e.currentTarget && onClose()}
        role="dialog"
        aria-modal="true"
      >
        <div
          style={{
            background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
            borderRadius: 16,
            border: '1px solid rgba(148, 163, 184, 0.35)',
            padding: 32,
            maxWidth: 360,
            textAlign: 'center',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p style={{ margin: '0 0 16px', fontSize: 16, color: '#e2e8f0' }}>
            {successMessage}
          </p>
          <p style={{ margin: '0 0 20px', fontSize: 14, color: '#94a3b8' }}>
            {configured ? 'После подтверждения войдите через «Вход».' : 'Пока играйте офлайн — рейтинг сохраняется на устройстве.'}
          </p>
          <button
            type="button"
            onClick={() => { setSuccessMessage(null); setError(null); }}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#334155',
              color: '#f8fafc',
              cursor: 'pointer',
            }}
          >
            Назад
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 10000,
        padding: 20,
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <div
        style={{
          background: 'linear-gradient(180deg, #1e293b 0%, #0f172a 100%)',
          borderRadius: 16,
          border: '1px solid rgba(148, 163, 184, 0.35)',
          boxShadow: '0 24px 48px rgba(0,0,0,0.4)',
          maxWidth: 360,
          width: '100%',
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: -8 }}>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: '#94a3b8',
              fontSize: 24,
              lineHeight: 1,
              cursor: 'pointer',
              padding: 4,
            }}
            aria-label="Закрыть"
          >
            ×
          </button>
        </div>
        <h2 id="auth-modal-title" style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 700, color: '#f1f5f9', textAlign: 'center' }}>
          {mode === 'login' ? 'Вход' : 'Регистрация'}
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <button
            type="button"
            onClick={() => handleOAuth('github')}
            disabled={!configured || !!oauthLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 500,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#24292f',
              color: '#f0f6fc',
              cursor: configured && !oauthLoading ? 'pointer' : 'not-allowed',
              opacity: configured && !oauthLoading ? 1 : 0.7,
            }}
          >
            <GitHubIcon />
            {oauthLoading === 'github' ? '...' : 'GitHub'}
          </button>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={!configured || !!oauthLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              padding: '12px 20px',
              fontSize: 15,
              fontWeight: 500,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#fff',
              color: '#1f2937',
              cursor: configured && !oauthLoading ? 'pointer' : 'not-allowed',
              opacity: configured && !oauthLoading ? 1 : 0.7,
            }}
          >
            <GoogleIcon />
            {oauthLoading === 'google' ? '...' : 'Google'}
          </button>
        </div>
        <p style={{ margin: '0 0 16px', fontSize: 13, color: '#64748b', textAlign: 'center' }}>
          или через email
        </p>
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label htmlFor="auth-email" style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#94a3b8' }}>
              Email
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="you@example.com"
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 16,
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#f8fafc',
                boxSizing: 'border-box',
              }}
            />
          </div>
          <div>
            <label htmlFor="auth-password" style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#94a3b8' }}>
              Пароль
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={`Не менее ${MIN_PASSWORD_LENGTH} символов`}
              style={{
                width: '100%',
                padding: '10px 12px',
                fontSize: 16,
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#0f172a',
                color: '#f8fafc',
                boxSizing: 'border-box',
              }}
            />
          </div>
          {mode === 'register' && (
            <div>
              <label htmlFor="auth-confirm" style={{ display: 'block', marginBottom: 4, fontSize: 14, color: '#94a3b8' }}>
                Подтвердите пароль
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="Повторите пароль"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  fontSize: 16,
                  borderRadius: 8,
                  border: '1px solid #334155',
                  background: '#0f172a',
                  color: '#f8fafc',
                  boxSizing: 'border-box',
                }}
              />
            </div>
          )}
          {error && <p style={{ margin: 0, fontSize: 14, color: '#f87171' }}>{error}</p>}
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              fontWeight: 600,
              borderRadius: 8,
              border: '1px solid #22d3ee',
              background: 'linear-gradient(180deg, #0e7490 0%, #155e75 100%)',
              color: '#f8fafc',
              cursor: loading ? 'wait' : 'pointer',
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? '...' : mode === 'login' ? 'Войти' : 'Зарегистрироваться'}
          </button>
        </form>
        <p style={{ margin: '16px 0 0', fontSize: 14, color: '#94a3b8', textAlign: 'center' }}>
          {mode === 'login' ? 'Нет аккаунта? ' : 'Уже есть аккаунт? '}
          <button
            type="button"
            onClick={() => onSwitchMode(mode === 'login' ? 'register' : 'login')}
            style={{
              background: 'none',
              border: 'none',
              color: '#22d3ee',
              cursor: 'pointer',
              fontSize: 14,
              textDecoration: 'underline',
            }}
          >
            {mode === 'login' ? 'Зарегистрироваться' : 'Войти'}
          </button>
        </p>
      </div>
    </div>
  );
}
