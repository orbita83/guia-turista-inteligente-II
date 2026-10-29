import { useLayoutEffect, useState } from 'react';

const THEME_KEY = 'guia_turista_theme';

function readDarkTheme(): boolean {
  try {
    return localStorage.getItem(THEME_KEY) === 'dark';
  } catch {
    return false;
  }
}

export function useTheme() {
  const [dark, setDark] = useState(readDarkTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch {
      // O tema fica aplicado durante a sessão atual.
    }
    return () => {
      delete document.documentElement.dataset.theme;
    };
  }, [dark]);

  return { dark, toggleTheme: () => setDark((value) => !value) };
}
