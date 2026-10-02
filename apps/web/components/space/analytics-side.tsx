'use client';

import { useEffect, useState } from 'react';
import { PlatformIcon, type Platform } from './platform-icons';

// Side panel for the example analytics dashboard: KPI tiles, a live signup feed, and the top post.
const feed: { src: string; what: string; icon: Platform }[] = [
  { src: 'Reddit', what: 'reply in r/SideProject', icon: 'reddit' },
  { src: 'X', what: 'launch thread, post 3', icon: 'x' },
  { src: 'Referral', what: 'shared by an early user', icon: 'referral' },
  { src: 'Hacker News', what: 'Show HN comment', icon: 'hn' },
  { src: 'LinkedIn', what: 'founder story post', icon: 'linkedin' },
  { src: 'Email', what: 'welcome sequence, day 2', icon: 'email' },
];

const spark = [12, 18, 15, 24, 31, 28, 42, 39, 55, 61, 58, 74];

export function AnalyticsSide() {
  const [head, setHead] = useState(0);
  const [ago, setAgo] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setInterval(() => { setHead((h) => (h + 1) % feed.length); setAgo(0); }, 2600);
    const s = window.setInterval(() => setAgo((a) => a + 1), 1000);
    return () => { window.clearInterval(t); window.clearInterval(s); };
  }, []);

  const rows = [0, 1, 2, 3].map((i) => feed[(head + feed.length - i) % feed.length]!);
  const max = Math.max(...spark);
  const pts = spark.map((v, i) => `${(i / (spark.length - 1)) * 100},${30 - (v / max) * 26}`).join(' ');

  return (
    <aside className="an-side" aria-label="Example metrics">
      <div className="an-kpis">
        <div className="an-kpi">
          <span className="an-kpi-k">Conversion</span>
          <span className="an-kpi-v">6.8%</span>
          <span className="an-kpi-d up">+1.2 pts</span>
        </div>
        <div className="an-kpi">
          <span className="an-kpi-k">Replies sent</span>
          <span className="an-kpi-v">142</span>
          <span className="an-kpi-d up">31 converted</span>
        </div>
      </div>

      <div className="an-block">
        <div className="an-block-h"><span>Signups per day</span><span className="an-up">↑ 38%</span></div>
        <svg className="an-spark" viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="sparkfill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" stopColor="#c6ff3d" stopOpacity=".35" />
              <stop offset="1" stopColor="#c6ff3d" stopOpacity="0" />
            </linearGradient>
          </defs>
          <polygon points={`0,32 ${pts} 100,32`} fill="url(#sparkfill)" />
          <polyline points={pts} fill="none" stroke="#c6ff3d" strokeWidth="1.6" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        </svg>
      </div>

      <div className="an-block an-feed-wrap">
        <div className="an-block-h"><span><i className="an-live" />Live signups</span></div>
        <ul className="an-feed">
          {rows.map((r, i) => (
            <li key={`${head}-${i}`} className={i === 0 ? 'is-new' : undefined}>
              <PlatformIcon name={r.icon} size={20} />
              <span className="an-feed-t"><b>{r.src}</b> {r.what}</span>
              <span className="an-feed-ago">{i === 0 ? `${ago}s` : `${i * 3}m`}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="an-block an-top">
        <span className="an-kpi-k">Top post this week <em className="ex-tag">Example</em></span>
        <p>“I built a WhatsApp bot that sends invoices for freelancers. Here’s what launching taught me.”</p>
        <span className="an-top-m">r/SideProject · <b>87 signups</b></span>
      </div>
    </aside>
  );
}
