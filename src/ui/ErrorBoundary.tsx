/**
 * Error Boundary — ловит ошибки React и показывает fallback вместо чёрного экрана.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { hardReloadPage, resetPwaCacheAndReload } from '../lib/pwaStaleRecovery';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  busy: 'reload' | 'reset' | null;
}

function runHardReload(clearCache: boolean): void {
  if (clearCache) {
    void resetPwaCacheAndReload().catch(() => {
      window.__updownHardReload?.(true);
      hardReloadPage();
    });
    return;
  }
  hardReloadPage();
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, busy: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isAuthReturn = typeof window !== 'undefined' && window.location.hash?.includes('access_token');
      const busy = this.state.busy;
      return (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: '#0f172a',
            color: '#e2e8f0',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 18, marginBottom: 12 }}>Что-то пошло не так</p>
          {isAuthReturn && (
            <p style={{ fontSize: 15, color: '#94a3b8', marginBottom: 20 }}>
              Возможно, ошибка при возврате после входа. Попробуйте обновить страницу.
            </p>
          )}
          <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16, maxWidth: 360, lineHeight: 1.45 }}>
            Если после деплоя приложение «застряло», нажмите сброс кэша — это снимет старый Service Worker.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                this.setState({ busy: 'reload' });
                runHardReload(false);
              }}
              style={{
                padding: '12px 24px',
                fontSize: 16,
                borderRadius: 8,
                border: '1px solid #334155',
                background: '#1e293b',
                color: '#22d3ee',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy && busy !== 'reload' ? 0.6 : 1,
              }}
            >
              {busy === 'reload' ? 'Обновляем…' : 'Обновить страницу'}
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                this.setState({ busy: 'reset' });
                runHardReload(true);
              }}
              style={{
                padding: '10px 20px',
                fontSize: 14,
                borderRadius: 8,
                border: '1px solid #334155',
                background: 'transparent',
                color: '#94a3b8',
                cursor: busy ? 'wait' : 'pointer',
                opacity: busy && busy !== 'reset' ? 0.6 : 1,
              }}
            >
              {busy === 'reset' ? 'Сбрасываем кэш…' : 'Сбросить кэш приложения'}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
