/**
 * Контекст темы — зафиксирован на «Стандарт».
 * Не допускаем авто-переключение по системной тёмной теме и не используем неоновую тему.
 * Отдельно: ручной «замок» палитры карт под кривые WebView (см. cardPaletteLock).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  applyCardPaletteLockToDocument,
  readCardPaletteLockEnabled,
  toggleCardPaletteLockStored,
} from '../lib/cardPaletteLock';

export type Theme = 'standard' | 'neon';

const STORAGE_KEY = 'updown-theme';

function applyThemeToDocument() {
  const html = document.documentElement;
  html.classList.remove('theme-standard', 'theme-neon');
  html.classList.add('theme-standard');
  html.setAttribute('data-theme', 'standard');
  const meta = document.querySelector('meta[name="color-scheme"]');
  if (meta) meta.setAttribute('content', 'only light');
  try {
    localStorage.setItem(STORAGE_KEY, 'standard');
  } catch {
    /* ignore */
  }
}

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (theme: Theme) => void;
  /** Жёсткая палитра карт (долгое нажатие на лампу подсветки) — только CardView, без фильтра на всё приложение. */
  cardPaletteLock: boolean;
  toggleCardPaletteLock: () => boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('standard');
  const [cardPaletteLock, setCardPaletteLock] = useState(() =>
    typeof window === 'undefined' ? false : readCardPaletteLockEnabled(),
  );

  useEffect(() => {
    applyThemeToDocument();
    if (theme !== 'standard') setThemeState('standard');
  }, [theme]);

  useEffect(() => {
    const on = readCardPaletteLockEnabled();
    setCardPaletteLock(on);
    applyCardPaletteLockToDocument(on);
  }, []);

  const toggleCardPaletteLock = useCallback(() => {
    const next = toggleCardPaletteLockStored();
    setCardPaletteLock(next);
    applyThemeToDocument();
    return next;
  }, []);

  const setTheme = useCallback((next: Theme) => {
    void next;
    setThemeState('standard');
    try {
      localStorage.setItem(STORAGE_KEY, 'standard');
    } catch {
      /* ignore */
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState('standard');
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        toggleTheme,
        setTheme,
        cardPaletteLock,
        toggleCardPaletteLock,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
