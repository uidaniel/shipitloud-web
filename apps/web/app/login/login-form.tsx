'use client';

import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export function LoginForm({ next }: { next: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('sending');
    setError(null);
    const redirect = new URL('/auth/callback', window.location.origin);
    redirect.searchParams.set('next', next);
    const { error } = await supabaseBrowser().auth.signInWithOtp({ email, options: { emailRedirectTo: redirect.toString() } });
    if (error) {
      setError(error.message.includes('rate') ? 'Too many tries. Wait a minute and send again.' : error.message);
      setState('idle');
      return;
    }
    setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="pr-section" style={{ padding: '18px 20px' }}>
        <b style={{ display: 'block', fontSize: 15 }}>Check your email</b>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
          We sent a login link to <span style={{ color: 'var(--text)' }}>{email}</span>. Open it on this device.
        </p>
        <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" style={{ marginTop: 12, paddingLeft: 0 }} onClick={() => setState('idle')}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit}>
      <label className="sr-only" htmlFor="email">Email</label>
      <input id="email" className="pr-input" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
      <button className="pr-btn pr-btn-primary pr-btn-lg" disabled={state === 'sending'}>
        {state === 'sending' ? 'Sending…' : 'Email me a login link'}
      </button>
      {error && <p className="pr-error" role="alert">{error}</p>}
    </form>
  );
}
