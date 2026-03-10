import { useState, useCallback, useEffect } from 'react';

type Theme = 'dark' | 'light';

const STORAGE_KEY = 'becxus-theme';

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
  } catch {}
  return 'dark';
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  if (theme === 'dark') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  // Update meta theme-color for mobile browser chrome
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute('content', theme === 'dark' ? '#0a0a0a' : '#f8fafc');
  }
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(getStoredTheme);

  // Sync class on mount (in case inline script didn't run)
  useEffect(() => {
    applyTheme(theme);
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {}
    applyTheme(newTheme);
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      applyTheme(next);
      return next;
    });
  }, []);

  return { theme, setTheme, toggleTheme, isDark: theme === 'dark' } as const;
}
