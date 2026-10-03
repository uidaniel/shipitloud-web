'use client';

import { useEffect, useState } from 'react';
import '@/app/space.css';
import { PlatformIcon, type Platform } from '@/components/space/platform-icons';

// The "we're reading your product" moment (free analysis and setup): a live checklist on the left and, on the right,
// their product as a glowing planet with a radar sweep, and the places their users hang out orbiting it.
// Pure SVG + CSS; still under reduced motion.

const DEFAULT_STEPS = [
  { at: 0, label: 'Reading your site' },
  { at: 5, label: 'Pulling your logo and colors' },
  { at: 10, label: 'Checking your landing page' },
  { at: 16, label: 'Finding people talking about your problem' },
  { at: 24, label: 'Picking your channels' },
];
// Where their users might be: platform marks orbiting their product on three rings (radius, start angle, seconds per lap).
const ORBITERS: { p: Platform; r: number; a: number; t: number; s: number }[] = [
  { p: 'reddit', r: 110, a: 20, t: 26, s: 30 }, { p: 'x', r: 110, a: 200, t: 26, s: 28 },
  { p: 'linkedin', r: 160, a: 110, t: 38, s: 32 }, { p: 'hn', r: 160, a: 250, t: 38, s: 30 }, { p: 'producthunt', r: 160, a: 340, t: 38, s: 30 },
  { p: 'tiktok', r: 210, a: 60, t: 52, s: 32 }, { p: 'instagram', r: 210, a: 170, t: 52, s: 32 }, { p: 'bluesky', r: 210, a: 300, t: 52, s: 30 },
];
const QUIPS = [
  'Counting your buttons…', 'Reading your headline twice…', 'Sniffing out your brand colors…', 'Asking Hacker News who needs you…',
  'Measuring how clear your page is…', 'Sizing up the competition…', 'Drafting a post in your voice…', 'Almost there, polishing…',
];

export function AnalysingScene({ host, startedAt, kicker, title = 'Reading your product…', steps = DEFAULT_STEPS }: { host: string; startedAt: string; kicker?: string; title?: string; steps?: { at: number; label: string }[] }) {
  const STEPS = steps;
  // Starts at 0 on the server and in the first render, then follows the real clock (no hydration mismatch).
  const [t, setT] = useState(0);
  useEffect(() => {
    setT(Math.max(0, (Date.now() - Date.parse(startedAt)) / 1000));
    const i = setInterval(() => setT(Math.max(0, (Date.now() - Date.parse(startedAt)) / 1000)), 250);
    return () => clearInterval(i);
  }, [startedAt]);
  const current = STEPS.reduce((n, s, i) => (t >= s.at ? i : n), 0);
  // Eases towards 95% and waits there for the real result.
  const pct = Math.min(95, Math.round(100 * (1 - Math.exp(-t / 14))));
  const quip = QUIPS[Math.floor(t / 3.2) % QUIPS.length];
  const domain = host.split('/')[0] ?? host;
  // Their favicon, shown only once it has really loaded (no broken-image icon for sites without one).
  const [icon, setIcon] = useState<string | null>(null);
  useEffect(() => {
    const img = new Image();
    img.onload = () => { if (img.naturalWidth > 0) setIcon(img.src); };
    img.src = `https://${domain}/favicon.ico`;
  }, [domain]);

  return (
    <div className="az">
      <div className="az-left">
        <p className="fa-k">{kicker ?? `Free growth analysis · ${host}`}</p>
        <h1 className="fa-h">{title}</h1>
        <ul className="az-steps" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.label} className={i < current ? 'done' : i === current ? 'now' : ''}>
              <span className="m">{i < current ? '✓' : i === current ? <span className="az-spin" /> : ''}</span>{s.label}
            </li>
          ))}
        </ul>
        <div className="az-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
      </div>

      <div className="az-stage" aria-hidden="true">
        <div className="az2">
          <div className="az2-glow" />
          <svg className="az2-rings" viewBox="0 0 440 440"><circle cx="220" cy="220" r="110" /><circle cx="220" cy="220" r="160" /><circle cx="220" cy="220" r="210" /></svg>
          <div className="az2-sweep" />
          {ORBITERS.map((o) => (
            <div key={o.p} className="az2-orbit" style={{ ['--d' as string]: `${o.r * 2 / 4.4}%`, ['--a' as string]: `${o.a}deg`, ['--t' as string]: `${o.t}s` }}>
              <span className="az2-logo"><PlatformIcon name={o.p} size={o.s} /></span>
            </div>
          ))}
          <div className="az2-planet">
            <span className="az2-face">{icon ? <img src={icon} alt="" /> : <b>{domain.slice(0, 1).toUpperCase()}</b>}</span>
          </div>
          <div className="az2-card" key={quip}><span className="az-spin" />{quip}</div>
        </div>
      </div>
    </div>
  );
}
