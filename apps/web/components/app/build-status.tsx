'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const STEPS = ['Opening your site', 'Reading what you do', 'Finding your customers and their problems', 'Spotting alternatives people use', 'Learning how you sound'];

/** Shown while the worker builds the brand brain. Refreshes until it's ready. */
export function BuildingBrand({ site }: { site: string | null }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  useEffect(() => {
    const poll = setInterval(() => router.refresh(), 2500);
    const tick = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 2200);
    return () => { clearInterval(poll); clearInterval(tick); };
  }, [router]);
  return (
    <div className="pr-section pr-fade-in" aria-live="polite" aria-busy="true">
      <div className="pr-section-b" style={{ gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 600 }}>
          <span className="spin" style={{ color: 'var(--violet-soft)' }} />
          {site ? `Reading ${site.replace(/^https?:\/\//, '')}` : 'Working on it'}
        </div>
        <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 8 }}>
          {STEPS.map((s, i) => (
            <li key={s} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: i < step ? 'var(--muted)' : i === step ? 'var(--text)' : 'var(--faint)', transition: 'color .3s' }}>
              <span style={{ width: 16, textAlign: 'center', color: i < step ? 'var(--ok)' : undefined }}>{i < step ? '✓' : i === step ? '•' : ''}</span>
              {s}
            </li>
          ))}
        </ol>
        <div style={{ display: 'grid', gap: 8, marginTop: 6 }}>
          <div className="sk sk-line" style={{ width: '70%' }} />
          <div className="sk sk-line" style={{ width: '90%' }} />
          <div className="sk sk-line" style={{ width: '55%' }} />
        </div>
        <p className="pr-hint" style={{ margin: 0 }}>Usually under 30 seconds.</p>
      </div>
    </div>
  );
}
