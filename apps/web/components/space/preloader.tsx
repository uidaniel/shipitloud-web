'use client';

import gsap from 'gsap';
import { useEffect, useRef, useState } from 'react';
import { Rocket } from './rocket';

// Plays once per full page load: the rocket sits on the pad while the page actually loads
// (fonts, window load, the 3D scene), then ignites, lifts off and reveals the site.
let played = false;

export const LAUNCHED_EVENT = 'sil:launched';

export function hasLaunched() {
  return played;
}

const steps = [
  { at: 0, label: 'Fuelling up' },
  { at: 0.35, label: 'Systems check' },
  { at: 0.7, label: 'Clearing the pad' },
  { at: 1, label: 'Liftoff' },
];

function finish() {
  played = true;
  document.documentElement.classList.remove('is-loading');
  window.dispatchEvent(new Event(LAUNCHED_EVENT));
}

export function Preloader() {
  const [gone, setGone] = useState(played);
  const root = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const pct = useRef<HTMLSpanElement>(null);
  const label = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (played) return;
    const el = root.current!;
    // A fresh launch always starts on the pad: don't let the browser restore an old scroll position.
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
    window.scrollTo(0, 0);
    document.documentElement.classList.add('is-loading');
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduce) {
      const done = () => gsap.to(el, { autoAlpha: 0, duration: 0.3, onComplete: () => { finish(); setGone(true); } });
      if (document.readyState === 'complete') setTimeout(done, 200);
      else window.addEventListener('load', done, { once: true });
      return;
    }

    // Real readiness signals; the bar never runs ahead of them.
    let target = 0.18;
    let shown = 0;
    let lifted = false;
    const started = performance.now();
    const MIN_MS = 1800;
    const bump = (v: number) => { target = Math.max(target, v); };

    document.fonts?.ready.then(() => bump(0.45)).catch(() => bump(0.45));
    if (document.readyState === 'complete') bump(0.8);
    else window.addEventListener('load', () => bump(0.8), { once: true });
    const onScene = () => bump(0.95);
    window.addEventListener('sil:scene-ready', onScene, { once: true });
    const safety = window.setTimeout(() => bump(0.95), 4000);

    const liftoff = () => {
      lifted = true;
      gsap.timeline({ onComplete: () => { finish(); setGone(true); } })
        .to('.pl-rocket', { x: '+=2', duration: 0.05, repeat: 9, yoyo: true, ease: 'none' })
        .to('.pl-rocket', { '--flame': 2.2, duration: 0.5, ease: 'power2.in' }, 0)
        .to('.pl-smoke i', { scale: 2.4, autoAlpha: 0, duration: 1.2, stagger: 0.03, ease: 'power2.out' }, 0.15)
        .to('.pl-meta', { autoAlpha: 0, y: 12, duration: 0.4 }, 0.2)
        .to('.pl-rocket', { yPercent: -260, duration: 1.05, ease: 'power3.in' }, 0.5)
        .to(el, { autoAlpha: 0, duration: 0.55, ease: 'power2.out' }, 1.2);
    };

    let raf = 0;
    const tick = () => {
      const elapsed = performance.now() - started;
      // Hold just short of 100% until the minimum show time has passed.
      const goal = target >= 0.95 && elapsed > MIN_MS ? 1 : Math.min(target, 0.97);
      shown += (goal - shown) * 0.06;
      if (goal === 1 && shown > 0.995) shown = 1;
      const p = Math.round(shown * 100);
      if (fill.current) fill.current.style.transform = `scaleX(${shown})`;
      if (pct.current) pct.current.textContent = `${p}%`;
      if (label.current) label.current.textContent = [...steps].reverse().find((s) => shown >= s.at)!.label;
      if (shown >= 1 && !lifted) { liftoff(); return; }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(safety);
      window.removeEventListener('sil:scene-ready', onScene);
    };
  }, []);

  if (gone) return null;
  return (
    <div ref={root} className="preloader" role="status" aria-live="polite" aria-label="Loading ShipItLoud">
      <div className="pl-stage">
        <div className="pl-rocket"><Rocket className="pl-rocket-svg" /></div>
        <div className="pl-smoke" aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => <i key={i} style={{ ['--i' as string]: i }} />)}
        </div>
        <span className="pl-pad" aria-hidden="true" />
      </div>
      <div className="pl-meta">
        <div className="pl-row">
          <span ref={label}>Fuelling up</span>
          <span ref={pct} className="pl-pct">0%</span>
        </div>
        <span className="pl-track"><span ref={fill} className="pl-fill" /></span>
      </div>
    </div>
  );
}
