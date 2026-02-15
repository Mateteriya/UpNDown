/**
 * Error Boundary — ловит ошибки React и показывает fallback вместо чёрного экрана.
 */

import React, { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      const isAuthReturn = typeof window !== 'undefined' && window.location.hash?.includes('access_token');
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
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: '12px 24px',
              fontSize: 16,
              borderRadius: 8,
              border: '1px solid #334155',
              background: '#1e293b',
              color: '#22d3ee',
              cursor: 'pointer',
            }}
          >
            Обновить страницу
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
