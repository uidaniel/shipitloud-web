'use client';

import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { authError, callbackUrl } from '@/components/app/auth';

export function ForgotForm({ initialEmail }: { initialEmail: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('busy'); setError(null);
    const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email, { redirectTo: callbackUrl('/reset-password') });
    // Same answer whether or not the account exists; only real failures (rate limits, network) show.
    if (error && !error.message.toLowerCase().includes('not found')) { setError(authError(error.message)); setState('idle'); return; }
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="pr-section pr-fade-in" style={{ padding: '18px 20px' }}>
        <b style={{ display: 'block', fontSize: 15 }}>Check your email</b>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
          If there&apos;s an account for <span style={{ color: 'var(--text)' }}>{email}</span>, a reset link is on its way. It works once and expires in an hour.
        </p>
        <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" style={{ marginTop: 12, paddingLeft: 0 }} onClick={() => setState('idle')}>Use a different email</button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="pr-label" htmlFor="email">Email</label>
      <input id="email" name="email" className="pr-input" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <button className="pr-btn pr-btn-primary pr-btn-lg" disabled={state === 'busy'} aria-busy={state === 'busy' || undefined}>
        {state === 'busy' && <span className="spin" />}{state === 'busy' ? 'Sending…' : 'Send reset link'}
      </button>
      {error && <p className="pr-error" role="alert">{error}</p>}
    </form>
  );
}
