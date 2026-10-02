'use client';

import { useEffect, useState } from 'react';

export type Theme = 'dark' | 'light';
export const THEME_EVENT = 'sil:theme';
const KEY = 'sil-theme';
const BAR = { dark: '#07070B', light: '#F5F5F2' } as const;

// Runs in <head> before first paint so the saved theme never flashes. Dark is the default.
export const themeScript = `(function(){try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark')t='dark';document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='light'?'${BAR.light}':'${BAR.dark}');}catch(e){document.documentElement.dataset.theme='dark';}})();`;

export function currentTheme(): Theme {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function applyTheme(t: Theme) {
  document.documentElement.dataset.theme = t;
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.setAttribute('content', BAR[t]));
  try {
    localStorage.setItem(KEY, t);
  } catch {}
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: t }));
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('dark');
  useEffect(() => setTheme(currentTheme()), []);

  const next: Theme = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      type="button"
      className={`theme-toggle ${className}`}
      aria-label={`Switch to ${next} mode`}
      title={`Switch to ${next} mode`}
      onClick={() => { applyTheme(next); setTheme(next); }}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        {theme === 'dark' ? (
          <>
            <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
            <path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
        )}
      </svg>
    </button>
  );
}
