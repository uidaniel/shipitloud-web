'use client';

import Link from 'next/link';
import gsap from 'gsap';
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { currencies, plans, type Currency } from '@/lib/site';

const missions: Record<string, string> = {
  free: 'Launchpad',
  launch_pass: 'Liftoff',
  grow: 'Orbit',
  scale: 'Escape velocity',
};

// Usage caps and inclusions, PRD sections 11 and 14.
const compare: { label: string; values: [string, string, string, string] }[] = [
  { label: 'Billing', values: ['Free', 'One-time, per product', 'Monthly', 'Monthly'] },
  { label: 'Demo videos', values: ['—', '3', '4 / month', '12 / month'] },
  { label: 'Images and posters', values: ['5 / month', '60', '60 / month', '200 / month'] },
  { label: 'AI drafts and replies', values: ['—', '100', '150 / month', '500 / month'] },
  { label: 'Keyword monitors', values: ['—', '3 for 30 days', '3', '10'] },
  { label: 'Products', values: ['1', '1', '1', '3'] },
  { label: 'Custom domain', values: ['—', '✓', '✓', '✓'] },
  { label: 'Remove ShipItLoud badge', values: ['—', '✓', '✓', '✓'] },
  { label: 'Automatic listening (HN, Bluesky, Product Hunt…)', values: ['—', '—', '✓', '✓'] },
  { label: 'X listening', values: ['—', '—', '—', '✓'] },
  { label: 'Ads autopilot with hard caps', values: ['—', '—', '—', '✓'] },
  { label: 'Weekly digest', values: ['—', '—', '✓', '✓'] },
];

function guessCurrency(): Currency {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz === 'Europe/London') return 'GBP';
    if (tz.startsWith('Europe/')) return 'EUR';
  } catch {}
  return 'USD';
}

function Price({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const last = useRef(value);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obj = { v: last.current };
    last.current = value;
    const tween = gsap.to(obj, {
      v: value,
      duration: 0.6,
      ease: 'power3.out',
      onUpdate: () => { el.textContent = String(Math.round(obj.v)); },
    });
    return () => { tween.kill(); };
  }, [value]);
  return <span ref={ref}>{value}</span>;
}

function spotlight(e: PointerEvent<HTMLElement>) {
  const r = e.currentTarget.getBoundingClientRect();
  e.currentTarget.style.setProperty('--mx', `${e.clientX - r.left}px`);
  e.currentTarget.style.setProperty('--my', `${e.clientY - r.top}px`);
}

export function PricingSpace() {
  const [cur, setCur] = useState<Currency>('USD');
  const [open, setOpen] = useState(false);
  const keys = Object.keys(currencies) as Currency[];
  useEffect(() => setCur(guessCurrency()), []);

  return (
    <div className="pricing">
      <div className="pricing-top" data-reveal>
        <div>
          <p className="eyebrow">Pricing</p>
          <h2 className="title">
            Pick your <span className="loud">trajectory.</span>
          </h2>
          <p className="kicker">Pay once to launch, or keep growing every month. No credits to count.</p>
        </div>
        <div className="cur" role="group" aria-label="Currency" style={{ ['--i' as string]: keys.indexOf(cur) }}>
          <span className="cur-pill" aria-hidden="true" />
          {keys.map((c) => (
            <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCur(c)}>
              {currencies[c]} {c}
            </button>
          ))}
        </div>
      </div>

      <div className="plans-grid">
        {plans.map((p) => (
          <article key={p.id} className={`plan-card${p.featured ? ' is-featured' : ''}`} onPointerMove={spotlight} data-plan>
            <div className="plan-inner">
              <div className="plan-head">
                <span className="plan-mission">{missions[p.id]}</span>
                {p.featured && <span className="plan-flag">Most popular</span>}
              </div>
              <h3 className="plan-name">{p.name}</h3>
              <div className="plan-price">
                <span className="plan-cur">{currencies[cur]}</span>
                <Price value={p.price[cur]} />
                <span className="plan-per">{p.period === 'month' ? '/ month' : p.period === 'one-time' ? 'one-time' : 'forever'}</span>
              </div>
              <p className="plan-sum">{p.summary}</p>
              <ul className="plan-list">
                {p.features.map((f) => <li key={f}>{f}</li>)}
              </ul>
              <Link className={`btn ${p.featured ? 'btn-lime' : 'btn-line'}`} href="/#join">
                {p.id === 'free' ? 'Start free at launch' : 'Join the waitlist'}
              </Link>
            </div>
          </article>
        ))}
      </div>

      <div className="perks" data-reveal>
        <div className="perk">
          <span className="perk-k">Guarantee</span>
          <p>Fewer than 25 high-intent conversations in your first 30 days on Grow? Your next month is free.</p>
        </div>
        <div className="perk">
          <span className="perk-k">Launch Pass bonus</span>
          <p>Your first month of Grow is free, so marketing keeps running after launch day.</p>
        </div>
      </div>

      <div className="compare">
        <button type="button" className="compare-toggle" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? 'Hide plan comparison' : 'Compare every plan'}
          <span aria-hidden="true" className="compare-chev">↓</span>
        </button>
        {open && (
          <div className="compare-wrap">
            <table className="compare-tbl">
              <thead>
                <tr>
                  <th scope="col"><span className="sr-only">Feature</span></th>
                  {plans.map((p) => <th key={p.id} scope="col">{p.name}</th>)}
                </tr>
              </thead>
              <tbody>
                {compare.map((row) => (
                  <tr key={row.label}>
                    <th scope="row">{row.label}</th>
                    {row.values.map((v, i) => <td key={i} className={v === '✓' ? 'yes' : v === '—' ? 'no' : ''}>{v}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      <p className="fine-print">Prices in USD, GBP and EUR. Sales tax and VAT are handled at checkout. Ad spend is paid to the ad platform, never to us.</p>
    </div>
  );
}
