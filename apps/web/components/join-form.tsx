'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { site } from '@/lib/site';

const launchDay = () => (site.launch.date ? new Date(`${site.launch.date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }) : null);

// Hero CTA (PRD v5): ShipItLoud has no waitlist. Before launch: an optional "Email me when it's live" box (one
// launch-day email, tagged prelaunch). At launch: one URL input and "Start free", straight into the 10-minute setup.
export function JoinForm({ onInk = false, meta }: { onInk?: boolean; meta?: string }) {
  return site.launch.live ? <StartForm onInk={onInk} meta={meta ?? 'Free analysis in about a minute · No card'} /> : <NotifyForm onInk={onInk} meta={meta} />;
}

const FITS = [['launching_soon', 'Launching soon'], ['already_live', 'Already live, need users'], ['exploring', 'Just exploring']] as const;

// Landing hero (PRD section 23): paste a URL → email + "Which fits you?" → the free growth analysis in about a minute.
function StartForm({ onInk, meta }: { onInk: boolean; meta: string }) {
  const router = useRouter();
  const id = useId();
  const [step, setStep] = useState<'url' | 'email'>('url');
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [fit, setFit] = useState<string | null>(null);
  const [tips, setTips] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = `/signup?next=${encodeURIComponent(`/app/new${url.trim() ? `?url=${encodeURIComponent(url.trim())}` : ''}`)}`;

  function toEmail(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setError('Paste your product’s link first.'); return; }
    setError(null);
    setStep('email');
  }
  async function analyse(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!fit) { setError('Pick the one that fits you.'); return; }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url, email, fit, consent: tips, company: new FormData(e.currentTarget).get('company') }) });
      const data = (await res.json()) as { id?: string | null; error?: string };
      if (!res.ok || !data.id) throw new Error(data.error ?? 'Something went wrong. Please try again.');
      router.push(`/a/${data.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className={`join${onInk ? ' on-ink' : ''}`}>
      <form onSubmit={toEmail}>
        <div className="join-box has-ico">
          <span className="join-ico" aria-hidden="true">
            <svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </span>
          <label className="sr-only" htmlFor={`${id}-url`}>Your product URL</label>
          <input id={`${id}-url`} className="join-input" type="text" inputMode="url" autoComplete="url" placeholder="Paste your product URL" value={url} onChange={(e) => { setUrl(e.target.value); setError(null); }} />
          <button className="btn btn-primary" type="submit">Analyse it free <span className="join-arrow" aria-hidden="true">→</span></button>
        </div>
        {error && step === 'url' && <p className="join-error" role="alert">{error}</p>}
        {meta && <p className="join-meta">{meta}</p>}
      </form>
      {step === 'email' && <AnalyseDialog url={url} fit={fit} setFit={setFit} email={email} setEmail={setEmail} tips={tips} setTips={setTips} busy={busy} error={error} setError={setError} signup={signup} onSubmit={analyse} onClose={() => { setStep('url'); setError(null); }} />}
    </div>
  );
}

// The popup after "Analyse it free": which fits you, email, then "See my analysis". Rendered on <body> so the hero's
// animations can't clip it; Esc or the backdrop closes it.
function AnalyseDialog(p: { url: string; fit: string | null; setFit: (v: string) => void; email: string; setEmail: (v: string) => void; tips: boolean; setTips: (v: boolean) => void; busy: boolean; error: string | null; setError: (v: string | null) => void; signup: string; onSubmit: (e: FormEvent<HTMLFormElement>) => void; onClose: () => void }) {
  const id = useId();
  const box = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') p.onClose();
      if (e.key === 'Tab' && box.current) {
        const f = [...box.current.querySelectorAll<HTMLElement>('input, button, a[href]')].filter((el) => !el.hasAttribute('disabled'));
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1)!.focus(); }
        else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0]!.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => box.current?.querySelector<HTMLElement>('input')?.focus());
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!mounted) return null;
  return createPortal(
    <div className="ja-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) p.onClose(); }}>
      <div ref={box} className="ja-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-t`}>
        <button type="button" className="ja-x" aria-label="Close" onClick={p.onClose}>×</button>
        <h2 id={`${id}-t`}>Your free growth analysis</h2>
        <p className="ja-sub">For <b>{p.url.replace(/^https?:\/\//, '').replace(/\/$/, '')}</b>. Ready in about a minute.</p>
        <form onSubmit={p.onSubmit} noValidate>
          <fieldset className="ja-fit">
            <legend>Which fits you?</legend>
            {FITS.map(([v, l]) => <label key={v}><input type="radio" name="fit" value={v} checked={p.fit === v} onChange={() => { p.setFit(v); p.setError(null); }} /><span>{l}</span></label>)}
          </fieldset>
          <label className="ja-label" htmlFor={`${id}-email`}>Your email</label>
          <input id={`${id}-email`} className="ja-input" type="email" autoComplete="email" placeholder="you@company.com" required value={p.email} onChange={(e) => { p.setEmail(e.target.value); p.setError(null); }} />
          <input className="hp" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
          <label className="ja-check">
            <input type="checkbox" checked={p.tips} onChange={(e) => p.setTips(e.target.checked)} />
            <span>Also send me growth tips now and then. Unsubscribe any time. See our <Link href="/privacy">privacy policy</Link>.</span>
          </label>
          {p.error && <p className="ja-error" role="alert">{p.error}</p>}
          <button className="btn btn-lime ja-go" type="submit" disabled={p.busy}>{p.busy ? 'Starting…' : 'See my analysis'}</button>
          <p className="ja-skip">Or <Link href={p.signup}>skip the preview and start free</Link>.</p>
        </form>
      </div>
    </div>,
    document.body,
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
