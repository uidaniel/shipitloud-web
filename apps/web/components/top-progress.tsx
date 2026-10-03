'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState } from 'react';

// A thin bar across the top of the page while something loads: starts on an internal link click or a form
// action (Submit sends sil:progress), creeps toward 90% and completes when the new route renders or the action ends.
function Bar() {
  const path = usePathname();
  const query = useSearchParams().toString();
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const running = useRef(false);

  useEffect(() => {
    const start = () => {
      if (running.current) return;
      running.current = true;
      setVisible(true);
      setWidth(8);
      timer.current = setInterval(() => setWidth((w) => (w < 90 ? w + (90 - w) * 0.08 : w)), 200);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element).closest?.('a');
      if (!a || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search) return;
      start();
    };
    document.addEventListener('click', onClick, true);
    window.addEventListener('sil:progress', start);
    return () => { document.removeEventListener('click', onClick, true); window.removeEventListener('sil:progress', start); };
  }, []);

  const done = useRef(() => {});
  done.current = () => {
    if (!running.current) return;
    running.current = false;
    if (timer.current) clearInterval(timer.current);
    setWidth(100);
    setTimeout(() => { if (!running.current) { setVisible(false); setWidth(0); } }, 320);
  };
  useEffect(() => { done.current(); }, [path, query]);
  useEffect(() => {
    const end = () => done.current();
    window.addEventListener('sil:progress-done', end);
    return () => window.removeEventListener('sil:progress-done', end);
  }, []);

  return (
    <div className="top-progress" aria-hidden="true" style={{ opacity: visible ? 1 : 0 }}>
      <i style={{ width: `${width}%` }} />
    </div>
  );
}

export function TopProgress() {
  return <Suspense fallback={null}><Bar /></Suspense>;
}
