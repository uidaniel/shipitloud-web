'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useId, useRef, useState, type FormEvent } from 'react';

// Hero CTA: one URL input + one button (lovable/resend references), then email + consent.
export function JoinForm({ onInk = false, meta = 'Free waitlist page · No card · Early access first' }: { onInk?: boolean; meta?: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const id = useId();
  const emailRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'url' | 'email'>('url');
  const [productUrl, setProductUrl] = useState('');
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function toEmail(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setStep('email');
    requestAnimationFrame(() => emailRef.current?.focus());
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) {
      setError('Tick the box so we can email you at launch.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          consent,
          productUrl,
          ref: params.get('ref'),
          utmSource: params.get('utm_source'),
          utmCampaign: params.get('utm_campaign'),
          referrer: document.referrer || null,
          company: new FormData(e.currentTarget).get('company'),
        }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) throw new Error(data.error ?? 'Something went wrong. Please try again.');
      router.push(`/w/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <div className={`join${onInk ? ' on-ink' : ''}`}>
      {step === 'url' ? (
        <form onSubmit={toEmail}>
          <div className="join-box">
            <label className="sr-only" htmlFor={`${id}-url`}>Your product URL</label>
            <input
              id={`${id}-url`}
              className="join-input"
              type="text"
              inputMode="url"
              autoComplete="url"
              placeholder="Paste your product URL"
              value={productUrl}
              onChange={(e) => setProductUrl(e.target.value)}
            />
            <button className="btn btn-primary" type="submit">Ship it loud</button>
          </div>
          {meta && <p className="join-meta mono">{meta}</p>}
        </form>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="join-box">
            <label className="sr-only" htmlFor={`${id}-email`}>Email</label>
            <input
              ref={emailRef}
              id={`${id}-email`}
              className="join-input"
              type="email"
              autoComplete="email"
              placeholder="you@company.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <input className="hp" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'Joining…' : 'Join the waitlist'}
            </button>
          </div>
          <p className="join-url">
            {productUrl ? <>We&apos;ll build your kit for <span className="mono">{productUrl}</span></> : 'No URL yet? That’s fine.'}
            <button type="button" onClick={() => setStep('url')}>Change</button>
          </p>
          <label className="join-consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              Email me about the launch and early access. Unsubscribe any time. See our <Link href="/privacy">privacy policy</Link>.
            </span>
          </label>
          {error && <p className="join-error" role="alert">{error}</p>}
        </form>
      )}
    </div>
  );
}
