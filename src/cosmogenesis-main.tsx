/**
 * Отдельная точка входа для демо «Космогенез» — не грузит основное приложение Up&Down.
 */
import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './contexts/ThemeContext';
import { ErrorBoundary } from './ui/ErrorBoundary';
import { CosmogenesisDemoPage } from './ui/CosmogenesisDemoPage';
import './theme-standard.css';
import './index.css';
import './ui/cosmogenesis-demo.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <ErrorBoundary>
    <ThemeProvider>
      <CosmogenesisDemoPage onBack={() => (window.location.href = '/')} />
    </ThemeProvider>
  </ErrorBoundary>
);
