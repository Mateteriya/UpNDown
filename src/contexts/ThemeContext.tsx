/**
 * Контекст темы приложения и темы карт (моб./планшет).
 * UI-тема зафиксирована на «Стандарт»; карты — 4 режима (лампа, удержание).
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  applyCardThemeToDocument,
  cycleCardThemeStored,
  readCardTheme,
  type CardTheme,
  CARD_THEME_LABEL,
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
  /** Тема карт: стандарт / тёмная / легаси / нео (см. cardThemeSpec). Моб. и планшет; ПК-стол без смены листа. */
  cardTheme: CardTheme;
  cardThemeLabel: string;
  /** true, если не «Стандарт» — подсветка лампы */
  cardPaletteLock: boolean;
  cycleCardTheme: () => CardTheme;
  /** @deprecated используйте cycleCardTheme */
  toggleCardPaletteLock: () => boolean;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('standard');
  const [cardTheme, setCardTheme] = useState<CardTheme>(() =>
    typeof window === 'undefined' ? 'standard' : readCardTheme(),
  );
  const cardPaletteLock = cardTheme !== 'standard';

  useEffect(() => {
    applyThemeToDocument();
    if (theme !== 'standard') setThemeState('standard');
  }, [theme]);

  useEffect(() => {
    const initial = readCardTheme();
    setCardTheme(initial);
    applyCardThemeToDocument(initial);
  }, []);

  const cycleCardTheme = useCallback(() => {
    const next = cycleCardThemeStored();
    setCardTheme(next);
    applyThemeToDocument();
    return next;
  }, []);

  const toggleCardPaletteLock = useCallback(() => {
    const next = cycleCardTheme();
    return next !== 'standard';
  }, [cycleCardTheme]);

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
        cardTheme,
        cardThemeLabel: CARD_THEME_LABEL[cardTheme],
        cardPaletteLock,
        cycleCardTheme,
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

export type { CardTheme };
