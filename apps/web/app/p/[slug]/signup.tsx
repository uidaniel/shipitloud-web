'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type FormEvent } from 'react';

export function SignupForm({ slug, name, cta }: { slug: string; name: string; cta: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!consent) return setError('Tick the box so we can email you at launch.');
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          page: slug, email, consent,
          ref: params.get('ref'), utmSource: params.get('utm_source'), utmCampaign: params.get('utm_campaign'),
          referrer: document.referrer || null,
          company: new FormData(e.currentTarget).get('company'),
        }),
      });
      const data = (await res.json()) as { code?: string; error?: string };
      if (!res.ok || !data.code) throw new Error(data.error ?? 'Something went wrong. Please try again.');
      router.push(`/p/${slug}/s/${data.code}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
      setBusy(false);
    }
  }

  return (
    <form className="wp-form" onSubmit={submit} noValidate>
      <div className="wp-row">
        <label className="sr-only" htmlFor="wp-email">Email</label>
        <input id="wp-email" type="email" autoComplete="email" required placeholder="you@email.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: 'absolute', left: -9999, width: 1, height: 1, opacity: 0 }} />
        <button className="wp-btn" disabled={busy}>{busy && <span className="spin" aria-hidden="true" />}{busy ? 'Joining…' : cta}</button>
      </div>
      <label className="wp-consent">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        <span>Email me about the {name} launch and early access. Unsubscribe any time.</span>
      </label>
      {error && <p className="wp-error" role="alert">{error}</p>}
    </form>
  );
}
