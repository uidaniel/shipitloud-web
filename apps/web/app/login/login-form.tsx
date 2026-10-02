'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { GoogleButton, PasswordInput, authError, callbackUrl } from '@/components/app/auth';

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<'password' | 'link'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [unconfirmed, setUnconfirmed] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState('busy'); setError(null); setUnconfirmed(false);
    const sb = supabaseBrowser();
    if (mode === 'password') {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) {
        setUnconfirmed(error.message.toLowerCase().includes('not confirmed'));
        setError(authError(error.message)); setState('idle'); return;
      }
      router.replace(next);
      router.refresh();
      return;
    }
    const { error } = await sb.auth.signInWithOtp({ email, options: { emailRedirectTo: callbackUrl(next), shouldCreateUser: false } });
    // Don't reveal whether an account exists: unknown emails see the same "check your email".
    if (error && !error.message.toLowerCase().includes('signups not allowed')) { setError(authError(error.message)); setState('idle'); return; }
    setState('sent');
  }

  async function resend() {
    const { error } = await supabaseBrowser().auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackUrl('/app') } });
    setError(error ? authError(error.message) : null);
    if (!error) setState('sent');
  }

  if (state === 'sent') {
    return (
      <div className="pr-section pr-fade-in" style={{ padding: '18px 20px' }}>
        <b style={{ display: 'block', fontSize: 15 }}>Check your email</b>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
          If there&apos;s an account for <span style={{ color: 'var(--text)' }}>{email}</span>, a link is on its way. Open it on this device.
        </p>
        <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" style={{ marginTop: 12, paddingLeft: 0 }} onClick={() => setState('idle')}>Back</button>
      </div>
    );
  }

  return (
    <>
      <GoogleButton next={next} />
      <form onSubmit={submit}>
        <label className="pr-label" htmlFor="email">Email</label>
        <input id="email" name="email" className="pr-input" type="email" autoComplete="email" required placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
        {mode === 'password' && (
          <>
            <div className="pr-label-row">
              <label className="pr-label" htmlFor="password">Password</label>
              <Link href={`/forgot${email ? `?email=${encodeURIComponent(email)}` : ''}`} className="pr-auth-link">Forgot password?</Link>
            </div>
            <PasswordInput id="password" name="password" autoComplete="current-password" value={password} onChange={setPassword} />
          </>
        )}
        <button className="pr-btn pr-btn-primary pr-btn-lg" disabled={state === 'busy'} aria-busy={state === 'busy' || undefined}>
          {state === 'busy' && <span className="spin" />}
          {mode === 'password' ? (state === 'busy' ? 'Logging in…' : 'Log in') : state === 'busy' ? 'Sending…' : 'Email me a login link'}
        </button>
        {error && <p className="pr-error" role="alert">{error}</p>}
        {unconfirmed && <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" onClick={resend}>Send the confirmation link again</button>}
      </form>
      <button type="button" className="pr-auth-switch" onClick={() => { setMode(mode === 'password' ? 'link' : 'password'); setError(null); }}>
        {mode === 'password' ? 'Email me a login link instead' : 'Use my password instead'}
      </button>
    </>
  );
}
