'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { site } from '@/lib/site';

const launchDay = () => (site.launch.date ? new Date(`${site.launch.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : null);

// Hero CTA (PRD v5): ShipItLoud has no waitlist. Before launch: an optional "Email me when it's live" box (one
// launch-day email, tagged prelaunch). At launch: one URL input and "Start free", straight into the 10-minute setup.
export function JoinForm({ onInk = false, meta }: { onInk?: boolean; meta?: string }) {
  return site.launch.live ? <StartForm onInk={onInk} meta={meta ?? 'Free 10-minute setup · No card'} /> : <NotifyForm onInk={onInk} meta={meta} />;
}

function StartForm({ onInk, meta }: { onInk: boolean; meta: string }) {
  const router = useRouter();
  const id = useId();
  const [url, setUrl] = useState('');
  function go(e: FormEvent) {
    e.preventDefault();
    const next = `/app/new${url.trim() ? `?url=${encodeURIComponent(url.trim())}` : ''}`;
    router.push(`/signup?next=${encodeURIComponent(next)}`);
  }
  return (
    <div className={`join${onInk ? ' on-ink' : ''}`}>
      <form onSubmit={go}>
        <div className="join-box has-ico">
          <span className="join-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          <label className="sr-only" htmlFor={`${id}-url`}>Your product URL</label>
          <input id={`${id}-url`} className="join-input" type="text" inputMode="url" autoComplete="url" placeholder="Paste your product URL" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn btn-primary" type="submit">Start free <span className="join-arrow" aria-hidden="true">→</span></button>
        </div>
        {meta && <p className="join-meta">{meta}</p>}
      </form>
    </div>
  );
}

function NotifyForm({ onInk, meta }: { onInk: boolean; meta?: string }) {
  const params = useSearchParams();
  const id = useId();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const day = launchDay();

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) { setError('Tick the box so we can email you on launch day.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email, consent, prelaunch: true,
          utmSource: params.get('utm_source'), utmCampaign: params.get('utm_campaign'), referrer: document.referrer || null,
          company: new FormData(e.currentTarget).get('company'),
        }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) throw new Error(data.error ?? 'Something went wrong. Please try again.');
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className={`join${onInk ? ' on-ink' : ''}`}>
        <div className="join-done" role="status"><b>You’re on the list.</b> We’ll email you once{day ? `, on ${day},` : ''} when it’s live. Nothing else.</div>
      </div>
    );
  }
  return (
    <div className={`join${onInk ? ' on-ink' : ''}`}>
      <form onSubmit={submit} noValidate>
        <div className="join-box">
          <label className="sr-only" htmlFor={`${id}-email`}>Email</label>
          <input id={`${id}-email`} className="join-input" type="email" autoComplete="email" placeholder="you@company.com" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className="hp" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Email me when it’s live'}</button>
        </div>
        <label className="join-consent">
          <input type="checkbox" checked={consent} onChange={(e) => { setConsent(e.target.checked); setError(null); }} />
          <span>Email me once when ShipItLoud is live. See our <Link href="/privacy">privacy policy</Link>.</span>
        </label>
        {error && <p className="join-error" role="alert">{error}</p>}
        {meta && <p className="join-meta">{meta}</p>}
      </form>
    </div>
  );
}
