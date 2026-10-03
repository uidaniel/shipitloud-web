'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';
import { GoogleButton, MIN_PASSWORD, PasswordInput, authError, callbackUrl } from '@/components/app/auth';

export function SignupForm({ next }: { next: string }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < MIN_PASSWORD) { setError(`Use at least ${MIN_PASSWORD} characters for your password.`); return; }
    setState('busy');
    const { data, error } = await supabaseBrowser().auth.signUp({
      email, password,
      options: { emailRedirectTo: callbackUrl(next), data: { has_password: true } },
    });
    if (error) { setError(authError(error.message)); setState('idle'); return; }
    // With email confirmation off, Supabase signs the user in straight away.
    if (data.session) { router.replace(next); router.refresh(); return; }
    setState('sent');
  }

  async function resend() {
    const { error } = await supabaseBrowser().auth.resend({ type: 'signup', email, options: { emailRedirectTo: callbackUrl(next) } });
    if (error) setError(authError(error.message)); else setResent(true);
  }

  if (state === 'sent') {
    return (
      <div className="pr-section pr-fade-in" style={{ padding: '18px 20px' }}>
        <b style={{ display: 'block', fontSize: 15 }}>Confirm your email</b>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', lineHeight: 1.5 }}>
          We sent a link to <span style={{ color: 'var(--text)' }}>{email}</span>. Open it to finish setting up. If you already have an account, just log in.
        </p>
        <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
          <button type="button" className="pr-btn pr-btn-sm" onClick={resend} disabled={resent}>{resent ? 'Sent again' : 'Send it again'}</button>
          <button type="button" className="pr-btn pr-btn-ghost pr-btn-sm" onClick={() => { setState('idle'); setResent(false); }}>Use a different email</button>
        </div>
        {error && <p className="pr-error" role="alert">{error}</p>}
      </div>
    );
  }

  const strength = password.length === 0 ? null : password.length < MIN_PASSWORD ? 'short' : /[^a-z]/i.test(password) && password.length >= 12 ? 'strong' : 'ok';
  return (
    <>
      <GoogleButton next={next} label="Sign up with Google" />
      <form onSubmit={submit}>
        <label className="pr-label" htmlFor="email">Email</label>
        <input id="email" name="email" className="pr-input" type="email" autoComplete="email" required autoFocus placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="pr-label" htmlFor="password">Password</label>
        <PasswordInput id="password" name="password" autoComplete="new-password" placeholder={`At least ${MIN_PASSWORD} characters`} value={password} onChange={(v) => { setPassword(v); setError(null); }} />
        {strength && (
          <div className={`pr-strength pr-strength-${strength}`} aria-live="polite">
            <i /><span>{strength === 'short' ? `${MIN_PASSWORD - password.length} more character${MIN_PASSWORD - password.length === 1 ? '' : 's'}` : strength === 'ok' ? 'Good. Longer is even better.' : 'Strong'}</span>
          </div>
        )}
        <button className="pr-btn pr-btn-primary pr-btn-lg" disabled={state === 'busy'} aria-busy={state === 'busy' || undefined}>
          {state === 'busy' && <span className="spin" />}{state === 'busy' ? 'Creating your account…' : 'Create account'}
        </button>
        {error && <p className="pr-error" role="alert">{error}</p>}
      </form>
    </>
  );
}
