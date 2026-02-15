/**
 * Контекст темы — гибрид: следует за системой, переопределение через кнопку сохраняется в localStorage.
 * Темы: «Стандарт» (светлая) и «Неоновая» (тёмная с неоновой подсветкой).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type Theme = 'standard' | 'neon';

const STORAGE_KEY = 'updown-theme';

function getSystemTheme(): Theme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'neon';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'neon' : 'standard';
}

function getStoredTheme(): Theme | null {
  if (typeof localStorage === 'undefined') return null;
  const v = localStorage.getItem(STORAGE_KEY);
  if (v === 'standard' || v === 'neon') return v;
  if (v === 'light') return 'standard';
  if (v === 'dark') return 'neon';
  return null;
}

function applyThemeToDocument(theme: Theme) {
  const html = document.documentElement;
  html.classList.remove('theme-standard', 'theme-neon');
  html.classList.add(`theme-${theme}`);
  html.setAttribute('data-theme', theme);
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', theme === 'standard' ? 'only light' : 'dark');
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = getStoredTheme();
    if (stored) return stored;
    return getSystemTheme();
  });

  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      if (getStoredTheme() !== null) return;
      const next = mq.matches ? 'neon' : 'standard';
      setThemeState(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'neon' ? 'standard' : 'neon');
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
