'use client';

import { useEffect, useState } from 'react';

// Lime comets that streak across the sky now and then, left to right or right to left: fast, thin, never in the way. Every 3-8 seconds one
// (sometimes two) crosses a random part of the screen. Off for reduced motion; paused while the tab is hidden.
interface Comet { id: number; top: number; left: number; angle: number; length: number; ms: number; travel: number }

export function Comets() {
  const [comets, setComets] = useState<Comet[]>([]);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let n = 0;
    let timer: ReturnType<typeof setTimeout>;
    const spawn = () => {
      if (!document.hidden) {
        const count = Math.random() < 0.2 ? 2 : 1;
        // Left to right or right to left, always heading slightly down, head first.
        const rtl = Math.random() < 0.5;
        const fresh = Array.from({ length: count }, (_, i) => ({
          id: ++n, top: Math.random() * 55, left: rtl ? 35 + Math.random() * 70 - i * 8 : Math.random() * 70 - 5 + i * 8,
          angle: rtl ? 180 - (18 + Math.random() * 22) : 18 + Math.random() * 22,
          length: 110 + Math.random() * 120, ms: 700 + Math.random() * 500, travel: 520 + Math.random() * 420,
        }));
        setComets((c) => [...c.slice(-4), ...fresh]);
        const longest = Math.max(...fresh.map((f) => f.ms));
        setTimeout(() => setComets((c) => c.filter((x) => !fresh.some((f) => f.id === x.id))), longest + 100);
      }
      timer = setTimeout(spawn, 3000 + Math.random() * 5000);
    };
    timer = setTimeout(spawn, 1200);
    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="comets" aria-hidden="true">
      {comets.map((c) => (
        <i key={c.id} className="comet" style={{ top: `${c.top}%`, left: `${c.left}%`, width: c.length, ['--a' as string]: `${c.angle}deg`, ['--d' as string]: `${c.travel}px`, animationDuration: `${c.ms}ms` }} />
      ))}
    </div>
  );
}
