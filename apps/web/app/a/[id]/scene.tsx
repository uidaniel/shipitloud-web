'use client';

import { useEffect, useState } from 'react';

// The "we're reading your product" moment (free growth analysis): a live checklist on the left and, on the right,
// their own site in a browser window being scanned, with what we find (logo, colors, headline, people asking)
// flying out into orbit around a glowing core. Pure SVG + CSS; calm under reduced motion.

const STEPS = [
  { at: 0, label: 'Reading your site' },
  { at: 5, label: 'Pulling your logo and colors' },
  { at: 10, label: 'Checking your landing page' },
  { at: 16, label: 'Finding people talking about your problem' },
  { at: 24, label: 'Picking your channels' },
];
const QUIPS = [
  'Counting your buttons…', 'Reading your headline twice…', 'Sniffing out your brand colors…', 'Asking Hacker News who needs you…',
  'Measuring how clear your page is…', 'Sizing up the competition…', 'Drafting a post in your voice…', 'Almost there, polishing…',
];

export function AnalysingScene({ host, startedAt }: { host: string; startedAt: string }) {
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
  const domain = host.split('/')[0];

  return (
    <div className="az">
      <div className="az-left">
        <p className="fa-k">Free growth analysis · {host}</p>
        <h1 className="fa-h">Reading your product…</h1>
        <ul className="az-steps" aria-live="polite">
          {STEPS.map((s, i) => (
            <li key={s.label} className={i < current ? 'done' : i === current ? 'now' : ''}>
              <span className="m">{i < current ? '✓' : i === current ? <span className="az-spin" /> : ''}</span>{s.label}
            </li>
          ))}
        </ul>
        <div className="az-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}><i style={{ width: `${pct}%` }} /></div>
        <p className="az-quip" key={quip}>{quip}</p>
      </div>

      <div className="az-stage" aria-hidden="true">
        <div className="az-glow" />
        <div className="az-browser">
          <div className="az-chrome"><span /><span /><span /><b>{domain}</b></div>
          <div className="az-page">
            <div className="az-sk w60 h" /><div className="az-sk w80" /><div className="az-sk w70" />
            <div className="az-row"><div className="az-sk btn" /><div className="az-sk btn ghost" /></div>
            <div className="az-cards"><div className="az-sk card" /><div className="az-sk card" /><div className="az-sk card" /></div>
            <div className="az-beam" />
          </div>
        </div>
        <div className={`az-core ${current >= 4 ? 'hot' : ''}`}><span>{current >= 4 ? 'score' : 'AI'}</span></div>
        <div className="az-orbit o1"><div className="az-chip logo"><img src={`https://${domain}/favicon.ico`} alt="" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} /><em>logo</em></div></div>
        <div className="az-orbit o2"><div className="az-chip swatch"><i /><i /><i /></div></div>
        <div className="az-orbit o3"><div className="az-chip text">“Your headline”</div></div>
        <div className="az-orbit o4"><div className="az-chip bubble">anyone know a tool for…?</div></div>
        <div className="az-orbit o5"><div className="az-chip text">Reels · TikTok · X</div></div>
        <svg className="az-sparks" viewBox="0 0 400 400">{Array.from({ length: 14 }, (_, i) => <circle key={i} cx={200 + 170 * Math.cos(i * 0.45)} cy={200 + 170 * Math.sin(i * 0.45)} r={i % 3 ? 1.2 : 2} style={{ animationDelay: `${i * 0.35}s` }} />)}</svg>
      </div>
    </div>
  );
}
